import { SealClient, SessionKey, NoAccessError } from '@mysten/seal';
import { Transaction } from '@mysten/sui/transactions';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type { Signer } from '@mysten/sui/cryptography';
import { CLOCK_ID, SEAL_TESTNET_KEY_SERVERS } from './config';
import { encodeSealId, encodeSealIdHex } from './sealId';
import { LocalWitnessProvider } from './localWitness';
import {
  PolicyDeniedError,
  type AuthorizationProvider,
  type PaymentIntentFields,
  type WitnessMaterial,
} from './provider';

export interface SealProviderOptions {
  client: SuiJsonRpcClient;
  signer: Signer; // owner at setup; the requester at authorize (signs the SessionKey)
  packageId: string;
  mandateId: string;
  registryId: string;
  /** Source of the preimages (and the graceful fallback). */
  local: LocalWitnessProvider;
  keyServers?: string[];
  threshold?: number;
  /** How many nonces of preimage to pre-encrypt during setup(). */
  window?: number;
}

/**
 * Seal adapter (Model B): the user pre-encrypts each one-shot witness preimage under
 * `id = mandate_id || nonce`, gated by `seal_policy::seal_approve` (which routes through the SAME
 * `policy::check` as `payment::pay`). The agent can only obtain preimage_n by passing the key-server
 * DRY-RUN of seal_approve with its actual intent — so a rogue/over-cap intent is denied the secret
 * off-chain (and would re-abort on-chain). Seal gates the SECRET; Move stays the LAW.
 *
 * Key servers unreachable (not a policy denial) ⇒ fall back to LocalWitnessProvider; on-chain
 * enforcement never depends on committee uptime (locked Decision #1).
 */
export class SealMpcProvider implements AuthorizationProvider {
  readonly name = 'seal';
  private readonly seal: SealClient;
  private readonly threshold: number;
  private readonly blobs = new Map<string, Uint8Array>(); // nonce -> encryptedObject

  constructor(private readonly opts: SealProviderOptions) {
    const servers = opts.keyServers ?? SEAL_TESTNET_KEY_SERVERS;
    this.threshold = opts.threshold ?? 1;
    this.seal = new SealClient({
      suiClient: opts.client,
      serverConfigs: servers.map((objectId) => ({ objectId, weight: 1 })),
      verifyKeyServers: false,
    });
  }

  /** OWNER step: encrypt preimage_n for n in [0, window) under id = encode(mandate_id, n). */
  async setup(window = this.opts.window ?? 4): Promise<void> {
    for (let n = 0n; n < BigInt(window); n++) {
      const preimage = this.opts.local.preimage(n);
      const { encryptedObject } = await this.seal.encrypt({
        threshold: this.threshold,
        packageId: this.opts.packageId,
        id: encodeSealIdHex(this.opts.mandateId, n),
        data: preimage,
      });
      this.blobs.set(n.toString(), encryptedObject);
    }
  }

  async initialCommitment(): Promise<Uint8Array> {
    return this.opts.local.initialCommitment();
  }

  /** Build the seal_approve PTB the key servers dry-run to decide the release. */
  private approveTx(intent: PaymentIntentFields): Transaction {
    const tx = new Transaction();
    tx.moveCall({
      target: `${this.opts.packageId}::seal_policy::seal_approve`,
      arguments: [
        tx.pure.vector('u8', Array.from(encodeSealId(intent.mandateId, intent.nonce))),
        tx.object(intent.mandateId),
        tx.object(this.opts.registryId),
        tx.pure.address(intent.poolId),
        tx.pure.u8(intent.category),
        tx.pure.u64(intent.amount),
        tx.pure.address(intent.recipient),
        tx.pure.u64(intent.expiryMs),
        tx.object(CLOCK_ID),
      ],
    });
    return tx;
  }

  private async sessionKey(): Promise<SessionKey> {
    const address = this.opts.signer.toSuiAddress();
    const sk = await SessionKey.create({
      address,
      packageId: this.opts.packageId,
      ttlMin: 10,
      suiClient: this.opts.client,
    });
    const { signature } = await this.opts.signer.signPersonalMessage(sk.getPersonalMessage());
    await sk.setPersonalMessageSignature(signature);
    return sk;
  }

  async authorize(intent: PaymentIntentFields): Promise<WitnessMaterial> {
    const n = intent.nonce;
    const blob = this.blobs.get(n.toString());
    if (!blob) throw new Error(`no encrypted preimage for nonce ${n}; call setup() first`);

    const idHex = encodeSealIdHex(intent.mandateId, n);
    const tx = this.approveTx(intent);
    const txBytes = await tx.build({ client: this.opts.client, onlyTransactionKind: true });

    try {
      const sessionKey = await this.sessionKey();
      await this.seal.fetchKeys({ ids: [idHex], txBytes, sessionKey, threshold: this.threshold });
      const preimage = await this.seal.decrypt({ data: blob, sessionKey, txBytes });
      return { preimage, nonce: n, nextCommitment: this.opts.local.commitment(n + 1n) };
    } catch (e) {
      if (e instanceof NoAccessError) {
        // The key-server dry-run of seal_approve aborted: the policy denied this intent.
        throw new PolicyDeniedError('Seal denied key release: intent violates the mandate policy', e);
      }
      // Server unreachable / transient: degrade to local so on-chain enforcement still runs.
      console.warn(`[seal] key servers unavailable (${(e as Error).message}); falling back to local`);
      return this.opts.local.authorize(intent);
    }
  }
}
