import type { AuditRecord } from '@sentinel/sdk';

export interface AuditEntry {
  seq: number;
  blobId: string;
  record: AuditRecord;
  encrypted: boolean; // true = Seal-encrypted on Walrus; false = plaintext fallback (key servers unavailable)
}

const key = (mandateId: string) => `sentinel.audit.${mandateId}`;

export function getAudit(mandateId: string): AuditEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(key(mandateId)) ?? '[]');
  } catch {
    return [];
  }
}

export function addAudit(mandateId: string, entry: AuditEntry) {
  const all = getAudit(mandateId);
  all.unshift(entry);
  localStorage.setItem(key(mandateId), JSON.stringify(all.slice(0, 50)));
}

export const WALRUS_AGGREGATOR =
  process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR ?? 'https://aggregator.walrus-testnet.walrus.space';
export const blobUrl = (blobId: string) => `${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`;
