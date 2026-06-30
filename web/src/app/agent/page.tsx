'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Transaction } from '@mysten/sui/transactions';
import { AppShell } from '@/components/AppShell';
import { useSigner } from '@/lib/signer';
import { useMandate } from '@/lib/mandateStore';
import { readMandate, effectiveSpent, type MandateState } from '@/lib/onchain';
import { buildChecks, evaluateOnChain, codeLabel, type Check } from '@/lib/predicate';
import { settleProposal, replaySettle, abortCodeFromError } from '@/lib/settle';
import { recordVerdict } from '@/lib/audit';
import { MARKETS, PACKAGE_ID, EXPLORER, AGENT_MANDATE_ID } from '@/lib/env';
import type { Proposal } from '@/lib/agentTypes';
import { fmtSui, shortAddr } from '@/lib/format';

interface Row {
  p: Proposal;
  checks?: Check[];
  onchainCode?: number;
  status: 'pending' | 'settling' | 'settled' | 'aborted' | 'rejected';
  digest?: string;
  code?: number;
  baseOut?: string;
  live?: boolean; // streamed by the autonomous worker (vs a manual button press)
  foreign?: boolean; // streamed for the demo agent mandate the viewer does not own (display-only)
}

interface Heartbeat {
  ts: number;
  tick: number;
  status: 'live' | 'holding' | 'error';
  source?: 'deepseek' | 'heuristic';
  message?: string;
}

const DEEP_DP = 1e6;

export default function Dashboard() {
  const { mandate, setMandate } = useMandate();
  const { signMessage, signExecute, busy } = useSigner();
  const audit = (p: Proposal, verdict: 'APPROVED' | 'ABORTED', code?: number, txDigest?: string) =>
    recordVerdict({ mandateId: mandate!.mandateId, owner: mandate!.owner, signMessage, p, verdict, code, txDigest });
  const [rows, setRows] = useState<Row[]>([]);
  const [thinking, setThinking] = useState(false);
  const [err, setErr] = useState('');

  const mq = useQuery<MandateState>({
    queryKey: ['mandate', mandate?.mandateId],
    enabled: !!mandate,
    refetchInterval: 6000,
    queryFn: () => readMandate(mandate!.mandateId),
  });

  // The autonomous worker streams proposals to Upstash. When AGENT_MANDATE_ID is configured the feed
  // follows THAT mandate (proof-of-life for any visitor); otherwise it follows the viewer's own mandate.
  // Fresh items are merged into the list so they appear with no clicks. The agent only proposes;
  // approving a proposal you OWN goes through your signer (settleProposal) and Move re-checks on settle.
  const feedMandate = AGENT_MANDATE_ID || mandate?.mandateId || '';
  const owns = !AGENT_MANDATE_ID || AGENT_MANDATE_ID === mandate?.mandateId;
  const feedQ = useQuery<{ configured: boolean; proposals: (Proposal & { ts: number })[]; heartbeat: Heartbeat | null }>({
    queryKey: ['agentFeed', feedMandate],
    enabled: !!feedMandate,
    refetchInterval: 3000,
    queryFn: () => fetch(`/api/agent/feed?mandateId=${feedMandate}`).then((r) => r.json()),
  });
  const seenFeed = useRef<Set<string>>(new Set());

  useEffect(() => {
    const items = feedQ.data?.proposals ?? [];
    const fresh = items.filter((it) => !seenFeed.current.has(it.id));
    if (!fresh.length) return;
    fresh.forEach((it) => seenFeed.current.add(it.id));
    // feed is newest-first; reverse so the newest ends up at the top after prepending each.
    (async () => {
      for (const it of [...fresh].reverse()) {
        // Only evaluate the on-chain verdict / allow approval when the viewer owns the feed's mandate.
        const row = owns ? await enrich(it, mq.data) : { p: it, status: 'pending' as const };
        setRows((rs) => [{ ...row, live: true, foreign: !owns }, ...rs].slice(0, 12));
      }
    })();
  }, [feedQ.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Self-driving: while anyone has this page open, ping the (debounced) tick route so the agent keeps
  // proposing autonomously without a separate always-on worker. The lock ensures ~one tick per window.
  useEffect(() => {
    if (!feedMandate) return;
    const ping = () => fetch(`/api/agent/tick?mandateId=${feedMandate}`).catch(() => {});
    ping();
    const id = setInterval(ping, 5000);
    return () => clearInterval(id);
  }, [feedMandate]);

  if (!mandate) {
    return (
      <AppShell title="Agent">
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

  const m = mq.data;
  const now = Date.now();
  const spent = m ? effectiveSpent(m, now) : 0n;
  const pct = m && m.capMist > 0n ? Math.min(100, Number((spent * 10000n) / m.capMist) / 100) : 0;
  const expiresInH = m ? Math.max(0, Math.round((Number(m.expiryMs) - now) / 3600_000)) : 0;

  async function enrich(p: Proposal, mState: MandateState | undefined): Promise<Row> {
    let checks: Check[] | undefined;
    let onchainCode: number | undefined;
    try {
      const marketAllowed = MARKETS.some((x) => x.id === p.poolId);
      if (mState) checks = buildChecks(mState, p, Date.now(), marketAllowed);
      onchainCode = await evaluateOnChain(p, { mandateId: mandate!.mandateId, registryId: mandate!.registryId });
    } catch {
      /* best-effort */
    }
    return { p, checks, onchainCode, status: 'pending' };
  }

  async function propose(endpoint: 'propose' | 'tamper', body?: any) {
    setThinking(true);
    setErr('');
    try {
      const r = await fetch(`/api/agent/${endpoint}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mandateId: mandate!.mandateId, ...body }),
      });
      const j = await r.json();
      if (j.full) {
        setErr(j.message);
        return;
      }
      if (j.error) throw new Error(j.error);
      const row = await enrich(j.proposal as Proposal, mq.data);
      setRows((rs) => [row, ...rs].slice(0, 8));
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setThinking(false);
    }
  }

  async function approve(idx: number) {
    const row = rows[idx];
    if (row.foreign) {
      setErr('This proposal belongs to the demo agent mandate (you do not own it). Arm your own mandate and point the worker at it to approve from the feed.');
      return;
    }
    setErr('');
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, status: 'settling' } : r)));
    try {
      const settleFn = row.p.kind === 'replay' ? replaySettle : settleProposal;
      const res = await settleFn(row.p, mandate!, signExecute);
      const ok = res.status === 'success';
      const settled = (res.events ?? []).find((e: any) => String(e.type).includes('PaymentSettled'));
      const code = ok ? undefined : abortCodeFromError((res.effects as any)?.status?.error ?? '') ?? undefined;
      setRows((rs) =>
        rs.map((r, i) =>
          i === idx
            ? { ...r, status: ok ? 'settled' : 'aborted', digest: res.digest, code, baseOut: settled?.parsedJson?.base_out }
            : r,
        ),
      );
      audit(row.p, ok ? 'APPROVED' : 'ABORTED', code, res.digest);
      mq.refetch();
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      const code = abortCodeFromError(msg) ?? undefined;
      setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, status: 'aborted', code } : r)));
      setErr(
        /insufficient|balance|gas|budget/i.test(msg) && !code
          ? 'Insufficient balance to settle. Faucet more SUI on the Wallet screen.'
          : msg,
      );
      audit(row.p, 'ABORTED', code);
      mq.refetch();
    }
  }

  async function revoke() {
    try {
      const tx = new Transaction();
      tx.moveCall({ target: `${PACKAGE_ID}::mandate::revoke`, arguments: [tx.object(mandate!.mandateId)] });
      await signExecute(tx);
      setMandate(null);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  }

  return (
    <AppShell title="Yield Hunter v2" subtitle="armed · hunting · the agent proposes, you sign, Move enforces">
      <div className="flex flex-col gap-4 p-[30px]">
        {/* stat strip */}
        <div className="flex flex-wrap gap-4">
          <div className="min-w-[220px] flex-1 border border-hairsoft p-5">
            <div className="mb-3 font-mono text-[10px] font-semibold tracking-[0.12em] text-muted">DAILY BUDGET</div>
            <div className="mb-2.5 h-2 overflow-hidden bg-panel">
              <div className="h-full bg-gold" style={{ width: `${pct}%` }} />
            </div>
            <div className="font-mono text-base font-bold text-cream">
              {fmtSui(spent)} <span className="text-muted">/ {m ? fmtSui(m.capMist) : '·'} SUI</span>
            </div>
          </div>
          <Stat label="NONCE" value={m ? m.nonce.toString() : '·'} sub="one-shot, rotates each settle" />
          <Stat label="PROPOSALS" value={rows.length.toString()} sub={`${rows.filter((r) => r.status === 'settled').length} settled · ${rows.filter((r) => r.status === 'aborted').length} aborted`} />
          <Stat label="EXPIRES IN" value={`${expiresInH}h`} sub={m?.revoked ? 'revoked' : 'auto-revoke'} accent />
        </div>

        {/* live autonomous feed status */}
        <LiveFeedBanner hb={feedQ.data?.heartbeat ?? null} configured={feedQ.data?.configured} />

        {/* controls */}
        <div className="flex flex-wrap items-center gap-3 border border-hairsoft p-4">
          <button
            onClick={() => propose('propose')}
            disabled={thinking || busy}
            className="bg-gold px-5 py-2.5 font-sans text-[13px] font-extrabold text-ink disabled:opacity-60"
          >
            {thinking ? 'Agent thinking…' : 'Agent: propose now'}
          </button>
          <button
            onClick={() => propose('tamper', { kind: 'overcap' })}
            disabled={thinking || busy}
            className="border border-abort/50 px-4 py-2.5 font-mono text-xs font-bold text-abort hover:bg-abort/10"
          >
            ⚠ Tampered agent · over-cap
          </button>
          <button
            onClick={() => propose('tamper', { kind: 'replay' })}
            disabled={thinking || busy}
            className="border border-abort/50 px-4 py-2.5 font-mono text-xs font-bold text-abort hover:bg-abort/10"
          >
            ⚠ Tampered agent · replay
          </button>
          <button onClick={revoke} className="ml-auto border border-abort/50 px-4 py-2.5 font-mono text-xs font-bold text-abort hover:bg-abort/10">
            Revoke mandate
          </button>
        </div>

        {err && <div className="border border-gold/40 bg-panel p-3 font-mono text-xs text-gold">{err}</div>}

        {/* proposals */}
        <div className="font-mono text-[11px] font-semibold tracking-[0.12em] text-muted">OPEN PROPOSALS</div>
        {rows.length === 0 && (
          <div className="border border-dashed border-hairsoft p-8 text-center font-mono text-[13px] text-dim">
            No proposals yet. The autonomous Yield Hunter streams them here as it ticks · or click “Agent: propose now”.
            You approve; Move enforces.
          </div>
        )}
        {rows.map((r, i) => (
          <ProposalCard key={r.p.id} row={r} idx={i} onApprove={approve} onReject={() => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, status: 'rejected' } : x)))} owner={mandate.owner} />
        ))}
      </div>
    </AppShell>
  );
}

function LiveFeedBanner({ hb, configured }: { hb: Heartbeat | null; configured?: boolean }) {
  const ageS = hb ? Math.max(0, Math.round((Date.now() - hb.ts) / 1000)) : null;
  const live = !!hb && ageS !== null && ageS < 45 && hb.status !== 'error';
  const holding = !!hb && hb.status === 'holding';
  const dot = !live ? 'bg-muted' : holding ? 'bg-gold' : 'bg-approve';
  const label = !configured
    ? 'Autonomous worker not wired · propose manually below (see docs to run the worker)'
    : !hb
      ? 'Waiting for the autonomous worker to tick…'
      : hb.status === 'error'
        ? `Agent error · ${hb.message ?? 'see worker logs'}`
        : holding
          ? `Agent holding · ${hb.message ?? 'budget spent'} · tick ${hb.tick}`
          : `Agent live · hunting DeepBook autonomously · ${hb.source ?? 'agent'} · tick ${hb.tick}`;
  return (
    <div className="flex items-center gap-3 border border-hairsoft bg-panel p-3">
      <span className="relative flex h-2.5 w-2.5">
        {live && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${dot} opacity-60`} />}
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dot}`} />
      </span>
      <span className="font-mono text-[12px] text-cream">{label}</span>
      {ageS !== null && <span className="ml-auto font-mono text-[11px] text-muted">last tick {ageS}s ago</span>}
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className="min-w-[160px] flex-1 border border-hairsoft p-5">
      <div className="mb-3 font-mono text-[10px] font-semibold tracking-[0.12em] text-muted">{label}</div>
      <div className={`font-sans text-[26px] font-extrabold ${accent ? 'text-gold' : 'text-cream'}`}>{value}</div>
      <div className="mt-2 font-mono text-[11px] text-muted">{sub}</div>
    </div>
  );
}

function ProposalCard({ row, idx, onApprove, onReject, owner }: { row: Row; idx: number; onApprove: (i: number) => void; onReject: () => void; owner: string }) {
  const { p, checks, onchainCode, status } = row;
  const sui = (Number(p.amountMist) / 1e9).toFixed(2);
  const deep = p.expectedOut ? (Number(p.expectedOut) / DEEP_DP).toFixed(3) : '·';
  const rogue = p.kind !== 'compliant';
  const verdict = onchainCode === undefined ? '…' : codeLabel(onchainCode);
  const verdictOk = onchainCode === 0;

  const statusEl =
    status === 'settled' ? (
      <a href={EXPLORER(row.digest!)} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-approve">
        SETTLED {row.baseOut ? `· ${(Number(row.baseOut) / DEEP_DP).toFixed(3)} DEEP` : ''} · {shortAddr(row.digest, 6, 4)} ↗
      </a>
    ) : status === 'aborted' ? (
      <span className="font-mono text-[11px] text-abort">
        ABORTED {row.code ? `· ${codeLabel(row.code)}` : ''} {row.digest ? '· reverted' : ''}
      </span>
    ) : status === 'rejected' ? (
      <span className="font-mono text-[11px] text-muted">REJECTED</span>
    ) : null;

  return (
    <div className={`border ${rogue ? 'border-abort/40 bg-[#2a1410]' : 'border-hairsoft bg-panel'} p-5`}>
      <div className="flex flex-wrap items-center gap-4">
        <span className={`font-mono text-[11px] font-bold ${rogue ? 'text-abort' : 'text-gold'} border ${rogue ? 'border-abort/50' : 'border-gold/40'} px-2 py-1`}>
          {rogue ? (p.kind === 'replay' ? 'REPLAY' : 'ROGUE') : 'PROPOSAL'}
        </span>
        <div className="flex-1 font-mono text-[13px] text-cream">
          SWAP {sui} SUI → {deep} DEEP <span className="text-muted">· {p.market} · {p.source}</span>
          {row.live && <span className="text-sage"> · streamed</span>}
        </div>
        <div className={`font-mono text-[11px] font-bold ${verdictOk ? 'text-approve' : 'text-abort'}`}>policy: {verdict}</div>
      </div>

      <div className="mt-2 font-mono text-[11px] text-sage">“{p.rationale}”</div>

      {checks && (
        <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-5">
          {checks.map((c) => (
            <div key={c.key} className={`border-l-2 ${c.pass ? 'border-approve' : 'border-abort'} bg-forest px-2.5 py-2`}>
              <div className="font-mono text-[10px] text-muted">{c.label}</div>
              <div className={`font-mono text-[11px] font-bold ${c.pass ? 'text-approve' : 'text-abort'}`}>{c.pass ? 'PASS' : 'FAIL'}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        {status === 'pending' && row.foreign && (
          <span className="font-mono text-[11px] text-muted">read-only · streamed by the autonomous agent</span>
        )}
        {status === 'pending' && !row.foreign && (
          <>
            <button onClick={() => onApprove(idx)} className="bg-gold px-5 py-2.5 font-sans text-[13px] font-extrabold text-ink">
              Approve on-chain
            </button>
            <button onClick={onReject} className="border border-hair px-4 py-2.5 font-mono text-xs font-bold text-muted">
              Reject
            </button>
          </>
        )}
        {status === 'settling' && <span className="font-mono text-xs text-gold">signing & settling…</span>}
        {statusEl}
      </div>
    </div>
  );
}
