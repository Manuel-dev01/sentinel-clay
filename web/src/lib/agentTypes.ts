// A proposal is PURE DATA the keyless agent emits. The browser later authorizes (witness) + signs it;
// Move re-checks on settle. The agent never signs and never holds a key.
export interface Proposal {
  id: string;
  market: string; // e.g. 'SUI/DEEP'
  poolId: string;
  category: number;
  amountMist: string; // quote (SUI) to spend
  nonce: string; // mandate nonce the proposal targets
  expiryMs: string;
  recipient: string;
  rationale: string;
  kind: 'compliant' | 'rogue-overcap' | 'replay';
  expectedOut?: string; // ≈ DEEP out (best-effort quote)
  source: 'deepseek' | 'heuristic';
}
