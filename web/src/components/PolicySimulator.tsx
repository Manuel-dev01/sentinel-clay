'use client';

import { useState } from 'react';
import { freshState, propose, replay, type SimState, type Verdict } from '@/lib/policy';

interface Row {
  id: number;
  label: string;
  detail: string;
  status: string;
  ok: boolean | null;
}

export function PolicySimulator() {
  const [s, setS] = useState<SimState>(() => freshState(50));
  const [log, setLog] = useState<Row[]>([]);
  const [verdict, setVerdict] = useState('');
  const [lid, setLid] = useState(1);

  const pushRow = (label: string, v: Verdict, msg: string) => {
    setLog((l) =>
      [
        {
          id: lid,
          label,
          detail: v.detail,
          status: v.ok === true ? 'APPROVED' : v.ok === false && v.code === -1 ? '·' : 'ABORTED',
          ok: v.ok,
        },
        ...l,
      ].slice(0, 7),
    );
    setLid((x) => x + 1);
    setVerdict(msg);
  };

  const onPropose = (amount: number) => {
    const label = `agent.propose · SWAP ${amount.toFixed(2)} SUI → DEEP`;
    const { state, verdict: v } = propose(s, amount);
    setS(state);
    pushRow(
      label,
      v,
      v.ok
        ? `Approved. ${state.spent.toFixed(2)} of ${s.cap.toFixed(2)} SUI spent today · the agent stayed inside its mandate.`
        : `Blocked on-chain. The trade exceeded the daily budget, so the whole transaction reverted · no funds moved.`,
    );
  };

  const onReplay = () => {
    const v = replay(s);
    pushRow(
      v.code === -1 ? 'replay · no prior authorization' : `replay · reused authorization`,
      v,
      v.code === -1
        ? 'Nothing to replay yet · approve a trade, then replay its authorization.'
        : 'Blocked on-chain. The authorization was already consumed and rotated · a replayed approval can never settle.',
    );
  };

  const onReset = () => {
    setS(freshState(50));
    setLog([]);
    setVerdict('Day reset. Budget back to 0.00 of 50.00 SUI.');
  };

  const pct = Math.min(100, (s.spent / s.cap) * 100);
  const left = +(s.cap - s.spent).toFixed(2);
  const meterColor = pct >= 100 ? 'var(--color-abort)' : 'var(--color-gold)';

  const btn =
    'px-0 py-3.5 bg-forest border border-hair font-mono text-[13px] font-semibold text-cream cursor-pointer transition-colors hover:border-gold active:translate-y-px';

  return (
    <>
    <div className="flex flex-col gap-4 md:flex-row md:items-stretch">
      {/* controls */}
      <div className="flex flex-1 flex-col border border-hair p-7">
        <div className="mb-3 flex items-baseline justify-between">
          <div className="font-mono text-[11px] font-semibold tracking-[0.12em] text-muted">DAILY BUDGET</div>
          <div className="font-mono text-base font-bold text-cream">
            {s.spent.toFixed(2)} <span className="text-muted">/ {s.cap.toFixed(2)} SUI</span>
          </div>
        </div>
        <div className="mb-1.5 h-2.5 overflow-hidden bg-forest">
          <div
            className="h-full transition-[width,background] duration-300"
            style={{ width: `${pct}%`, background: meterColor }}
          />
        </div>
        <div className="mb-6 font-mono text-[11px] text-muted">{left.toFixed(2)} SUI left today · {s.cap.toFixed(0)} SUI hard cap</div>

        <div className="mb-3.5 font-mono text-[11px] font-semibold tracking-[0.12em] text-muted">PROPOSE A TRADE</div>
        <div className="mb-3.5 grid grid-cols-3 gap-2.5">
          <button className={btn} onClick={() => onPropose(5)}>
            SWAP 5
          </button>
          <button className={btn} onClick={() => onPropose(12)}>
            SWAP 12
          </button>
          <button className={btn} onClick={() => onPropose(28)}>
            SWAP 28
          </button>
        </div>
        <button
          className="mb-2.5 border border-abort/50 bg-transparent py-3.5 font-mono text-[13px] font-bold tracking-[0.04em] text-abort transition-colors hover:bg-abort/10"
          onClick={() => onPropose(500)}
        >
          ⚠ ROGUE · SWAP 500
        </button>
        <div className="flex gap-2.5">
          <button
            className="flex-1 border border-abort/50 bg-transparent py-3 font-mono text-xs font-bold text-abort transition-colors hover:bg-abort/10"
            onClick={onReplay}
          >
            REPLAY LAST AUTH
          </button>
          <button
            className="flex-1 border border-hair bg-transparent py-3 font-mono text-xs font-bold text-muted transition-colors hover:border-cream"
            onClick={onReset}
          >
            RESET DAY
          </button>
        </div>
      </div>

      {/* live ledger */}
      <div className="flex flex-[1.2] flex-col border border-hair p-7">
        <div className="mb-4 flex items-center justify-between">
          <div className="font-mono text-[11px] font-semibold tracking-[0.12em] text-muted">ON-CHAIN POLICY LEDGER</div>
          <div className="flex items-center gap-2 font-mono text-[11px] font-semibold text-muted">
            <span className="h-[7px] w-[7px] bg-approve" />
            SUI TESTNET
          </div>
        </div>
        {log.length === 0 ? (
          <div className="flex min-h-[280px] flex-1 items-center justify-center border border-dashed border-hairsoft text-center">
            <div className="font-mono text-[13px] leading-relaxed text-dim">
              No proposals yet.
              <br />
              Propose a trade to see the policy decide.
            </div>
          </div>
        ) : (
          <div className="flex min-h-[280px] flex-col">
            {log.map((row) => {
              const accent = row.ok === true ? 'var(--color-approve)' : row.ok === false && row.status === '·' ? 'var(--color-muted)' : 'var(--color-abort)';
              const bg = row.ok === true ? '#0e3a2c' : row.status === '·' ? '#0e3a2c' : '#2a1410';
              return (
                <div
                  key={row.id}
                  className="animate-rowIn mb-2.5 flex items-center gap-4 px-[18px] py-[15px]"
                  style={{ background: bg, borderLeft: `3px solid ${accent}` }}
                >
                  <div className="flex-1">
                    <div className="mb-1 font-mono text-[13px] leading-snug text-cream">{row.label}</div>
                    <div className="font-mono text-[11px] leading-snug" style={{ color: accent }}>
                      {row.detail}
                    </div>
                  </div>
                  <div className="whitespace-nowrap font-mono text-[11px] font-bold tracking-[0.08em]" style={{ color: accent }}>
                    {row.status}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
    <div className="mt-6 font-sans text-sm leading-relaxed text-sage">
      {verdict || 'Tip: approve a few trades to fill the budget, then try a 500 SUI swap or a replay to watch the policy abort.'}
    </div>
    </>
  );
}
