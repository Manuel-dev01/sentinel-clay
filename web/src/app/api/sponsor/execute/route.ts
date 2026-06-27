import { NextResponse } from 'next/server';

const ENOKI = 'https://api.enoki.mystenlabs.com/v1';

// Step 2 of gas-free settlement: submit the user's signature; Enoki executes the sponsored tx.
export async function POST(req: Request) {
  const key = process.env.ENOKI_SECRET_KEY;
  if (!key) return NextResponse.json({ error: 'ENOKI_SECRET_KEY not set' }, { status: 500 });
  try {
    const { digest, signature } = await req.json();
    const r = await fetch(`${ENOKI}/transaction-blocks/sponsor/${digest}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ signature }),
    });
    const j = await r.json();
    if (!r.ok) return NextResponse.json({ error: j?.errors?.[0]?.message ?? JSON.stringify(j) }, { status: r.status });
    return NextResponse.json({ digest: j.data.digest });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
