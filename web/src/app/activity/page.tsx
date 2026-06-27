'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { useMandate } from '@/lib/mandateStore';
import { suiClient } from '@/lib/suiClient';
import { PACKAGE_ID, EXPLORER } from '@/lib/env';
import { fmtSui, shortAddr } from '@/lib/format';

interface Settled {
  digest: string;
  amount: string;
  baseOut: string;
  nonce: string;
  ts: number;
}

function useSettled(mandateId?: string) {
  return useQuery({
    queryKey: ['settled', mandateId],
    enabled: !!mandateId,
    refetchInterval: 8000,
    queryFn: async (): Promise<Settled[]> => {
      const res = await suiClient().queryEvents({
        query: { MoveEventType: `${PACKAGE_ID}::payment::PaymentSettled` },
        order: 'descending',
        limit: 50,
      });
      return (res.data ?? [])
        .filter((e: any) => e.parsedJson?.mandate_id === mandateId)
        .map((e: any) => ({
          digest: e.id.txDigest,
          amount: e.parsedJson.amount,
          baseOut: e.parsedJson.base_out,
          nonce: e.parsedJson.nonce,
          ts: Number(e.timestampMs ?? 0),
        }));
    },
  });
}

export default function ActivityPage() {
  const { mandate } = useMandate();
  const { data } = useSettled(mandate?.mandateId);

  if (!mandate) {
    return (
      <AppShell title="Policy enforcement">
        <div className="p-[30px]">
          <div className="border border-hairsoft p-8 font-mono text-sm text-muted">
            No mandate armed.{' '}
            <Link href="/mandate" className="text-gold">
              Define a mandate →
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const settled = data ?? [];

  return (
    <AppShell title="Policy enforcement" subtitle="every settled payment, on-chain · aborts revert and leave no state">
      <div className="flex flex-col gap-3 p-[30px]">
        <div className="border border-approve/30 bg-panel p-4 font-mono text-[13px] text-sage">
          Settled payments are read live from <span className="text-cream">PaymentSettled</span> events on
          package {shortAddr(PACKAGE_ID)}. Rogue / replayed trades <span className="text-abort">abort and revert</span> —
          they never settle, so they leave nothing here. That absence is the point.
        </div>

        {settled.length === 0 && (
          <div className="border border-dashed border-hairsoft p-8 text-center font-mono text-[13px] text-dim">
            No settled payments yet. Approve a compliant proposal on the{' '}
            <Link href="/agent" className="text-gold">
              Agent
            </Link>{' '}
            screen.
          </div>
        )}

        {settled.map((s) => (
          <div key={s.digest} className="flex items-center gap-5 border-l-[3px] border-approve bg-panel px-5 py-4">
            <div className="flex-1">
              <div className="font-mono text-[14px] text-cream">
                SWAP {fmtSui(s.amount)} SUI → {(Number(s.baseOut) / 1e6).toFixed(3)} DEEP <span className="text-muted">· SUI/DEEP</span>
              </div>
              <div className="font-mono text-[12px] text-approve">seal_approve · check-rotate-transfer · nonce {s.nonce}</div>
            </div>
            <div className="text-right">
              <span className="bg-approve px-2.5 py-1.5 font-mono text-[11px] font-bold tracking-[0.1em] text-ink">SETTLED</span>
              <a href={EXPLORER(s.digest)} target="_blank" rel="noreferrer" className="mt-2 block font-mono text-[11px] text-muted">
                {shortAddr(s.digest, 6, 4)} ↗
              </a>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
