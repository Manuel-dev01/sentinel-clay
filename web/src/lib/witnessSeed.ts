import { LocalWitnessProvider, keccak256 } from '@sentinel/sdk';

const SEED_MSG = new TextEncoder().encode('sentinel-witness-seed-v1');

/**
 * Derive the one-shot witness provider from a personal-message signature. The seed lives ONLY in the
 * browser (the user's custody); the agent never sees it. Ed25519 signatures are deterministic, so the
 * same wallet always re-derives the same provider — the mandate's commitments stay reproducible.
 */
export async function deriveProvider(
  signMessage: (msg: Uint8Array) => Promise<{ signature: string; bytes: string }>,
): Promise<LocalWitnessProvider> {
  const { signature } = await signMessage(SEED_MSG);
  const seed = keccak256(new TextEncoder().encode(signature));
  return new LocalWitnessProvider(seed);
}
