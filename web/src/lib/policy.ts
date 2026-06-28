// Faithful TS mirror of the on-chain `policy::evaluate` order + error codes (errors.move).
// The LANDING simulator uses this for an instant, offline-safe verdict; the in-app screens
// (Proposal detail) dev-inspect the REAL `seal_approve` / `policy::evaluate` on-chain. The logic
// here is intentionally identical so the marketing demo can never imply something the chain won't.

export const E = {
  OK: 0,
  OVER_CAP: 1,
  CATEGORY: 2,
  MARKET: 3,
  EXPIRED: 4,
  REVOKED: 5,
  BAD_WITNESS: 6,
  REPLAY: 7,
  NONCE: 8,
} as const;

export const ABORT_LABEL: Record<number, string> = {
  [E.OVER_CAP]: 'E_OVER_CAP',
  [E.CATEGORY]: 'E_CATEGORY',
  [E.MARKET]: 'E_MARKET',
  [E.EXPIRED]: 'E_EXPIRED',
  [E.REVOKED]: 'E_REVOKED',
  [E.BAD_WITNESS]: 'E_BAD_WITNESS',
  [E.REPLAY]: 'E_REPLAY',
  [E.NONCE]: 'E_NONCE',
};

export interface SimState {
  cap: number;
  spent: number;
  nonce: number;
  lastSettledNonce: number | null;
}

export type SettleVerdict = { ok: true; label: string; detail: string; nonce: number };
export type AbortVerdict = { ok: false; code: number; label: string; detail: string };
export type Verdict = SettleVerdict | AbortVerdict;

/** Mirror of `policy::evaluate` for the budget dimension the landing exercises. */
export function evaluateBudget(s: SimState, amount: number): number {
  if (s.spent + amount > s.cap) return E.OVER_CAP;
  return E.OK;
}

export function propose(s: SimState, amount: number): { state: SimState; verdict: Verdict } {
  const code = evaluateBudget(s, amount);
  if (code !== E.OK) {
    const left = +(s.cap - s.spent).toFixed(2);
    return {
      state: s,
      verdict: {
        ok: false,
        code,
        label: ABORT_LABEL[code],
        detail: `MoveAbort(policy::check, ${code}) · ${amount.toFixed(2)} > ${left.toFixed(2)} left today`,
      },
    };
  }
  const nonce = s.nonce;
  const spent = +(s.spent + amount).toFixed(2);
  return {
    state: { ...s, spent, nonce: s.nonce + 1, lastSettledNonce: nonce },
    verdict: {
      ok: true,
      nonce,
      label: 'APPROVED',
      detail: `seal_approve ✓ · ${spent.toFixed(2)} ≤ ${s.cap.toFixed(2)}/day · nonce 0x${(0x4e1 + nonce).toString(16)}`,
    },
  };
}

export function replay(s: SimState): AbortVerdict {
  if (s.lastSettledNonce === null) {
    return { ok: false, code: -1, label: '·', detail: 'approve a trade first, then replay its authorization' };
  }
  const n = s.lastSettledNonce;
  return {
    ok: false,
    code: E.REPLAY,
    label: ABORT_LABEL[E.REPLAY],
    detail: `MoveAbort(payment::pay, 7) · nonce 0x${(0x4e1 + n).toString(16)} already consumed & rotated`,
  };
}

export const freshState = (cap = 50): SimState => ({ cap, spent: 0, nonce: 0, lastSettledNonce: null });
