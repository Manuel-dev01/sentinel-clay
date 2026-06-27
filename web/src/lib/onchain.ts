import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { suiClient } from './suiClient';
import { DEEPBOOK, CLOCK_ID } from './env';

const MS_PER_DAY = 86_400_000n;

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

export async function readMandate(mandateId: string): Promise<MandateState> {
  const o = await suiClient().getObject({ id: mandateId, options: { showContent: true } });
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
export async function quoteDeepOut(quoteMist: bigint): Promise<bigint | null> {
  try {
    const tx = new Transaction();
    tx.moveCall({
      target: `${DEEPBOOK.core}::pool::get_quantity_out`,
      typeArguments: [DEEPBOOK.deepType, DEEPBOOK.suiType],
      arguments: [tx.object(DEEPBOOK.deepSuiPool), tx.pure.u64(0n), tx.pure.u64(quoteMist), tx.object(CLOCK_ID)],
    });
    const res = await suiClient().devInspectTransactionBlock({
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
