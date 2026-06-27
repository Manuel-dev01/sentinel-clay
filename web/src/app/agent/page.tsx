'use client';

import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { useMandate } from '@/lib/mandateStore';
import { fmtSui, shortAddr } from '@/lib/format';

export default function AgentPage() {
  const { mandate } = useMandate();
  if (!mandate) {
    return (
      <AppShell title="Agent">
        <div className="p-[30px]">
          <div className="border border-hairsoft p-8 font-mono text-sm text-muted">
            No mandate armed yet.{' '}
            <Link href="/mandate" className="text-gold">
              Define a mandate →
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }
  return (
    <AppShell title="Yield Hunter v2" subtitle="armed · hunting">
      <div className="p-[30px]">
        <div className="mb-4 border border-approve/30 bg-panel p-6 font-mono text-sm text-sage">
          Mandate armed on-chain · cap {fmtSui(mandate.capMist)} SUI/day · mandate {shortAddr(mandate.mandateId)}.
          Live proposals land here (Phase D).
        </div>
      </div>
    </AppShell>
  );
}
