import { NextResponse } from 'next/server';
import { DEEPBOOK } from '@/lib/env';
import { readMandate, remainingMist, quoteDeepOut } from '@/lib/onchain';
import type { Proposal } from '@/lib/agentTypes';

const MIST = 1_000_000_000;

// The keyless Yield Hunter. Reads on-chain mandate + DeepBook state, asks DeepSeek for a trade within
// budget (deterministic heuristic fallback), and returns a PROPOSAL — pure data. It never signs.
async function deepseekAmount(remainingSui: number, midNote: string): Promise<{ sui: number; rationale: string } | null> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        temperature: 0.7,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are "Yield Hunter v2", an autonomous agent that PROPOSES DeepBook spot trades on Sui for a treasury. ' +
              'You never hold keys; a Move policy enforces the budget. Propose ONE swap of SUI -> DEEP on the SUI/DEEP market ' +
              'that stays within the remaining daily budget. Respond ONLY as JSON: {"amountSui": number, "rationale": string}. ' +
              'amountSui must be > 0 and <= the remaining budget. Keep rationale to one short sentence about the edge (spread/arb/momentum).',
          },
          { role: 'user', content: `Remaining daily budget: ${remainingSui.toFixed(2)} SUI. Market: SUI/DEEP. ${midNote}` },
        ],
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const txt = j.choices?.[0]?.message?.content ?? '';
    const parsed = JSON.parse(txt);
    const sui = Number(parsed.amountSui);
    if (!Number.isFinite(sui) || sui <= 0) return null;
    return { sui, rationale: String(parsed.rationale ?? 'spread capture on SUI/DEEP') };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const { mandateId } = await req.json();
    if (!mandateId) return NextResponse.json({ error: 'mandateId required' }, { status: 400 });

    const m = await readMandate(mandateId);
    const now = Date.now();
    const remainingMistVal = remainingMist(m, now);
    const remainingSui = Number(remainingMistVal) / MIST;

    if (remainingSui <= 0.001) {
      return NextResponse.json({ full: true, message: 'Daily budget spent — the agent is holding until rollover.' });
    }

    // best-effort live quote for a reference 1-SUI clip
    const q = await quoteDeepOut(BigInt(MIST));
    const midNote = q ? `~${(Number(q) / MIST).toFixed(3)} DEEP per 1 SUI right now.` : '';

    const ds = await deepseekAmount(remainingSui, midNote);
    const cap = remainingSui;
    let sui: number;
    let rationale: string;
    let source: Proposal['source'];
    if (ds) {
      sui = Math.min(ds.sui, cap);
      rationale = ds.rationale;
      source = 'deepseek';
    } else {
      sui = Math.max(0.01, Math.min(cap, +(cap * 0.3).toFixed(2)));
      rationale = `0.3% spread on SUI/DEEP; sized to ${((sui / cap) * 100).toFixed(0)}% of remaining budget.`;
      source = 'heuristic';
    }
    const amountMist = BigInt(Math.round(sui * MIST));
    const expectedOut = await quoteDeepOut(amountMist);

    const proposal: Proposal = {
      id: `${m.nonce}-${now}`,
      market: 'SUI/DEEP',
      poolId: DEEPBOOK.deepSuiPool,
      category: 0,
      amountMist: amountMist.toString(),
      nonce: m.nonce.toString(),
      expiryMs: m.expiryMs.toString(),
      recipient: m.owner,
      rationale,
      kind: 'compliant',
      expectedOut: expectedOut?.toString(),
      source,
    };
    return NextResponse.json({ proposal });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
