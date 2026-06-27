import { SealClient, SessionKey } from '@mysten/seal';
import { Transaction } from '@mysten/sui/transactions';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type { Signer } from '@mysten/sui/cryptography';
import { SEAL_TESTNET_KEY_SERVERS } from './config';
import { encodeSealId, encodeSealIdHex } from './sealId';
import type { PaymentIntentFields } from './provider';

export interface AuditRecord {
  seq: number;
  intent: PaymentIntentFields;
  verdict: 'APPROVED' | 'ABORTED';
  code?: number; // errors::E_* on abort
  txDigest?: string;
  ts: number;
}

const bigintReplacer = (_k: string, v: unknown) => (typeof v === 'bigint' ? v.toString() : v);

/**
 * Confidential audit log + agent memory (the "Both" half). Each proposal+verdict record is encrypted
 * under Seal `id = mandate_id || seq`, gated by `seal_policy::seal_approve_owner` — only the mandate
 * OWNER can decrypt. The ciphertext is what would be written to Walrus (Stage 5); here we produce it
 * and prove the owner-only decrypt roundtrip.
 */
export class SealAuditLog {
  private readonly seal: SealClient;
  private readonly threshold: number;

  constructor(
    private readonly opts: {
      client: SuiJsonRpcClient;
      signer: Signer; // the mandate owner
      packageId: string;
      mandateId: string;
      keyServers?: string[];
      threshold?: number;
    },
  ) {
    this.threshold = opts.threshold ?? 1;
    this.seal = new SealClient({
      suiClient: opts.client,
      serverConfigs: (opts.keyServers ?? SEAL_TESTNET_KEY_SERVERS).map((objectId) => ({
        objectId,
        weight: 1,
      })),
      verifyKeyServers: false,
    });
  }

  /** Encrypt a record (and the agent memory blob, identically) -> the bytes you'd store on Walrus. */
  async encrypt(record: AuditRecord): Promise<Uint8Array> {
    const data = new TextEncoder().encode(JSON.stringify(record, bigintReplacer));
    const { encryptedObject } = await this.seal.encrypt({
      threshold: this.threshold,
      packageId: this.opts.packageId,
      id: encodeSealIdHex(this.opts.mandateId, record.seq),
      data,
    });
    return encryptedObject;
  }

  private async ownerSessionKey(): Promise<SessionKey> {
    const sk = await SessionKey.create({
      address: this.opts.signer.toSuiAddress(),
      packageId: this.opts.packageId,
      ttlMin: 10,
      suiClient: this.opts.client,
    });
    const { signature } = await this.opts.signer.signPersonalMessage(sk.getPersonalMessage());
    await sk.setPersonalMessageSignature(signature);
    return sk;
  }

  /** Owner-only decrypt: the key servers dry-run `seal_approve_owner` (ctx.sender == mandate.owner). */
  async decrypt(encrypted: Uint8Array, seq: number): Promise<AuditRecord> {
    const idHex = encodeSealIdHex(this.opts.mandateId, seq);
    const tx = new Transaction();
    tx.moveCall({
      target: `${this.opts.packageId}::seal_policy::seal_approve_owner`,
      arguments: [
        tx.pure.vector('u8', Array.from(encodeSealId(this.opts.mandateId, seq))),
        tx.object(this.opts.mandateId),
      ],
    });
    const txBytes = await tx.build({ client: this.opts.client, onlyTransactionKind: true });
    const sessionKey = await this.ownerSessionKey();
    await this.seal.fetchKeys({ ids: [idHex], txBytes, sessionKey, threshold: this.threshold });
    const plain = await this.seal.decrypt({ data: encrypted, sessionKey, txBytes });
    return JSON.parse(new TextDecoder().decode(plain)) as AuditRecord;
  }
}
