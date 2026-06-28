import { NextResponse } from 'next/server';
import { DEEPBOOK } from '@/lib/env';
import { readMandate, remainingMist } from '@/lib/onchain';
import type { Proposal } from '@/lib/agentTypes';

const MIST = 1_000_000_000n;

// Simulates a COMPROMISED agent for the demo. It still only PROPOSES; the Move policy is what stops it.
// over-cap: amount just above the remaining budget so the coin-split succeeds and Move aborts E_OVER_CAP
// (not an insufficient-balance failure). replay: flagged here; the client rebuilds it with a CONSUMED
// witness against the current nonce so it aborts E_REPLAY (see lib/settle replaySettle).
export async function POST(req: Request) {
  try {
    const { mandateId, kind } = await req.json();
    const m = await readMandate(mandateId);
    const now = Date.now();
    const k: Proposal['kind'] = kind === 'replay' ? 'replay' : 'rogue-overcap';

    // over-cap: remaining + 0.05 SUI (exceeds the cap, stays within a faucet-funded wallet).
    // replay: a small compliant-sized amount (the abort comes from the recycled witness, not the size).
    const overcap = remainingMist(m, now) + MIST / 20n;
    const amountMist = (k === 'replay' ? MIST / 100n : overcap).toString();

    const proposal: Proposal = {
      id: `tamper-${now}`,
      market: 'SUI/DEEP',
      poolId: DEEPBOOK.deepSuiPool,
      category: 0,
      amountMist,
      nonce: m.nonce.toString(),
      expiryMs: m.expiryMs.toString(),
      recipient: m.owner,
      rationale:
        k === 'replay'
          ? 'TAMPERED: replaying an authorization that was already consumed and rotated.'
          : 'TAMPERED: ignoring the daily budget to overspend the treasury.',
      kind: k,
      source: 'heuristic',
    };
    return NextResponse.json({ proposal });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
