import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import type { Proposal } from '@sentinel/sdk';

// Reads the autonomous worker's proposal feed from Upstash (the REST token stays server-side here).
// Degrades gracefully to an empty feed when Upstash isn't configured, so the app runs without it.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type FeedItem = Proposal & { ts: number };

function redis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export async function GET(req: Request) {
  const mandateId = new URL(req.url).searchParams.get('mandateId') ?? process.env.AGENT_MANDATE_ID ?? '';
  const r = redis();
  if (!r || !mandateId) {
    return NextResponse.json({ configured: false, proposals: [], heartbeat: null });
  }
  try {
    const [proposals, heartbeat] = await Promise.all([
      r.lrange<FeedItem>(`sentinel:feed:${mandateId}`, 0, 29),
      r.get(`sentinel:hb:${mandateId}`),
    ]);
    return NextResponse.json({ configured: true, proposals: proposals ?? [], heartbeat: heartbeat ?? null });
  } catch (e: any) {
    return NextResponse.json({ configured: true, proposals: [], heartbeat: null, error: e?.message ?? String(e) });
  }
}
