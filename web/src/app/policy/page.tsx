'use client';

import { AppShell } from '@/components/AppShell';
import { PACKAGE_ID, EXPLORER_OBJ } from '@/lib/env';

export default function PolicyPage() {
  return (
    <AppShell title="Move policy" subtitle="the law every payment runs through">
      <div className="p-[30px]">
        <div className="mb-4 border border-hairsoft bg-panel p-6 font-mono text-[13px] leading-relaxed text-sage">
          <div className="mb-2 text-muted">PACKAGE</div>
          <a className="text-gold" href={EXPLORER_OBJ(PACKAGE_ID)} target="_blank" rel="noreferrer">
            {PACKAGE_ID}
          </a>
          <div className="mt-4 text-cream">
            policy::check is the single predicate both seal_approve (off-chain dry-run) and payment::pay (on-chain
            settlement) call — so an off-chain verdict can never diverge from on-chain enforcement.
          </div>
        </div>
      </div>
    </AppShell>
  );
}
