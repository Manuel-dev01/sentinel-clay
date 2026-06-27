import { SealAuditLog, type AuditRecord } from '@sentinel/sdk';
import { toBase64 } from '@mysten/sui/utils';
import { suiClient } from './suiClient';
import { PACKAGE_ID } from './env';
import { addAudit, getAudit, blobUrl, type AuditEntry } from './auditStore';
import type { Proposal } from './agentTypes';

type SignMessage = (m: Uint8Array) => Promise<{ signature: string; bytes: string }>;

// SealAuditLog wants a @mysten/sui Signer; for encrypt it never calls it, for decrypt it needs
// toSuiAddress + signPersonalMessage. A small adapter satisfies both the demo keypair and zkLogin.
const adapter = (owner: string, signMessage: SignMessage) =>
  ({ toSuiAddress: () => owner, signPersonalMessage: (m: Uint8Array) => signMessage(m) }) as any;

function sealLog(mandateId: string, owner: string, signMessage: SignMessage) {
  return new SealAuditLog({ client: suiClient() as any, signer: adapter(owner, signMessage), packageId: PACKAGE_ID, mandateId });
}

/** Write a proposal+verdict to Walrus (Seal-encrypted if the key servers are reachable, else plaintext). */
export async function recordVerdict(opts: {
  mandateId: string;
  owner: string;
  signMessage: SignMessage;
  p: Proposal;
  verdict: 'APPROVED' | 'ABORTED';
  code?: number;
  txDigest?: string;
}): Promise<AuditEntry | null> {
  try {
    const seq = getAudit(opts.mandateId).length;
    const record: AuditRecord = {
      seq,
      intent: {
        mandateId: opts.mandateId,
        poolId: opts.p.poolId,
        category: opts.p.category,
        amount: BigInt(opts.p.amountMist),
        recipient: opts.p.recipient,
        nonce: BigInt(opts.p.nonce),
        expiryMs: BigInt(opts.p.expiryMs),
      },
      verdict: opts.verdict,
      code: opts.code,
      txDigest: opts.txDigest,
      ts: Date.now(),
    };

    let bytes: Uint8Array;
    let encrypted = true;
    try {
      bytes = await sealLog(opts.mandateId, opts.owner, opts.signMessage).encrypt(record);
    } catch (e) {
      console.warn('[audit] Seal encrypt unavailable; storing plaintext on Walrus', e);
      bytes = new TextEncoder().encode(JSON.stringify(record, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
      encrypted = false;
    }

    const res = await fetch('/api/audit/put', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: toBase64(bytes) }),
    }).then((r) => r.json());
    if (!res.blobId) throw new Error(res.error ?? 'no blobId');

    const entry: AuditEntry = { seq, blobId: res.blobId, record, encrypted };
    addAudit(opts.mandateId, entry);
    return entry;
  } catch (e) {
    console.warn('[audit] record failed', e);
    return null;
  }
}

/** Owner-decrypt a blob back from Walrus (encrypted entries only; best-effort). */
export async function decryptEntry(entry: AuditEntry, owner: string, signMessage: SignMessage): Promise<AuditRecord> {
  const buf = (await fetch(blobUrl(entry.blobId)).then((r) => r.arrayBuffer())) as ArrayBuffer;
  const bytes = new Uint8Array(buf);
  if (!entry.encrypted) return JSON.parse(new TextDecoder().decode(bytes));
  return sealLog(entry.record.intent.mandateId, owner, signMessage).decrypt(bytes, entry.seq);
}
