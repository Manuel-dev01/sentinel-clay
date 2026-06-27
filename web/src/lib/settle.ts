import { PaymentClient } from '@sentinel/sdk';
import { suiClient } from './suiClient';
import { providerForOwner } from './witnessSeed';
import { PACKAGE_ID, DEEPBOOK } from './env';
import type { Proposal } from './agentTypes';
import type { ArmedMandate } from './mandateStore';
import type { ExecResult } from './signer';

// Approve a proposal: re-derive the browser-held witness, build pay_real, and let the USER's signer
// sign it. The agent is not involved here. Move re-checks on-chain → compliant settles, rogue aborts.
export async function settleProposal(
  p: Proposal,
  mandate: ArmedMandate,
  signExecute: (tx: any) => Promise<ExecResult>,
): Promise<ExecResult> {
  const provider = providerForOwner(mandate.owner);
  const intent = {
    mandateId: mandate.mandateId,
    poolId: p.poolId,
    category: p.category,
    amount: BigInt(p.amountMist),
    recipient: p.recipient,
    nonce: BigInt(p.nonce),
    expiryMs: BigInt(p.expiryMs),
  };
  const witness = await provider.authorize(intent);
  const pc = new PaymentClient(suiClient() as any, {} as any); // execute() unused — we sign via the user's signer
  const tx = pc.buildPayReal({
    packageId: PACKAGE_ID,
    registryId: mandate.registryId,
    intent,
    witness,
    baseType: DEEPBOOK.deepType,
    quoteType: DEEPBOOK.suiType,
    minBaseOut: 0n,
  });
  return signExecute(tx);
}

/** Parse the Move abort code out of a failed-tx error message (…MoveAbort(…, <code>)…). */
export function abortCodeFromError(msg: string): number | null {
  const m = msg.match(/MoveAbort\([^)]*,\s*(\d+)\)/) ?? msg.match(/with code (\d+)/);
  return m ? Number(m[1]) : null;
}
