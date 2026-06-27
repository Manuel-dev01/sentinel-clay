import { NextResponse } from 'next/server';

const PUBLISHER = process.env.WALRUS_PUBLISHER ?? 'https://publisher.walrus-testnet.walrus.space';

// Store a Seal-encrypted audit record on Walrus (testnet publisher). The browser sends the ciphertext
// as base64; we PUT the raw bytes and return the immutable blobId. Routed server-side to avoid CORS.
export async function POST(req: Request) {
  try {
    const { data } = await req.json();
    if (!data) return NextResponse.json({ error: 'data (base64) required' }, { status: 400 });
    const bytes = Buffer.from(data, 'base64');
    const r = await fetch(`${PUBLISHER}/v1/blobs?epochs=5`, { method: 'PUT', body: bytes });
    const j = await r.json();
    if (!r.ok) return NextResponse.json({ error: JSON.stringify(j) }, { status: r.status });
    const blobId = j?.newlyCreated?.blobObject?.blobId ?? j?.alreadyCertified?.blobId;
    if (!blobId) return NextResponse.json({ error: 'no blobId in response', raw: j }, { status: 502 });
    return NextResponse.json({ blobId });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
