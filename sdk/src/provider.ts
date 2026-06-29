/**
 * The agent PROPOSES; it authorizes nothing. An `AuthorizationProvider` turns a proposed intent into
 * the one-shot witness material `payment::pay_*` needs - IF it is allowed to. `LocalWitnessProvider`
 * is the always-available default; `SealMpcProvider` gates the secret behind the on-chain policy via
 * Seal's key servers. Either way the Move contract re-checks and aborts: the provider is an
 * optimization, never the law.
 */

export interface PaymentIntentFields {
  mandateId: string;
  poolId: string;
  category: number;
  amount: bigint;
  recipient: string;
  nonce: bigint;
  expiryMs: bigint;
}

export interface WitnessMaterial {
  /** The one-shot secret for `nonce`; `keccak256(preimage)` equals the mandate's current commitment. */
  preimage: Uint8Array;
  nonce: bigint;
  /** `keccak256(preimage_{nonce+1})` - what `pay_*` rotates the commitment to. */
  nextCommitment: Uint8Array;
}

/** Thrown when a provider DENIES authorization because the intent violates the policy. */
export class PolicyDeniedError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'PolicyDeniedError';
  }
}

export interface AuthorizationProvider {
  readonly name: string;
  /** Witness material to authorize `intent`, or throws `PolicyDeniedError` if not permitted. */
  authorize(intent: PaymentIntentFields): Promise<WitnessMaterial>;
  /** The commitment to seed a mandate's initial `witness_commitment` (nonce 0). */
  initialCommitment(): Promise<Uint8Array>;
}
