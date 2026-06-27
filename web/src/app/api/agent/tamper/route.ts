import { NextResponse } from 'next/server';
import { DEEPBOOK } from '@/lib/env';
import { readMandate } from '@/lib/onchain';
import type { Proposal } from '@/lib/agentTypes';

// Simulates a COMPROMISED agent for the demo. It still only PROPOSES — the Move policy is what stops it.
// `over-cap`: an intent far above the daily budget. `replay`: reuse of an already-consumed nonce.
export async function POST(req: Request) {
  try {
    const { mandateId, kind } = await req.json();
    const m = await readMandate(mandateId);
    const now = Date.now();
    const k: Proposal['kind'] = kind === 'replay' ? 'replay' : 'rogue-overcap';

    // 10x the daily cap → guaranteed E_OVER_CAP; replay re-uses the previous (consumed) nonce.
    const amountMist = (m.capMist * 10n).toString();
    const nonce = k === 'replay' ? (m.nonce > 0n ? (m.nonce - 1n).toString() : m.nonce.toString()) : m.nonce.toString();

    const proposal: Proposal = {
      id: `tamper-${now}`,
      market: 'SUI/DEEP',
      poolId: DEEPBOOK.deepSuiPool,
      category: 0,
      amountMist,
      nonce,
      expiryMs: m.expiryMs.toString(),
      recipient: m.owner,
      rationale:
        k === 'replay'
          ? 'TAMPERED: replaying a signed approval that was already consumed.'
          : 'TAMPERED: ignoring the daily budget and draining the treasury.',
      kind: k,
      source: 'heuristic',
    };
    return NextResponse.json({ proposal });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
