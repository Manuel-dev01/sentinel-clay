import { LocalWitnessProvider } from '@sentinel/sdk';
import { AGENT_OWNER } from './env';

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

/**
 * Deterministic per (browser, owner): re-derives the same provider so commitments always reproduce.
 * The shared demo mandate (owner = AGENT_OWNER) uses the SDK's public DEFAULT_SEED instead, so ANY
 * visitor's browser can mint the valid one-shot witness for it and approve the streamed proposals.
 * (DEFAULT_SEED is not a key: Move still re-checks every payment, so it can only settle policy-compliant
 * trades against that one mandate, and proceeds are bound to AGENT_OWNER.)
 */
export function providerForOwner(owner: string): LocalWitnessProvider {
  if (AGENT_OWNER && owner.toLowerCase() === AGENT_OWNER.toLowerCase()) {
    return new LocalWitnessProvider(); // DEFAULT_SEED - matches the demo mandate's on-chain commitment
  }
  return new LocalWitnessProvider(getOrCreateSeed(owner));
}
