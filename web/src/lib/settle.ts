import { PaymentClient } from '@sentinel/sdk';
import { suiClient } from './suiClient';
import { providerForOwner } from './witnessSeed';
import { readMandate } from './onchain';
import { PACKAGE_ID, DEEPBOOK } from './env';
import type { Proposal } from './agentTypes';
import type { ArmedMandate } from './mandateStore';
import type { ExecResult } from './signer';

function payClient() {
  return new PaymentClient(suiClient() as any, {} as any); // execute() unused; we sign via the user's signer
}

// Approve a proposal: re-derive the browser-held witness for the CURRENT mandate nonce (robust to drift),
// build pay_real, and let the USER's signer sign it. The agent is not involved. Move re-checks on-chain
// → compliant settles, rogue/over-cap aborts.
export async function settleProposal(
  p: Proposal,
  mandate: ArmedMandate,
  signExecute: (tx: any, opts?: { expectRevert?: boolean }) => Promise<ExecResult>,
): Promise<ExecResult> {
  const m = await readMandate(mandate.mandateId);
  const provider = providerForOwner(mandate.owner);
  const intent = {
    mandateId: mandate.mandateId,
    poolId: p.poolId,
    category: p.category,
    amount: BigInt(p.amountMist),
    recipient: p.recipient,
    nonce: m.nonce, // current on-chain nonce, not the (possibly stale) proposal nonce
    expiryMs: BigInt(p.expiryMs),
  };
  const witness = await provider.authorize(intent);
  const tx = payClient().buildPayReal({
    packageId: PACKAGE_ID,
    registryId: mandate.registryId,
    intent,
    witness,
    baseType: DEEPBOOK.deepType,
    quoteType: DEEPBOOK.suiType,
    minBaseOut: 0n,
  });
  // A non-compliant (rogue/over-cap) proposal is expected to abort: submit it so the revert COMMITS
  // on-chain (explorer-viewable) rather than being thrown by the sponsor/auto-budget dry-run.
  return signExecute(tx, { expectRevert: p.kind !== 'compliant' });
}

// Replay attack: a FRESH intent at the current nonce, but signed with an ALREADY-CONSUMED witness
// (preimage for nonce 0). policy::check passes (the intent is compliant + current nonce), then the
// witness check aborts E_REPLAY because witness.nonce != mandate.nonce. Needs ≥1 prior settle.
export async function replaySettle(
  p: Proposal,
  mandate: ArmedMandate,
  signExecute: (tx: any, opts?: { expectRevert?: boolean }) => Promise<ExecResult>,
): Promise<ExecResult> {
  const m = await readMandate(mandate.mandateId);
  if (m.nonce === 0n) throw new Error('Approve a compliant trade first, then replay its authorization.');
  const provider = providerForOwner(mandate.owner);
  const intent = {
    mandateId: mandate.mandateId,
    poolId: p.poolId,
    category: p.category,
    amount: BigInt(p.amountMist),
    recipient: p.recipient,
    nonce: m.nonce, // current → passes the policy nonce gate
    expiryMs: BigInt(p.expiryMs),
  };
  const witness = {
    preimage: provider.preimage(0n), // a consumed authorization
    nonce: 0n,
    nextCommitment: provider.commitment(m.nonce + 1n),
  };
  const tx = payClient().buildPayReal({
    packageId: PACKAGE_ID,
    registryId: mandate.registryId,
    intent,
    witness,
    baseType: DEEPBOOK.deepType,
    quoteType: DEEPBOOK.suiType,
    minBaseOut: 0n,
  });
  // A replay is expected to abort (E_REPLAY): commit it on-chain so the abort is explorer-viewable.
  return signExecute(tx, { expectRevert: true });
}

/** Parse the Move abort code out of a failed-tx error message. Covers both the executed-tx form
 *  (`…MoveAbort(…, <code>)…`) and the resolution/dry-run form (`MoveAbort in 5th command, abort code: 1`). */
export function abortCodeFromError(msg: string): number | null {
  const m =
    msg.match(/MoveAbort\([^)]*,\s*(\d+)\)/) ??
    msg.match(/abort code:?\s*(\d+)/i) ??
    msg.match(/with code (\d+)/);
  return m ? Number(m[1]) : null;
}
