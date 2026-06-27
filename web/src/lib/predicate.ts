import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { suiClient } from './suiClient';
import { PACKAGE_ID, CLOCK_ID } from './env';
import { ABORT_LABEL, E } from './policy';
import type { MandateState } from './onchain';
import { effectiveSpent } from './onchain';
import type { Proposal } from './agentTypes';

export interface Check {
  key: string;
  label: string;
  pass: boolean;
  detail: string;
}

/** The REAL on-chain verdict: dev-inspect policy::evaluate (non-aborting, returns 0 or the E_* code). */
export async function evaluateOnChain(p: Proposal, mandate: { mandateId: string; registryId: string }): Promise<number> {
  const tx = new Transaction();
  const intent = tx.moveCall({
    target: `${PACKAGE_ID}::policy::new_intent`,
    arguments: [
      tx.pure.id(mandate.mandateId),
      tx.pure.id(p.poolId),
      tx.pure.u8(p.category),
      tx.pure.u64(BigInt(p.amountMist)),
      tx.pure.address(p.recipient),
      tx.pure.u64(BigInt(p.nonce)),
      tx.pure.u64(BigInt(p.expiryMs)),
    ],
  });
  tx.moveCall({
    target: `${PACKAGE_ID}::policy::evaluate`,
    arguments: [tx.object(mandate.mandateId), tx.object(mandate.registryId), intent, tx.object(CLOCK_ID)],
  });
  const res = await suiClient().devInspectTransactionBlock({ sender: p.recipient, transactionBlock: tx });
  const rv = (res as any).results?.[1]?.returnValues?.[0];
  if (!rv) throw new Error('evaluate returned nothing');
  return Number(bcs.u64().parse(Uint8Array.from(rv[0])));
}

/** Per-dimension PASS/FAIL for display (mirror of evaluate's order); the on-chain code above is the truth. */
export function buildChecks(m: MandateState, p: Proposal, nowMs: number, marketAllowed: boolean): Check[] {
  const amount = BigInt(p.amountMist);
  const spent = effectiveSpent(m, nowMs);
  const left = m.capMist > spent ? m.capMist - spent : 0n;
  const sui = (v: bigint) => (Number(v) / 1e9).toFixed(2);
  return [
    {
      key: 'budget',
      label: 'budget',
      pass: amount <= left,
      detail: `${sui(amount)} ${amount <= left ? '≤' : '>'} ${sui(left)} left`,
    },
    { key: 'category', label: 'asset class', pass: m.categories.includes(p.category), detail: `category ${p.category}` },
    { key: 'market', label: 'market', pass: marketAllowed, detail: p.market },
    { key: 'expiry', label: 'expiry', pass: BigInt(nowMs) <= BigInt(p.expiryMs), detail: 'now < expiry' },
    {
      key: 'nonce',
      label: 'nonce',
      pass: BigInt(p.nonce) === m.nonce,
      detail: `nonce ${p.nonce}${BigInt(p.nonce) === m.nonce ? ' current' : ' STALE/consumed'}`,
    },
  ];
}

export const codeLabel = (code: number) => (code === E.OK ? 'PASS' : ABORT_LABEL[code] ?? `E_${code}`);
