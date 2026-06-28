'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { useSigner } from '@/lib/signer';
import { suiClient } from '@/lib/suiClient';
import { DEEPBOOK, ENOKI_ENABLED } from '@/lib/env';
import { fmtSui, fmtUsd, shortAddr, suiFromMist } from '@/lib/format';

function useBalances(address: string | null) {
  return useQuery({
    queryKey: ['balances', address],
    enabled: !!address,
    refetchInterval: 5000,
    queryFn: async () => {
      const c = suiClient();
      const [sui, deep] = await Promise.all([
        c.getBalance({ owner: address!, coinType: '0x2::sui::SUI' }),
        c.getBalance({ owner: address!, coinType: DEEPBOOK.deepType }).catch(() => ({ totalBalance: '0' })),
      ]);
      return { sui: sui.totalBalance, deep: (deep as any).totalBalance ?? '0' };
    },
  });
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy path */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export default function WalletPage() {
  const { address, ready, busy, connect, faucet, disconnect } = useSigner();
  const { data, isFetching } = useBalances(address);
  const sui = data ? suiFromMist(data.sui) : 0;
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    if (!address) return;
    const ok = await copyText(address);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <AppShell title="Mandate wallet" subtitle="self-custodial · the agent can read it, only Move can authorize a transfer">
      <div className="flex flex-col gap-6 p-[30px] lg:flex-row">
        {/* balance */}
        <div className="flex flex-[1.2] flex-col border border-hairsoft p-[30px]">
          <div className="mb-4 font-mono text-[11px] font-semibold tracking-[0.14em] text-muted">SELF-CUSTODIAL BALANCE</div>
          <div className="font-sans text-[52px] font-extrabold leading-none tracking-tight text-cream">
            {fmtSui(data?.sui ?? 0)}
            <span className="text-[22px] text-muted"> SUI</span>
          </div>
          <div className="mt-2.5 font-mono text-[13px] text-approve">
            ≈ {fmtUsd(sui)} · funds never leave your control{isFetching ? ' · syncing…' : ''}
          </div>
          {data && Number(data.deep) > 0 && (
            <div className="mt-2 font-mono text-xs text-muted">{fmtSui(data.deep, 2)} DEEP held (from filled trades)</div>
          )}

          <div className="my-7 h-px bg-hairsoft" />
          <div className="mb-3.5 font-mono text-[11px] font-semibold tracking-[0.14em] text-muted">WALLET ADDRESS</div>
          <div className="flex items-center justify-between border border-hairsoft bg-panel px-4 py-3.5 font-mono text-[13px] text-cream">
            <span>{address ? shortAddr(address, 10, 8) : 'not connected'}</span>
            {address && (
              <button className="text-gold" onClick={onCopy}>
                {copied ? 'copied ✓' : 'copy'}
              </button>
            )}
          </div>
          <div className="mt-auto pt-6 font-mono text-xs leading-relaxed text-muted">
            The agent can read this wallet and propose trades from it · but only the Move policy can authorize a
            transfer. Custody never leaves your browser.
          </div>
        </div>

        {/* connect / fund */}
        <div className="flex flex-1 flex-col border border-hairsoft p-[30px]">
          <div className="mb-4 font-mono text-[11px] font-semibold tracking-[0.14em] text-muted">
            {ready ? 'TESTNET FUNDS' : 'SIGN IN'}
          </div>

          {!ready ? (
            <>
              <p className="mb-6 font-sans text-[15px] leading-relaxed text-[#cfd8ce]">
                {ENOKI_ENABLED
                  ? 'Sign in with Google · no wallet, no seed phrase, no SUI. Gas is sponsored.'
                  : 'Spin up a self-custodial testnet wallet in your browser. (Google / zkLogin onboarding activates once Enoki keys are set.)'}
              </p>
              <button
                disabled={busy}
                onClick={connect}
                className="w-full bg-gold py-4 font-sans text-sm font-extrabold text-ink disabled:opacity-60"
              >
                {ENOKI_ENABLED ? 'Continue with Google' : 'Create demo wallet'}
              </button>
            </>
          ) : (
            <>
              <div className="mb-4 border border-hairsoft bg-panel p-[18px]">
                <div className="mb-2.5 font-mono text-[10px] font-semibold text-muted">FAUCET</div>
                <div className="font-sans text-[34px] font-extrabold text-cream">{fmtSui(data?.sui ?? 0)} SUI</div>
              </div>
              <button
                disabled={busy}
                onClick={faucet}
                className="mb-3 w-full bg-gold py-4 font-sans text-sm font-extrabold text-ink disabled:opacity-60"
              >
                {busy ? 'Requesting…' : 'Get testnet SUI'}
              </button>
              <Link href="/mandate" className="w-full border border-hair py-3.5 text-center font-mono text-[13px] font-bold text-cream">
                Next: define the mandate →
              </Link>
              <button onClick={disconnect} className="mt-3 text-center font-mono text-[11px] text-dim hover:text-muted">
                disconnect
              </button>
            </>
          )}
          <div className="mt-auto pt-6 text-center font-mono text-[11px] leading-relaxed text-muted">
            Next: define what the agent may do.
          </div>
        </div>
      </div>
    </AppShell>
  );
}
