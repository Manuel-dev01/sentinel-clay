'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sigil } from './Sigil';
import { useSigner } from '@/lib/signer';
import { useMandate } from '@/lib/mandateStore';
import { shortAddr } from '@/lib/format';

const NAV = [
  { href: '/wallet', label: 'Wallet' },
  { href: '/mandate', label: 'Mandate' },
  { href: '/agent', label: 'Agent' },
  { href: '/activity', label: 'Activity' },
  { href: '/policy', label: 'Policy' },
];

export function AppShell({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle?: React.ReactNode }) {
  const pathname = usePathname();
  const { address, label, mode } = useSigner();
  const { mandate } = useMandate();
  const armed = !!mandate;

  return (
    <div className="flex min-h-screen bg-forest">
      {/* sidebar */}
      <div className="flex w-[210px] flex-none flex-col border-r border-hairsoft bg-panel py-[22px]">
        <Link href="/" className="flex items-center gap-3 px-[22px] pb-[26px] no-underline">
          <Sigil size={22} bg="#0a2a20" />
          <div className="font-sans text-[15px] font-extrabold text-cream">SENTINEL</div>
        </Link>
        <div className="flex flex-col">
          {NAV.map((n) => {
            const active = pathname === n.href || pathname?.startsWith(n.href + '/');
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`px-[22px] py-[11px] font-sans text-[13px] font-semibold no-underline ${
                  active ? 'border-l-[3px] border-gold text-gold' : 'border-l-[3px] border-transparent text-muted hover:text-cream'
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </div>
        <div className={`mx-4 mt-auto border p-3.5 ${armed ? 'border-approve/30' : 'border-hairsoft'}`}>
          <div className={`mb-2 font-mono text-[10px] font-semibold tracking-[0.12em] ${armed ? 'text-approve' : 'text-muted'}`}>AGENT</div>
          <div className="flex items-center gap-2 font-mono text-xs font-semibold text-cream">
            <span className={`h-[7px] w-[7px] ${armed ? 'animate-pulseDot bg-approve' : 'bg-dim'}`} />
            {armed ? 'armed · hunting' : 'idle · not armed'}
          </div>
        </div>
      </div>

      {/* main */}
      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-hairsoft px-[30px] py-[18px]">
          <div>
            <div className="font-sans text-base font-bold text-cream">{title}</div>
            {subtitle && <div className="mt-1 font-mono text-xs text-muted">{subtitle}</div>}
          </div>
          <div className="flex items-center gap-2.5 font-mono text-xs">
            <span className="border border-hair px-3 py-2 text-muted">
              {address ? `${mode === 'enoki' ? 'zkLogin' : 'EOA'} ${shortAddr(address)}` : 'not connected'}
            </span>
            <span className="border border-gold/40 px-3 py-2 text-gold">SUI TESTNET</span>
          </div>
        </div>
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
