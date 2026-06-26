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

> **Build status (2026-06-26):** Stages 0–4 complete & live on Sui testnet — mandate + policy
> core, one-shot `Witness` + replay protection, a venue adapter (MockPool + DeepBook v3), and the
> **Seal authorization adapter** + off-chain SDK. **32 Move tests + 6 TS tests** passing. A
> compliant trade **fills on real DeepBook v3** — `pay_real` swapped 0.5 SUI for **20.00 DEEP**
> (`5SMBQo8B…`). Seal gates the one-shot witness secret: the on-chain `seal_approve` predicate
> (what the key servers dry-run) passes a compliant intent (`3mVozzJP…`) and **aborts an over-cap
> one** (`E_OVER_CAP`, `DcUUFG8b…`) — through the *same* `policy::check` as `pay`. All rogue-agent
> aborts are real, committed, explorer-visible txs ([Deployments](#deployments)). zkLogin + the
> Walrus site are the remaining stage (5), marked _pending_ below.

---

## The problem

Letting an AI agent trade your funds means handing it your keys. One prompt injection, one buggy strategy, one rogue process — and the agent drains the wallet. Every "AI trading bot" is a custody time bomb.

## What Sentinel does

You fund a self-custodial **mandate wallet** and set human-readable rules — *max $50/day, stablecoin pairs only, these DeepBook markets, expires in 30 days.* You switch on an AI agent that hunts yield and arbitrage on DeepBook. **The agent never holds a key.** It can only *propose* a trade. Every payment is gated by an on-chain Move policy that re-checks the mandate and consumes a one-shot authorization. An over-cap, wrong-market, or replayed trade **aborts on-chain** — provably, every time.

> Off-chain authorization is an optimization. On-chain Move is the law.

## The wow (watch the rogue agent get stopped)

| Step | What happens | Result | Status |
|------|--------------|--------|--------|
| – | Seal gates the witness secret: agent decrypts the authorization only if `seal_approve` passes; rogue intent denied | ⛔/✅ off-chain gate = on-chain law | **live** (predicate proven: `3mVozzJP…` / `DcUUFG8b…`) |
| 1 | Log in with Google (zkLogin), no wallet, no SUI | ✅ onboarded | _pending (Stage 5)_ |
| 2 | Set mandate: $50/day, stables only | ✅ on-chain shared `Mandate` | **live** |
| 3 | Agent proposes a compliant $40 trade | ✅ settles + fills, `PaymentSettled{base_out}` | **live on real DeepBook v3** (0.5 SUI → 20 DEEP, `FSiwLoHG…`; MockPool fill also live) |
| 4 | Tampered agent attempts a $500 over-cap trade | ⛔ aborts on-chain `E_OVER_CAP` | **live on testnet** |
| 5 | Agent replays a used authorization | ⛔ aborts on-chain `E_REPLAY` | **live on testnet** |
| 6 | Open the Walrus audit log | 🔍 every verdict, immutable | _pending (Stage 5)_ |

Real testnet transactions (committed, explorer-visible): **real DeepBook fill** `FSiwLoHG…`
(0.5 SUI → 20.00 DEEP); MockPool fill `38Q1RQwc…` (`base_out:80`); aborts `E_OVER_CAP` on the
real-DeepBook path `EGDZtuoc…` (and mock `ByywWqRL…`), `E_MARKET` tx `FfAzTn3k…`, `E_REPLAY` tx
`3aNnknYg…`. Full transcript in [DEPLOYMENTS.md](DEPLOYMENTS.md).

▶️ **[2-minute demo video]({{YOUTUBE_URL}})**

## Architecture

{{ARCHITECTURE_DIAGRAM — paste the architecture diagram or an image}}

**The core invariant:** the *same* predicate logic gates both the off-chain Seal key-server dry-run and the on-chain `payment::pay` enforcement — they share code. A verdict released off-chain that violates the mandate is impossible to *settle* on-chain, because the Move contract re-checks and aborts. We prove this with a differential test (see [Security](#security)).

### Sui Stack used

| Primitive | Role in Sentinel |
|-----------|------------------|
| **Move (Sui)** | Mandate object, dry-runnable `seal_approve` predicate, one-shot `Witness` resource (no `copy`/`drop`/`store`), atomic check-rotate-transfer |
| **Seal** | Threshold encryption gates **release of the one-shot witness secret**: `seal_approve` (same `policy::check` as `pay`) decides whether key servers release the preimage; rogue intent denied off-chain + re-aborted on-chain. Also encrypts the audit log (owner-only). _wired in `sdk/`; on-chain predicate proven live_ |
| **DeepBook v3** | On-chain trade execution venue (+ optional hot-potato flash-loan arb) |
| **Walrus** | Immutable audit log of every proposal + verdict; agent memory |
| **zkLogin + sponsored tx** | Google login, zero-SUI onboarding |
| **Nautilus** *(stretch)* | Agent strategy in a TEE with on-chain attestation |

## Move highlights (for reviewers)

- **`Witness`** has no `copy`, no `drop`, no `store` — Move's type system enforces one-shot authorization at **compile time**. It cannot be duplicated, silently dropped, or stashed for replay.
- **`seal_approve` and `payment::pay` call the identical `policy::check`** — off-chain authorization can never diverge from on-chain enforcement.
- **Atomic check → rotate witness commitment → execute**, all in one Programmable Transaction Block; any violation reverts the whole transaction.

## Security

**`sui move test` → 32 passed, 0 failed** (Stages 0–4) · **`pnpm test` (sdk) → 6 passed** (keccak↔Move parity, `seal_id` codec).

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
| Testnet (Stage 4, current — Seal adapter + vendored clean build) | `0x7a7ee7186ccb69b2b250e7b08fc31b8ccfadae9a7596a352112f7aa3e72a77f9` | 2026-06-26 |
| Testnet (Stage 3.1 — real DeepBook fill) | `0xd3dc1607b52c49864e7298846dd0440ae8f49e3cc130babacc267697718d9a2e` | 2026-06-26 |
| Mainnet | `{{MAINNET_PACKAGE_ID}}` *(pending — Stage 6)* | — |

Fresh Package ID per checkpoint during development; full history + runtime object IDs and the
live abort/replay tx digests are in [DEPLOYMENTS.md](DEPLOYMENTS.md).

## Run it locally

```bash
# Move package — DeepBook is vendored (vendor/deepbook) with a corrected Published.toml, so this
# builds + links to the live testnet DeepBook on a fresh clone with NO --allow-dirty, no cache edits.
cd sentinel
sui move build
sui move test                       # 32 passed
sui client publish --gas-budget 200000000

# Off-chain SDK (AuthorizationProvider: LocalWitness + Seal; PaymentClient; audit log)
cd ../sdk
pnpm install
pnpm test                           # 6 passed (keccak↔Move parity, seal_id codec)
SENTINEL_PKG=0x7a7e… SUI_PRIVATE_KEY=… pnpm smoke   # optional live run (needs a funded signer)
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