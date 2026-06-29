import { NextResponse } from 'next/server';
import { tamperProposal } from '@sentinel/sdk';
import { suiClient } from '@/lib/suiClient';

// Thin wrapper over the shared SDK tamper builder. Simulates a COMPROMISED agent that still only
// PROPOSES; the Move policy is what stops it (E_OVER_CAP / E_REPLAY on settle).
export async function POST(req: Request) {
  try {
    const { mandateId, kind } = await req.json();
    if (!mandateId) return NextResponse.json({ error: 'mandateId required' }, { status: 400 });

    const proposal = await tamperProposal({
      client: suiClient(),
      mandateId,
      kind: kind === 'replay' ? 'replay' : 'overcap',
    });
    return NextResponse.json({ proposal });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
