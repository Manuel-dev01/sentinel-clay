import { NextResponse } from 'next/server';
import { proposeOnce } from '@sentinel/sdk';
import { suiClient } from '@/lib/suiClient';

// Thin wrapper over the shared SDK "Yield Hunter" brain (proposeOnce) so the manual UI button and the
// autonomous Render worker run the IDENTICAL read + LLM-decide logic. It returns a PROPOSAL · pure data.
// It never signs.
export async function POST(req: Request) {
  try {
    const { mandateId } = await req.json();
    if (!mandateId) return NextResponse.json({ error: 'mandateId required' }, { status: 400 });

    const res = await proposeOnce({
      client: suiClient(),
      mandateId,
      deepseekKey: process.env.DEEPSEEK_API_KEY,
    });
    if ('full' in res) return NextResponse.json({ full: true, message: res.message });
    return NextResponse.json({ proposal: res.proposal });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
