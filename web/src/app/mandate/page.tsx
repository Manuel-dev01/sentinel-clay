'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Transaction } from '@mysten/sui/transactions';
import { AppShell } from '@/components/AppShell';
import { useSigner } from '@/lib/signer';
import { useMandate } from '@/lib/mandateStore';
import { providerForOwner } from '@/lib/witnessSeed';
import { APP_REGISTRY_ID, CATEGORIES, EXPIRIES, MARKETS, PACKAGE_ID } from '@/lib/env';
import { fmtUsd, mistFromSui } from '@/lib/format';

const POLICY_SRC = `entry fun seal_approve(
  id, mandate: &Mandate, registry: &MarketRegistry,
  pool_id, category, amount, recipient, expiry_ms, clock,
) {
  let (mid, nonce) = seal_id::decode(id);
  assert!(mid == mandate.id && nonce == mandate.nonce, E_NONCE);
  policy::check(mandate, registry, &intent, clock);  // budget · category · market · expiry · nonce
}`;

export default function MandatePage() {
  const router = useRouter();
  const { address, ready, signExecute, signMessage } = useSigner();
  const { mandate, setMandate } = useMandate();

  const [step, setStep] = useState<'rules' | 'arm'>('rules');
  const [capSui, setCapSui] = useState(10);
  const [cats, setCats] = useState<number[]>([0, 1]);
  const [markets, setMarkets] = useState<string[]>([MARKETS[0].id]);
  const [expiryIdx, setExpiryIdx] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const toggle = (arr: number[], v: number) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const plain = useMemo(() => {
    const catNames = CATEGORIES.filter((c) => cats.includes(c.id)).map((c) => c.label.toLowerCase());
    const mkt = MARKETS.filter((m) => markets.includes(m.id)).map((m) => m.label);
    return `The agent may spend up to ${capSui} SUI/day, trading only ${catNames.join(' and ') || '—'} on ${
      mkt.join(' and ') || '—'
    }. This mandate expires in ${EXPIRIES[expiryIdx].label}. The agent can never hold a key.`;
  }, [capSui, cats, markets, expiryIdx]);

  async function arm() {
    if (!address) return;
    setBusy(true);
    setErr('');
    try {
      const provider = providerForOwner(address);
      const commitment = await provider.initialCommitment();
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::mandate::new_mandate`,
        arguments: [
          tx.pure.id(APP_REGISTRY_ID),
          tx.pure.u64(mistFromSui(capSui)),
          tx.pure.vector('u8', cats),
          tx.pure.u64(BigInt(Date.now() + EXPIRIES[expiryIdx].ms)),
          tx.pure.vector('u8', Array.from(commitment)),
        ],
      });
      const res = await signExecute(tx);
      const created = (res.objectChanges ?? []).find(
        (c: any) => c.type === 'created' && String(c.objectType).includes('::mandate::Mandate'),
      );
      if (!created) throw new Error('mandate not created (tx ' + res.digest + ')');
      setMandate({
        registryId: APP_REGISTRY_ID,
        mandateId: created.objectId,
        owner: address,
        capMist: mistFromSui(capSui).toString(),
        categories: cats,
        markets,
        expiryMs: String(Date.now() + EXPIRIES[expiryIdx].ms),
        agentName: 'Yield Hunter v2',
        armedAt: Date.now(),
      });
      router.push('/agent');
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <AppShell title="Define mandate">
        <div className="p-[30px]">
          <div className="border border-hairsoft p-8 font-mono text-sm text-muted">
            Connect a wallet first.{' '}
            <Link href="/wallet" className="text-gold">
              Go to Wallet →
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const chip = (active: boolean) =>
    `font-mono text-[13px] font-semibold px-3.5 py-2.5 cursor-pointer ${
      active ? 'text-cream border border-gold' : 'text-dim border border-dashed border-hair'
    }`;

  return (
    <AppShell title={step === 'rules' ? 'Define mandate' : 'Arm the agent'} subtitle={step === 'rules' ? 'compiles to an on-chain Move policy' : 'review · sign once · go live'}>
      <div className="flex flex-col gap-5 p-[26px] lg:flex-row">
        {step === 'rules' ? (
          <>
            <div className="flex flex-[1.3] flex-col gap-4">
              <div className="border border-hairsoft p-[22px]">
                <div className="mb-4 flex items-baseline justify-between">
                  <div className="font-mono text-[11px] font-semibold tracking-[0.12em] text-muted">MAX PER-DAY BUDGET</div>
                  <div className="font-sans text-[28px] font-extrabold text-gold">{capSui.toFixed(0)} SUI</div>
                </div>
                <input type="range" min={1} max={50} step={1} value={capSui} onChange={(e) => setCapSui(+e.target.value)} className="w-full" />
                <div className="mt-2.5 flex justify-between font-mono text-[11px] text-muted">
                  <span>1 SUI</span>
                  <span>{fmtUsd(capSui)} / day · 50 SUI cap</span>
                </div>
              </div>

              <div className="border border-hairsoft p-[22px]">
                <div className="mb-4 font-mono text-[11px] font-semibold tracking-[0.12em] text-muted">ALLOWED ASSET CATEGORIES</div>
                <div className="flex flex-wrap gap-2.5">
                  {CATEGORIES.map((c) => (
                    <span key={c.id} className={chip(cats.includes(c.id))} onClick={() => setCats((a) => toggle(a, c.id))}>
                      {c.label}
                    </span>
                  ))}
                  <span className="border border-dashed border-hair px-3.5 py-2.5 font-mono text-[13px] font-semibold text-dim">Memecoins · off</span>
                  <span className="border border-dashed border-hair px-3.5 py-2.5 font-mono text-[13px] font-semibold text-dim">LP tokens · off</span>
                </div>
              </div>

              <div className="border border-hairsoft p-[22px]">
                <div className="mb-4 font-mono text-[11px] font-semibold tracking-[0.12em] text-muted">ALLOWED DEEPBOOK MARKETS</div>
                <div className="flex flex-wrap gap-2.5">
                  {MARKETS.map((m) => {
                    const on = markets.includes(m.id);
                    return (
                      <span
                        key={m.id}
                        onClick={() => setMarkets((a) => (a.includes(m.id) ? a.filter((x) => x !== m.id) : [...a, m.id]))}
                        className={`cursor-pointer px-3.5 py-2.5 font-mono text-[13px] font-semibold ${on ? 'border border-gold text-cream' : 'border border-hair bg-panel text-muted'}`}
                      >
                        {m.label}
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between border border-hairsoft p-[22px]">
                <div className="font-mono text-[11px] font-semibold tracking-[0.12em] text-muted">EXPIRY</div>
                <div className="flex gap-2">
                  {EXPIRIES.map((e, i) => (
                    <span
                      key={e.label}
                      onClick={() => setExpiryIdx(i)}
                      className={`cursor-pointer px-3.5 py-2.5 font-mono text-xs font-semibold ${i === expiryIdx ? 'border border-gold text-cream' : 'border border-hairsoft bg-panel text-muted'}`}
                    >
                      {e.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-1 flex-col bg-gold p-[26px]">
              <div className="mb-[18px] font-mono text-[11px] font-semibold tracking-[0.12em] text-[#8a6620]">IN PLAIN WORDS</div>
              <div className="font-sans text-[17px] font-semibold leading-relaxed text-ink">{plain}</div>
              <button
                onClick={() => setStep('arm')}
                disabled={!cats.length || !markets.length}
                className="mt-auto w-full bg-ink py-4 font-sans text-sm font-extrabold text-gold disabled:opacity-50"
              >
                Continue to arm
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-[1.2] flex-col overflow-hidden border border-hairsoft">
              <div className="flex items-center justify-between border-b border-hairsoft bg-panel px-[18px] py-3.5">
                <div className="font-mono text-xs text-muted">seal_policy.move</div>
                <div className="font-mono text-[11px] text-approve">on-chain · {PACKAGE_ID.slice(0, 8)}…</div>
              </div>
              <pre className="flex-1 overflow-auto p-[22px] font-mono text-[12.5px] leading-[1.7] text-sage">{POLICY_SRC}</pre>
            </div>
            <div className="flex flex-1 flex-col gap-4">
              <div className="flex flex-col gap-3.5 border border-hairsoft p-[22px]">
                {[
                  ['budget', `${capSui} SUI / day`],
                  ['assets', CATEGORIES.filter((c) => cats.includes(c.id)).map((c) => c.key).join(' · ')],
                  ['markets', MARKETS.filter((m) => markets.includes(m.id)).map((m) => m.label).join(' · ')],
                  ['expiry', EXPIRIES[expiryIdx].label],
                  ['agent', 'Yield Hunter v2'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between font-mono text-[13px]">
                    <span className="text-muted">{k}</span>
                    <span className="text-cream">{v}</span>
                  </div>
                ))}
              </div>
              <div className="border border-approve/30 bg-panel p-5 font-mono text-[13px] leading-relaxed text-sage">
                Arming grants the agent a <span className="text-cream">proposer role only</span>. It receives no key and
                no signing authority. You can revoke instantly.
              </div>
              {err && <div className="border border-abort/40 bg-[#2a1410] p-3 font-mono text-[12px] text-abort">{err}</div>}
              <div className="mt-auto flex flex-col gap-3">
                <button onClick={arm} disabled={busy} className="w-full bg-gold py-[17px] font-sans text-[15px] font-extrabold text-ink disabled:opacity-60">
                  {busy ? 'Arming…' : 'Arm mandate · sign once'}
                </button>
                <button onClick={() => setStep('rules')} className="w-full border border-hair py-3.5 font-mono text-[13px] font-bold text-[#cfd8ce]">
                  Back to rules
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
