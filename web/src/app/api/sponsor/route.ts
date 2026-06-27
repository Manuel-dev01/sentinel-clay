import { NextResponse } from 'next/server';

const ENOKI = 'https://api.enoki.mystenlabs.com/v1';

// Step 1 of gas-free settlement: Enoki sponsors a transaction (server-side, using the SECRET key).
// Returns the full sponsored tx bytes (for the wallet to sign) + the digest.
export async function POST(req: Request) {
  const key = process.env.ENOKI_SECRET_KEY;
  if (!key) return NextResponse.json({ error: 'ENOKI_SECRET_KEY not set' }, { status: 500 });
  try {
    const { transactionKindBytes, sender } = await req.json();
    const r = await fetch(`${ENOKI}/transaction-blocks/sponsor`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ network: 'testnet', transactionBlockKindBytes: transactionKindBytes, sender }),
    });
    const j = await r.json();
    if (!r.ok) return NextResponse.json({ error: j?.errors?.[0]?.message ?? JSON.stringify(j) }, { status: r.status });
    return NextResponse.json({ bytes: j.data.bytes, digest: j.data.digest });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
