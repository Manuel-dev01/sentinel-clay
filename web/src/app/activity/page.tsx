'use client';

import { AppShell } from '@/components/AppShell';

export default function ActivityPage() {
  return (
    <AppShell title="Policy enforcement" subtitle="every proposal + verdict, on-chain">
      <div className="p-[30px]">
        <div className="border border-hairsoft p-8 font-mono text-sm text-muted">
          The on-chain enforcement log (approved / aborted / settled, with tx digests) and the Walrus audit trail land
          here (Phase E–F).
        </div>
      </div>
    </AppShell>
  );
}
