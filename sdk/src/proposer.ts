// The keyless "Yield Hunter" brain · shared by the web UI route and the autonomous worker so the two
// can NEVER drift. It reads the on-chain mandate + live DeepBook state, asks DeepSeek for a trade within
// budget (deterministic heuristic fallback), and returns a PROPOSAL · pure data. It never signs, never
// holds a key. The browser later authorizes (witness) + signs; Move re-checks and enforces on settle.

import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { DEEPBOOK, CLOCK_ID } from './config';

const MIST = 1_000_000_000;
const MIST_BIG = 1_000_000_000n;
const MS_PER_DAY = 86_400_000n;

/** A proposal is PURE DATA the keyless agent emits. The agent never signs and never holds a key. */
export interface Proposal {
  id: string;
  market: string; // e.g. 'SUI/DEEP'
  poolId: string;
  category: number;
  amountMist: string; // quote (SUI) to spend
  nonce: string; // mandate nonce the proposal targets
  expiryMs: string;
  recipient: string;
  rationale: string;
  kind: 'compliant' | 'rogue-overcap' | 'replay';
  expectedOut?: string; // ≈ DEEP out (best-effort quote)
  source: 'deepseek' | 'heuristic';
}

export interface MandateState {
  owner: string;
  capMist: bigint;
  spentToday: bigint;
  dayEpoch: bigint;
  nonce: bigint;
  expiryMs: bigint;
  revoked: boolean;
  categories: number[];
  registryId: string;
}

function vecSetContents(v: any): number[] {
  const c = v?.fields?.contents ?? v?.contents ?? [];
  return (Array.isArray(c) ? c : []).map((x) => Number(x));
}

export async function readMandate(client: SuiJsonRpcClient, mandateId: string): Promise<MandateState> {
  const o = await client.getObject({ id: mandateId, options: { showContent: true } });
  const f = (o.data?.content as any)?.fields;
  if (!f) throw new Error('mandate not found');
  return {
    owner: f.owner,
    capMist: BigInt(f.daily_cap),
    spentToday: BigInt(f.spent_today),
    dayEpoch: BigInt(f.day_epoch),
    nonce: BigInt(f.nonce),
    expiryMs: BigInt(f.expiry_ms),
    revoked: !!f.revoked,
    categories: vecSetContents(f.allowed_categories),
    registryId: typeof f.registry_id === 'string' ? f.registry_id : f.registry_id?.id ?? '',
  };
}

/** Owner's SUI balance in mist (for sizing proposals to what the wallet can actually afford). */
export async function suiBalanceMist(client: SuiJsonRpcClient, owner: string): Promise<bigint> {
  const b = await client.getBalance({ owner, coinType: '0x2::sui::SUI' });
  return BigInt(b.totalBalance);
}

/** Rollover-aware spent-today (mirrors mandate::effective_spent). */
export function effectiveSpent(m: MandateState, nowMs: number): bigint {
  const day = BigInt(Math.floor(nowMs)) / MS_PER_DAY;
  return day !== m.dayEpoch ? 0n : m.spentToday;
}

export function remainingMist(m: MandateState, nowMs: number): bigint {
  const spent = effectiveSpent(m, nowMs);
  return m.capMist > spent ? m.capMist - spent : 0n;
}

/** Best-effort DeepBook quote: base (DEEP) out for `quoteMist` SUI in, via dev-inspect get_quantity_out. */
export async function quoteDeepOut(client: SuiJsonRpcClient, quoteMist: bigint): Promise<bigint | null> {
  try {
    const tx = new Transaction();
    tx.moveCall({
      target: `${DEEPBOOK.core}::pool::get_quantity_out`,
      typeArguments: [DEEPBOOK.deepType, DEEPBOOK.suiType],
      arguments: [tx.object(DEEPBOOK.deepSuiPool), tx.pure.u64(0n), tx.pure.u64(quoteMist), tx.object(CLOCK_ID)],
    });
    const res = await client.devInspectTransactionBlock({
      sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
      transactionBlock: tx,
    });
    const rv = (res as any).results?.[0]?.returnValues?.[0];
    if (!rv) return null;
    const bytes = Uint8Array.from(rv[0]);
    return BigInt(bcs.u64().parse(bytes));
  } catch {
    return null;
  }
}

async function deepseekAmount(
  key: string,
  remainingSui: number,
  midNote: string,
): Promise<{ sui: number; rationale: string } | null> {
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
    const j: any = await r.json();
    const txt = j.choices?.[0]?.message?.content ?? '';
    const parsed = JSON.parse(txt);
    const sui = Number(parsed.amountSui);
    if (!Number.isFinite(sui) || sui <= 0) return null;
    return { sui, rationale: String(parsed.rationale ?? 'spread capture on SUI/DEEP') };
  } catch {
    return null;
  }
}

export interface ProposeArgs {
  client: SuiJsonRpcClient;
  mandateId: string;
  /** DeepSeek API key; when absent the deterministic heuristic is used. */
  deepseekKey?: string;
  /** Cap the proposed size (SUI) so any faucet-funded approver can afford the coin input. 0/undefined = no cap. */
  maxSui?: number;
  /** Override "now" for tests; defaults to Date.now(). */
  now?: number;
}

export type ProposeResult = { proposal: Proposal } | { full: true; message: string };

/** Read mandate + live DeepBook, LLM-size a compliant proposal (heuristic fallback). Never signs. */
export async function proposeOnce(a: ProposeArgs): Promise<ProposeResult> {
  const { client, mandateId } = a;
  const m = await readMandate(client, mandateId);
  const now = a.now ?? Date.now();
  const remainingSui = Number(remainingMist(m, now)) / MIST;

  // Size to what the wallet can actually afford (coin-input spends real SUI; leave gas headroom),
  // not just the budget · otherwise a "compliant" trade fails on insufficient balance, not policy.
  const balanceSui = Number(await suiBalanceMist(client, m.owner)) / MIST;
  const affordable = Math.max(0, balanceSui - 0.05);
  // Cap to maxSui (when set) so a streamed proposal stays affordable for any approver, not just the owner.
  const ceiling = Math.min(remainingSui, affordable, a.maxSui && a.maxSui > 0 ? a.maxSui : Infinity);

  if (remainingSui <= 0.001) {
    return { full: true, message: 'Daily budget spent; the agent is holding until rollover.' };
  }
  if (affordable <= 0.001) {
    return { full: true, message: 'Wallet balance too low to trade; use the faucet on the Wallet screen.' };
  }

  // best-effort live quote for a reference 1-SUI clip
  const q = await quoteDeepOut(client, BigInt(MIST));
  const midNote = q ? `~${(Number(q) / MIST).toFixed(3)} DEEP per 1 SUI right now.` : '';

  const ds = await deepseekAmount(a.deepseekKey ?? '', ceiling, midNote);
  let sui: number;
  let rationale: string;
  let source: Proposal['source'];
  if (ds) {
    sui = Math.min(ds.sui, ceiling);
    rationale = ds.rationale;
    source = 'deepseek';
  } else {
    sui = Math.max(0.01, +(ceiling * 0.85).toFixed(3));
    rationale = `Spread capture on SUI/DEEP; sized to ${((sui / ceiling) * 100).toFixed(0)}% of the affordable budget.`;
    source = 'heuristic';
  }
  const amountMist = BigInt(Math.round(sui * MIST));
  const expectedOut = await quoteDeepOut(client, amountMist);

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
  return { proposal };
}

export interface TamperArgs {
  client: SuiJsonRpcClient;
  mandateId: string;
  kind: 'overcap' | 'replay';
  now?: number;
}

// Simulates a COMPROMISED agent. It still only PROPOSES; the Move policy is what stops it.
// over-cap: amount just above the remaining budget so the coin-split succeeds and Move aborts E_OVER_CAP
// (not an insufficient-balance failure). replay: a small compliant-sized amount the client rebuilds with
// a CONSUMED witness against the current nonce so it aborts E_REPLAY (see web lib/settle replaySettle).
export async function tamperProposal(a: TamperArgs): Promise<Proposal> {
  const { client, mandateId } = a;
  const m = await readMandate(client, mandateId);
  const now = a.now ?? Date.now();
  const k: Proposal['kind'] = a.kind === 'replay' ? 'replay' : 'rogue-overcap';

  // over-cap: remaining + 0.05 SUI (exceeds the cap, stays within a faucet-funded wallet).
  // replay: a small compliant-sized amount (the abort comes from the recycled witness, not the size).
  const overcap = remainingMist(m, now) + MIST_BIG / 20n;
  const amountMist = (k === 'replay' ? MIST_BIG / 100n : overcap).toString();

  return {
    id: `tamper-${now}`,
    market: 'SUI/DEEP',
    poolId: DEEPBOOK.deepSuiPool,
    category: 0,
    amountMist,
    nonce: m.nonce.toString(),
    expiryMs: m.expiryMs.toString(),
    recipient: m.owner,
    rationale:
      k === 'replay'
        ? 'TAMPERED: replaying an authorization that was already consumed and rotated.'
        : 'TAMPERED: ignoring the daily budget to overspend the treasury.',
    kind: k,
    source: 'heuristic',
  };
}
