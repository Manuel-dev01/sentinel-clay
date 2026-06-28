import Link from 'next/link';
import { Sigil } from '@/components/Sigil';
import { PolicySimulator } from '@/components/PolicySimulator';
import { CountUp } from '@/components/CountUp';

const ML = 'font-mono text-xs font-semibold tracking-[0.16em] text-gold';

function Nav() {
  return (
    <div className="sticky top-0 z-50 border-b border-hair bg-forest">
      <div className="mx-auto flex max-w-[1180px] items-center justify-between px-10 py-[18px]">
        <div className="flex items-center gap-3">
          <Sigil size={26} />
          <div className="font-sans text-lg font-extrabold tracking-tight text-cream">SENTINEL</div>
        </div>
        <div className="flex items-center gap-8">
          <a className="font-sans text-sm font-medium text-[#cfd8ce]">Product</a>
          <a className="font-sans text-sm font-medium text-[#cfd8ce]">Policy</a>
          <a className="font-sans text-sm font-medium text-[#cfd8ce]">Docs</a>
          <Link href="/wallet" className="bg-gold px-[18px] py-[11px] font-sans text-[13px] font-bold text-ink">
            Launch app
          </Link>
        </div>
      </div>
    </div>
  );
}

function Stat({ value, label, accent }: { value: React.ReactNode; label: string; accent?: boolean }) {
  return (
    <div className="flex-1 border-r border-hair px-10 py-[30px] last:border-r-0">
      <div className="font-sans text-[40px] font-black leading-none tracking-tight text-cream">{value}</div>
      <div className="mt-2 font-mono text-[11px] font-semibold tracking-[0.1em] text-muted">{label}</div>
    </div>
  );
}

function PathStep({ n, title, body, accent }: { n: string; title: string; body: string; accent: string }) {
  return (
    <div className="flex-1 border-r border-hair px-[30px] py-[30px] last:border-r-0">
      <div className="font-sans text-[32px] font-black leading-none" style={{ color: accent }}>
        {n}
      </div>
      <div className="mt-[18px] font-sans text-[19px] font-bold leading-snug text-cream">{title}</div>
      <p className="mt-2.5 font-sans text-sm leading-relaxed text-sage">{body}</p>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="w-full overflow-x-hidden">
      <Nav />

      {/* HERO · the budget is the hero */}
      <div className="mx-auto max-w-[1180px] px-10 pb-[76px] pt-[72px]">
        <div className={`${ML} mb-7`}>DAILY BUDGET · ENFORCED ON-CHAIN</div>
        <div className="mb-[18px] flex items-end justify-between">
          <div className="font-sans text-[132px] font-black leading-[0.8] tracking-[-0.05em] text-cream">
            <CountUp to={48} prefix="$" />
            <span className="text-[60px] text-[#7fa08f]">.20</span>
          </div>
          <div className="pb-4 font-mono text-[26px] font-bold text-muted">of $50.00</div>
        </div>
        <div className="relative mb-3.5 h-[26px] overflow-hidden border border-hair bg-panel">
          <div className="absolute bottom-0 left-0 top-0 bg-gold" style={{ width: '96.4%' }} />
          <div
            className="absolute bottom-0 right-0 top-0"
            style={{ width: '3.6%', background: 'repeating-linear-gradient(45deg,#2A1410,#2A1410 6px,#3a1c16 6px,#3a1c16 12px)' }}
          />
        </div>
        <div className="mb-12 flex justify-between font-mono text-xs text-muted">
          <span>$0 spent today</span>
          <span className="text-abort">a $500 trade → blocked here</span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-10">
          <div>
            <h1 className="m-0 font-sans text-[52px] font-extrabold leading-[1.02] tracking-tight text-cream">
              A treasury that
              <br />
              cannot be overspent.
            </h1>
            <p className="mt-[22px] max-w-[520px] font-sans text-lg leading-relaxed text-[#cfd8ce]">
              An AI agent hunts yield on DeepBook and proposes trades. A Move policy enforces your budget on
              every one · the agent only proposes, and never holds a key.
            </p>
            <div className="mt-8 flex items-center gap-3.5">
              <Link href="/wallet" className="bg-gold px-7 py-[17px] font-sans text-[15px] font-bold text-ink">
                Arm your mandate
              </Link>
              <a href="#sim" className="border border-hair px-[26px] py-4 font-sans text-[15px] font-semibold text-cream">
                Try the policy
              </a>
            </div>
          </div>
          <div className="flex gap-[26px] pb-2 font-mono text-[11px] font-semibold tracking-[0.12em] text-muted">
            <span>SUI</span>
            <span className="text-[#3e5a4c]">/</span>
            <span>DEEPBOOK</span>
            <span className="text-[#3e5a4c]">/</span>
            <span>SEAL</span>
            <span className="text-[#3e5a4c]">/</span>
            <span>MOVE</span>
          </div>
        </div>
      </div>

      {/* STAT STRIP */}
      <div className="border-y border-hair">
        <div className="mx-auto flex max-w-[1180px]">
          <Stat value="0" label="KEYS HELD BY AGENT" />
          <Stat value={<><CountUp to={100} /><span className="text-[17px] text-muted">%</span></>} label="ON-CHAIN ENFORCEMENT" />
          <Stat value={<CountUp to={2} />} label="ROGUE TRADES STOPPED" />
          <Stat value={<>7<span className="text-[17px] text-muted">d</span></>} label="MANDATE EXPIRY" />
        </div>
      </div>

      {/* EXECUTION PATH */}
      <div className="mx-auto max-w-[1180px] px-10 py-[100px]">
        <div className="mb-[54px] flex items-end justify-between">
          <div>
            <div className={`${ML} mb-[18px]`}>01 · EXECUTION PATH</div>
            <h2 className="m-0 max-w-[560px] font-sans text-[46px] font-extrabold leading-[1.05] tracking-tight text-cream">
              Every payment runs the gauntlet.
            </h2>
          </div>
          <p className="m-0 max-w-[320px] font-sans text-[15px] leading-relaxed text-[#cfd8ce]">
            No payment touches your funds until it has passed every rule, atomically, in Move.
          </p>
        </div>
        <div className="flex border-t border-hair">
          <PathStep n="01" accent="var(--color-gold)" title="Propose" body="Yield Hunter signs nothing. It posts an intent: market, size, direction." />
          <PathStep n="02" accent="var(--color-cream)" title="seal_approve" body="Budget, asset class, market, expiry, nonce · checked atomically." />
          <PathStep n="03" accent="var(--color-cream)" title="check-rotate-transfer" body="Authorization is consumed and rotated in the same call. No replay." />
          <PathStep n="04" accent="var(--color-approve)" title="Settle / revert" body="Pass: the swap settles. Fail: the whole tx aborts. Nothing between." />
        </div>
      </div>

      {/* INTERACTIVE POLICY SIMULATOR */}
      <div id="sim" className="border-y border-hair bg-panel">
        <div className="mx-auto max-w-[1180px] px-10 py-[100px]">
          <div className="mb-11">
            <div className={`${ML} mb-[18px]`}>02 · TRY THE POLICY · LIVE</div>
            <h2 className="m-0 font-sans text-[46px] font-extrabold leading-[1.05] tracking-tight text-cream">
              Set a budget. Try to break it.
            </h2>
            <p className="mt-[18px] max-w-[560px] font-sans text-base leading-relaxed text-[#cfd8ce]">
              Propose trades and watch the budget fill. Push past the cap, or replay an old authorization, and the
              Move policy aborts it · the same logic, the same error codes the chain enforces.
            </p>
          </div>
          <PolicySimulator />
        </div>
      </div>

      {/* MANDATE RULES */}
      <div className="mx-auto max-w-[1180px] px-10 py-[100px]">
        <div className={`${ML} mb-[18px]`}>03 · THE MANDATE</div>
        <h2 className="mb-[50px] mt-0 max-w-[620px] font-sans text-[46px] font-extrabold leading-[1.05] tracking-tight text-cream">
          Rules a human can read. Enforcement a chain can prove.
        </h2>
        <div className="flex flex-wrap items-stretch gap-4">
          <div className="flex min-w-[260px] flex-1 flex-col gap-4">
            <div className="border border-hair p-[26px]">
              <div className="mb-4 font-mono text-[11px] font-semibold tracking-[0.14em] text-muted">MAX PER-DAY</div>
              <div className="font-sans text-[38px] font-black tracking-tight text-gold">$50.00</div>
            </div>
            <div className="border border-hair p-[26px]">
              <div className="mb-4 font-mono text-[11px] font-semibold tracking-[0.14em] text-muted">EXPIRY</div>
              <div className="font-sans text-[30px] font-black tracking-tight text-cream">7 days</div>
              <div className="mt-2 font-mono text-xs text-muted">auto-revoke</div>
            </div>
          </div>
          <div className="min-w-[320px] flex-[1.3] border border-hair p-[26px]">
            <div className="mb-[18px] font-mono text-[11px] font-semibold tracking-[0.14em] text-muted">ASSET CATEGORIES</div>
            <div className="flex flex-wrap gap-2.5">
              <span className="border border-gold px-3.5 py-2.5 font-mono text-[13px] font-semibold text-cream">stablecoins</span>
              <span className="border border-gold px-3.5 py-2.5 font-mono text-[13px] font-semibold text-cream">blue-chips</span>
              <span className="border border-dashed border-hair px-3.5 py-2.5 font-mono text-[13px] font-semibold text-dim">memecoins · off</span>
              <span className="border border-dashed border-hair px-3.5 py-2.5 font-mono text-[13px] font-semibold text-dim">LPs · off</span>
            </div>
            <div className="mb-[18px] mt-[26px] font-mono text-[11px] font-semibold tracking-[0.14em] text-muted">DEEPBOOK MARKETS</div>
            <div className="flex flex-wrap gap-2.5">
              <span className="border border-hair bg-panel px-3.5 py-2.5 font-mono text-[13px] font-semibold text-cream">SUI / DEEP</span>
              <span className="border border-hair bg-panel px-3.5 py-2.5 font-mono text-[13px] font-semibold text-cream">SUI / DBUSDC</span>
            </div>
          </div>
          <div className="flex min-w-[260px] flex-1 flex-col bg-gold p-[26px]">
            <div className="mb-4 font-mono text-[11px] font-semibold tracking-[0.14em] text-[#8a6620]">IN PLAIN WORDS</div>
            <p className="m-0 font-sans text-lg font-semibold leading-relaxed text-ink">
              Spend up to $50/day, trading only stablecoins and blue-chips on SUI/DEEP and SUI/DBUSDC. Expires in 7
              days.
            </p>
            <div className="mt-auto pt-6 font-mono text-xs font-semibold text-[#5c4310]">The agent can never hold a key.</div>
          </div>
        </div>
      </div>

      {/* PRINCIPLES */}
      <div className="border-t border-hair">
        <div className="mx-auto max-w-[1180px] px-10 py-[100px]">
          <div className={`${ML} mb-[50px]`}>04 · PRINCIPLES</div>
          <div className="grid grid-cols-1 gap-y-10 md:grid-cols-4 md:gap-0">
            {[
              ['01', 'Proposes, never holds.', 'The agent submits trades. It never touches a key.', 'var(--color-gold)'],
              ['02', 'Rules in plain words.', 'Budget, assets, markets, expiry · readable by a human.', 'var(--color-cream)'],
              ['03', 'Enforced in Move.', 'seal_approve + atomic check-rotate-transfer gate every payment.', 'var(--color-cream)'],
              ['04', 'Refusal is provable.', 'A rogue or replayed trade aborts on-chain, in the open.', 'var(--color-cream)'],
            ].map(([n, t, b, c]) => (
              <div key={n} className="border-hair px-7 md:border-r md:last:border-r-0 md:first:pl-0">
                <div className="mb-[18px] font-sans text-[26px] font-black leading-none" style={{ color: c }}>
                  {n}
                </div>
                <div className="mb-2.5 font-sans text-lg font-bold leading-tight text-cream">{t}</div>
                <p className="m-0 font-sans text-sm leading-relaxed text-sage">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="bg-gold">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-8 px-10 py-[90px]">
          <div>
            <h2 className="m-0 font-sans text-[56px] font-black leading-[0.96] tracking-tight text-ink">Arm your mandate.</h2>
            <p className="mt-4 font-sans text-[17px] font-medium leading-snug text-[#5c4310]">
              Set the rules once. Let the chain keep them.
            </p>
          </div>
          <div className="flex items-center gap-3.5">
            <Link href="/wallet" className="bg-ink px-[30px] py-[18px] font-sans text-[15px] font-bold text-gold">
              Launch Sentinel
            </Link>
            <a className="border border-ink px-[26px] py-[17px] font-sans text-[15px] font-semibold text-ink">Read the Move policy</a>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <div className="bg-panel">
        <div className="mx-auto flex max-w-[1180px] flex-wrap justify-between gap-10 px-10 pb-10 pt-16">
          <div className="max-w-[300px]">
            <div className="mb-[18px] flex items-center gap-3">
              <Sigil size={22} bg="#0a2a20" />
              <div className="font-sans text-base font-extrabold text-cream">SENTINEL</div>
            </div>
            <p className="m-0 font-sans text-sm leading-relaxed text-muted">
              Key-safe DeFi treasury on Sui. The agent proposes · the chain disposes.
            </p>
          </div>
          <div className="flex gap-[60px]">
            {[
              ['PRODUCT', ['Mandate wallet', 'Agents', 'Policy engine']],
              ['DEVELOPERS', ['Docs', 'Move policy', 'GitHub']],
              ['COMPANY', ['Explorer', 'Security', 'Contact']],
            ].map(([h, items]) => (
              <div key={h as string}>
                <div className="mb-4 font-mono text-[11px] font-semibold tracking-[0.14em] text-dim">{h}</div>
                <div className="flex flex-col gap-2.5 font-sans text-sm font-medium text-[#cfd8ce]">
                  {(items as string[]).map((i) => (
                    <span key={i}>{i}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="mx-auto flex max-w-[1180px] justify-between border-t border-white/10 px-10 py-5 font-mono text-[11px] font-medium tracking-[0.06em] text-dim">
          <span>THE AGENT NEVER HOLDS A KEY</span>
          <span>© 2026 SENTINEL</span>
        </div>
      </div>
    </div>
  );
}
