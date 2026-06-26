import { bcs } from '@mysten/sui/bcs';
import { keccak256 } from './keccak.js';
import { DEFAULT_SEED } from './config.js';
import type { AuthorizationProvider, PaymentIntentFields, WitnessMaterial } from './provider.js';

/**
 * Deterministic, always-available provider — the demo guarantee. A user-held `seed` derives every
 * one-shot preimage; `keccak256(preimage_n)` is the on-chain commitment for nonce n. Reproduces
 * `payment::commitment_of` exactly, so witnesses it mints always verify on-chain.
 *
 * It does NOT itself enforce policy — it trusts its caller and the on-chain `payment::pay` is the
 * law. (SealMpcProvider adds the off-chain policy gate on top of these same preimages.)
 */
export class LocalWitnessProvider implements AuthorizationProvider {
  readonly name = 'local';
  constructor(private readonly seed: Uint8Array = DEFAULT_SEED) {}

  preimage(n: bigint): Uint8Array {
    const nb = bcs.u64().serialize(n).toBytes();
    const data = new Uint8Array(this.seed.length + nb.length);
    data.set(this.seed, 0);
    data.set(nb, this.seed.length);
    return keccak256(data);
  }

  commitment(n: bigint): Uint8Array {
    return keccak256(this.preimage(n));
  }

  async initialCommitment(): Promise<Uint8Array> {
    return this.commitment(0n);
  }

  async authorize(intent: PaymentIntentFields): Promise<WitnessMaterial> {
    const n = intent.nonce;
    return { preimage: this.preimage(n), nonce: n, nextCommitment: this.commitment(n + 1n) };
  }
}
