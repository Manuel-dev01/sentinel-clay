// Sentinel autonomous Yield Hunter · the off-chain agent that makes the product claim TRUE: it runs
// 24/7, ticks on an interval, reads the on-chain mandate + live DeepBook, asks the LLM for a trade
// within budget, and STREAMS proposals to a shared feed (Upstash Redis) the web UI renders live.
//
// It holds NO key and NEVER signs. A proposal is pure data; the user authorizes (witness) + signs in
// the browser; Move re-checks and enforces on settle. Compromised? Over-cap / replayed proposals are
// aborted on-chain regardless - which is exactly what the periodic "tamper" tick demonstrates.

import 'dotenv/config';
import { Redis } from '@upstash/redis';
import { makeClient, readMandate, proposeOnce, tamperProposal, type Proposal } from '@sentinel/sdk';

const MIST = 1_000_000_000;

const MANDATE_ID = required('AGENT_MANDATE_ID');
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || undefined;
const TICK_MS = int(process.env.TICK_MS, 12_000);
const ROGUE_EVERY = int(process.env.ROGUE_EVERY, 6); // every Nth tick streams a tampered proposal
const MAX_SUI = Number(process.env.AGENT_MAX_SUI || 0) || undefined; // cap proposal size so approvers afford it
const FEED_MAX = 30;
const HB_TTL_S = Math.max(30, Math.ceil((TICK_MS * 3) / 1000));

const FEED_KEY = `sentinel:feed:${MANDATE_ID}`;
const HB_KEY = `sentinel:hb:${MANDATE_ID}`;

const redis = Redis.fromEnv(); // UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
const client = makeClient(); // SUI_RPC_URL or testnet default

type FeedItem = Proposal & { ts: number };
type Heartbeat = {
  ts: number;
  tick: number;
  status: 'live' | 'holding' | 'error';
  source?: Proposal['source'];
  message?: string;
};

async function heartbeat(hb: Heartbeat) {
  await redis.set(HB_KEY, hb, { ex: HB_TTL_S });
}

async function pushProposal(p: Proposal) {
  const item: FeedItem = { ...p, ts: Date.now() };
  await redis.lpush(FEED_KEY, item);
  await redis.ltrim(FEED_KEY, 0, FEED_MAX - 1);
}

async function tick(n: number) {
  const m = await readMandate(client, MANDATE_ID);
  const now = Date.now();

  if (m.revoked || now > Number(m.expiryMs)) {
    const message = m.revoked ? 'Mandate revoked; agent stood down.' : 'Mandate expired; agent stood down.';
    console.log(`[tick ${n}] holding · ${message}`);
    await heartbeat({ ts: now, tick: n, status: 'holding', message });
    return;
  }

  // Every ROGUE_EVERY-th tick, stream a COMPROMISED proposal (alternating over-cap / replay) so the
  // feed always carries a fresh on-chain-abort case for the demo. It still only proposes; Move stops it.
  if (ROGUE_EVERY > 0 && n % ROGUE_EVERY === 0) {
    const kind = (n / ROGUE_EVERY) % 2 === 0 ? 'replay' : 'overcap';
    const p = await tamperProposal({ client, mandateId: MANDATE_ID, kind });
    await pushProposal(p);
    console.log(`[tick ${n}] TAMPER ${kind} · ${(Number(p.amountMist) / MIST).toFixed(3)} SUI`);
    await heartbeat({ ts: now, tick: n, status: 'live', source: p.source });
    return;
  }

  const res = await proposeOnce({ client, mandateId: MANDATE_ID, deepseekKey: DEEPSEEK_KEY, maxSui: MAX_SUI });
  if ('full' in res) {
    console.log(`[tick ${n}] holding · ${res.message}`);
    await heartbeat({ ts: now, tick: n, status: 'holding', message: res.message });
    return;
  }

  const p = res.proposal;
  await pushProposal(p);
  console.log(
    `[tick ${n}] propose ${(Number(p.amountMist) / MIST).toFixed(3)} SUI · ${p.source} · ${p.rationale}`,
  );
  await heartbeat({ ts: now, tick: n, status: 'live', source: p.source });
}

async function main() {
  console.log(
    `Sentinel Yield Hunter online · mandate ${MANDATE_ID} · tick ${TICK_MS}ms · rogue every ${ROGUE_EVERY} · ` +
      `LLM ${DEEPSEEK_KEY ? 'deepseek' : 'heuristic-only'}`,
  );
  let n = 0;
  // First tick immediately, then on the interval.
  for (;;) {
    n += 1;
    try {
      await tick(n);
    } catch (e: any) {
      const message = e?.message ?? String(e);
      console.error(`[tick ${n}] error · ${message}`);
      try {
        await heartbeat({ ts: Date.now(), tick: n, status: 'error', message });
      } catch {
        /* heartbeat is best-effort */
      }
    }
    await sleep(TICK_MS);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
function int(v: string | undefined, d: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : d;
}
function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env ${name}. See agent/.env.example.`);
    process.exit(1);
  }
  return v;
}

main();
