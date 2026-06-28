import { LocalWitnessProvider } from '@sentinel/sdk';

// The one-shot witness seed lives ONLY in this browser (the user's custody); the agent never sees it.
// It is a random 32-byte seed kept in localStorage keyed by owner · NOT derived from a signature, because
// zkLogin signatures rotate per session (different ephemeral key) and would not reproduce the mandate's
// on-chain commitment after re-login. A leaked seed can still only authorize POLICY-COMPLIANT trades
// (Move re-checks every payment), so it can never overspend or drain · a witness is not a key.
function getOrCreateSeed(owner: string): Uint8Array {
  const k = `sentinel.seed.${owner.toLowerCase()}`;
  const existing = typeof window !== 'undefined' ? localStorage.getItem(k) : null;
  if (existing) {
    return Uint8Array.from(existing.split(',').map((n) => parseInt(n, 10)));
  }
  const seed = new Uint8Array(32);
  crypto.getRandomValues(seed);
  if (typeof window !== 'undefined') localStorage.setItem(k, Array.from(seed).join(','));
  return seed;
}

/** Deterministic per (browser, owner): re-derives the same provider so commitments always reproduce. */
export function providerForOwner(owner: string): LocalWitnessProvider {
  return new LocalWitnessProvider(getOrCreateSeed(owner));
}
