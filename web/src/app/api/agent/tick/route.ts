import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { proposeOnce, tamperProposal, type Proposal } from '@sentinel/sdk';
import { suiClient } from '@/lib/suiClient';

// Self-driving tick: makes the agent autonomous WITHOUT a separate always-on worker. The /agent page
// pings this on an interval; an Upstash lock debounces so only ~one tick per LOCK_S runs no matter how
// many viewers there are. The winner generates ONE proposal (or a tampered one every ROGUE_EVERY) and
// streams it to the same Upstash feed the page reads. Keyless: it only proposes, never signs.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

const MIST = 1_000_000_000;
const LOCK_S = Math.max(5, Math.floor(Number(process.env.TICK_MS ?? 12000) / 1000));
const ROGUE_EVERY = Math.max(0, Math.floor(Number(process.env.ROGUE_EVERY ?? 6)));
const MAX_SUI = Number(process.env.AGENT_MAX_SUI ?? 0.05);
const FEED_MAX = 30;

function redis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export async function GET(req: Request) {
  const mandateId = new URL(req.url).searchParams.get('mandateId') ?? process.env.AGENT_MANDATE_ID ?? '';
  const r = redis();
  if (!r || !mandateId) return NextResponse.json({ ok: false, reason: 'not-configured' });

  const feedKey = `sentinel:feed:${mandateId}`;
  const hbKey = `sentinel:hb:${mandateId}`;
  const now = Date.now();
  try {
    // Debounce: only the request that wins the lock generates a proposal this window. Inside the try so
    // a misconfigured Upstash token degrades to a clean JSON error instead of a 500.
    const got = await r.set(`sentinel:tick:lock:${mandateId}`, '1', { nx: true, ex: LOCK_S });
    if (got !== 'OK') return NextResponse.json({ ok: true, skipped: true });

    const n = await r.incr(`sentinel:tickn:${mandateId}`);
    let p: Proposal;
    if (ROGUE_EVERY > 0 && n % ROGUE_EVERY === 0) {
      const kind = (Math.floor(n / ROGUE_EVERY)) % 2 === 0 ? 'replay' : 'overcap';
      p = await tamperProposal({ client: suiClient(), mandateId, kind });
    } else {
      const res = await proposeOnce({
        client: suiClient(),
        mandateId,
        deepseekKey: process.env.DEEPSEEK_API_KEY,
        maxSui: MAX_SUI,
      });
      if ('full' in res) {
        await r.set(hbKey, { ts: now, tick: n, status: 'holding', message: res.message }, { ex: LOCK_S * 3 });
        return NextResponse.json({ ok: true, holding: true, message: res.message });
      }
      p = res.proposal;
    }
    await r.lpush(feedKey, { ...p, ts: now });
    await r.ltrim(feedKey, 0, FEED_MAX - 1);
    await r.set(hbKey, { ts: now, tick: n, status: 'live', source: p.source }, { ex: LOCK_S * 3 });
    return NextResponse.json({ ok: true, ticked: true, kind: p.kind, source: p.source });
  } catch (e: any) {
    await r.set(hbKey, { ts: now, status: 'error', message: e?.message ?? String(e) }, { ex: LOCK_S * 3 }).catch(() => {});
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) });
  }
}
