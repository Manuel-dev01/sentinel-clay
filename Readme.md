<!--
  README skeleton for Sentinel. Pre-structured for CLAY hackathon judges.
  Fill the {{PLACEHOLDERS}}. Keep it scannable — judges skim. The first screen
  must land the thesis + the wow + the Package ID. Delete these comments before shipping.
-->

<div align="center">

# 🛡️ Sentinel

### The AI agent can propose. Only your Move policy can approve. It can never rug you.

**An agent-native, key-safe DeFi treasury on Sui.**

[Demo Video](#) · [Live App]({{WALRUS_SITE_URL}}) · [Package ID](#deployments) · [Architecture](#architecture)

</div>

> **Build status (2026-06-26):** Stages 0–2 complete & live on Sui testnet — mandate + policy
> core, one-shot `Witness` + replay protection, 23 passing tests. Both rogue-agent aborts
> (`E_OVER_CAP`, `E_REPLAY`) are **real, committed, explorer-visible transactions** (digests in
> [Deployments](#deployments)). DeepBook execution, Seal MPC, zkLogin, and the Walrus site are
> the remaining stages (3–6) and are marked _pending_ below.

---

## The problem

Letting an AI agent trade your funds means handing it your keys. One prompt injection, one buggy strategy, one rogue process — and the agent drains the wallet. Every "AI trading bot" is a custody time bomb.

## What Sentinel does

You fund a self-custodial **mandate wallet** and set human-readable rules — *max $50/day, stablecoin pairs only, these DeepBook markets, expires in 30 days.* You switch on an AI agent that hunts yield and arbitrage on DeepBook. **The agent never holds a key.** It can only *propose* a trade. Every payment is gated by an on-chain Move policy that re-checks the mandate and consumes a one-shot authorization. An over-cap, wrong-market, or replayed trade **aborts on-chain** — provably, every time.

> Off-chain authorization is an optimization. On-chain Move is the law.

## The wow (watch the rogue agent get stopped)

| Step | What happens | Result | Status |
|------|--------------|--------|--------|
| 1 | Log in with Google (zkLogin), no wallet, no SUI | ✅ onboarded | _pending (Stage 5)_ |
| 2 | Set mandate: $50/day, stables only | ✅ on-chain shared `Mandate` | **live** |
| 3 | Agent proposes a compliant $40 trade | ✅ settles, `PaymentSettled` | **live** (DeepBook fill in Stage 3) |
| 4 | Tampered agent attempts a $500 over-cap trade | ⛔ aborts on-chain `E_OVER_CAP` | **live on testnet** |
| 5 | Agent replays a used authorization | ⛔ aborts on-chain `E_REPLAY` | **live on testnet** |
| 6 | Open the Walrus audit log | 🔍 every verdict, immutable | _pending (Stage 5)_ |

Real testnet aborts (committed, explorer-visible): `E_OVER_CAP` tx `6aVwyWST…`, `E_MARKET` tx
`FfAzTn3k…`, `E_REPLAY` tx `3aNnknYg…`. Full transcript in [DEPLOYMENTS.md](DEPLOYMENTS.md).

▶️ **[2-minute demo video]({{YOUTUBE_URL}})**

## Architecture

{{ARCHITECTURE_DIAGRAM — paste the architecture diagram or an image}}

**The core invariant:** the *same* predicate logic gates both the off-chain Seal key-server dry-run and the on-chain `payment::pay` enforcement — they share code. A verdict released off-chain that violates the mandate is impossible to *settle* on-chain, because the Move contract re-checks and aborts. We prove this with a differential test (see [Security](#security)).

### Sui Stack used

| Primitive | Role in Sentinel |
|-----------|------------------|
| **Move (Sui)** | Mandate object, `seal_approve` predicate, one-shot `Witness` resource (no `copy`/`drop`/`store`), atomic check-rotate-transfer |
| **Seal MPC** | One-shot witness from the MPC committee, gated by on-chain Move policy; per-payment rotation |
| **DeepBook v3** | On-chain trade execution venue (+ optional hot-potato flash-loan arb) |
| **Walrus** | Immutable audit log of every proposal + verdict; agent memory |
| **zkLogin + sponsored tx** | Google login, zero-SUI onboarding |
| **Nautilus** *(stretch)* | Agent strategy in a TEE with on-chain attestation |

## Move highlights (for reviewers)

- **`Witness`** has no `copy`, no `drop`, no `store` — Move's type system enforces one-shot authorization at **compile time**. It cannot be duplicated, silently dropped, or stashed for replay.
- **`seal_approve` and `payment::pay` call the identical `policy::check`** — off-chain authorization can never diverge from on-chain enforcement.
- **Atomic check → rotate witness commitment → execute**, all in one Programmable Transaction Block; any violation reverts the whole transaction.

## Security

**`sui move test` → 23 passed, 0 failed** (Stages 0–2).

| Property | Test | Status |
|----------|------|--------|
| `spent_today ≤ daily_cap` always | `invariant_spent_never_exceeds_cap` (200 randomized) | ✅ |
| A consumed witness never re-validates (replay) | `replayed_witness_aborts` → `E_REPLAY` | ✅ |
| `nonce` strictly monotonic + commitment rotates | `invariant_nonce_monotonic_and_rotates` | ✅ |
| Forged witness rejected | `forged_witness_aborts` → `E_BAD_WITNESS` | ✅ |
| Revoked/expired mandate settles nothing | `pay_on_revoked_mandate_aborts` | ✅ |
| `seal_approve` ⇔ `payment::pay` share one check | `differential_compliant_seal_and_pay_agree` | ✅ |
| No compliant-rejection / no violating-acceptance | `fuzz_evaluate_matches_spec` (400 random intents) | ✅ |
| Every abort code (`E_OVER_CAP`…`E_NOT_OWNER`) | dedicated unit tests | ✅ |

Run: `sui move test`

## Deployments

| Network | Package ID | Date |
|---------|-----------|------|
| Testnet (Stage 2, current) | `0x6b0aa9c6e7efc655a71529aed597a1abbc71adeb16920a56bbd62e2a588e972b` | 2026-06-26 |
| Mainnet | `{{MAINNET_PACKAGE_ID}}` *(pending — Stage 6)* | — |

Fresh Package ID per checkpoint during development; full history + runtime object IDs and the
live abort/replay tx digests are in [DEPLOYMENTS.md](DEPLOYMENTS.md).

## Run it locally

```bash
# Move package
sui move build
sui move test
sui client publish --gas-budget 200000000

# Frontend
cd app && pnpm install && pnpm dev
```

{{ENV_VARS — Seal, DeepBook, Enoki/gas-station, Walrus config}}

## What's next

{{ROADMAP — mainnet hardening, Nautilus-attested strategies, multi-asset mandates, audit}}

## Built for

The **CLAY Hackathon** (Code Like A Yeti) — hosted by Lofi the Yeti, building on Sui. {{TEAM/CONTACT}}

---

<div align="center">
<sub>The agent can propose. Only your Move policy can approve.</sub>
</div>