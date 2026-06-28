<div align="center">

# 🛡️ Sentinel

### The AI agent can propose. Only your Move policy can approve. It can never rug you.

**An agent-native, key-safe DeFi treasury on Sui.**

[Live App](https://sentinel-clay-web.vercel.app/) · [Package ID](#deployments) · [Architecture](#architecture)

</div>

> **Build status (2026-06-28):** Stages 0–6 complete.
>
> - **On mainnet:** the Move package is published on Sui mainnet (`0xd37ca38e…`), same source as
>   testnet, where a compliant `seal_approve` settles and an over-cap one **aborts `E_OVER_CAP`**
>   on-chain (`6JWnSZKX…`).
> - **Live app** ([sentinel-clay-web.vercel.app](https://sentinel-clay-web.vercel.app/)), over the
>   testnet package: Google login (zkLogin via Enoki) with sponsored gas, a mandate builder that arms
>   an on-chain policy in one signature, a **keyless AI agent** (DeepSeek "Yield Hunter") that reads
>   DeepBook + the mandate and only *proposes* trades, an approve→`pay_real` settle path, and a
>   **Walrus** audit trail of every proposal and verdict.
> - **Proven on-chain:** a compliant trade **fills on real DeepBook v3** (0.5 SUI → **20 DEEP**,
>   `5SMBQo8B…`); over-cap and replayed trades **abort** (`E_OVER_CAP` `DcUUFG8b…`, `E_REPLAY`
>   `3aNnknYg…`). **42 tests pass** (32 sentinel + 4 nautilus Move, 6 SDK).
> - **The agent holds no key** - it only proposes; the user's zkLogin session signs; Move enforces.

---

## The problem

Letting an AI agent trade your funds means handing it your keys. One prompt injection, one buggy strategy, one rogue process - and the agent drains the wallet. Every "AI trading bot" is a custody time bomb.

## What Sentinel does

You fund a self-custodial **mandate wallet** and set human-readable rules - *max 0.5 SUI/day, allowed asset categories only, these DeepBook markets, expires in 30 days.* You switch on an AI agent that hunts yield and arbitrage on DeepBook. **The agent never holds a key.** It can only *propose* a trade. Every payment is gated by an on-chain Move policy that re-checks the mandate and consumes a one-shot authorization. An over-cap, wrong-market, or replayed trade **aborts on-chain** - provably, every time.

> Off-chain authorization is an optimization. On-chain Move is the law.

## The wow (watch the rogue agent get stopped)

| Step | What happens | Result | Status |
|------|--------------|--------|--------|
| – | Seal gates the witness secret: agent decrypts the authorization only if `seal_approve` passes; rogue intent denied | ⛔/✅ off-chain gate = on-chain law | **live** (predicate proven: `3mVozzJP…` / `DcUUFG8b…`) |
| 1 | Log in with Google (zkLogin), no wallet, no seed phrase; gas sponsored by Enoki | ✅ onboarded | **live in app** (Enoki + dapp-kit) |
| 2 | Set mandate (budget, stables, markets, expiry) → arm in one signature | ✅ on-chain shared `Mandate` | **live** |
| 3 | DeepSeek agent proposes a compliant trade → Approve | ✅ settles + fills, `PaymentSettled{base_out}` | **live on real DeepBook v3** (0.5 SUI → 20 DEEP, `5SMBQo8B…`) |
| 4 | Tampered agent attempts an over-cap trade | ⛔ aborts on-chain `E_OVER_CAP` | **live on testnet** (`DcUUFG8b…`) |
| 5 | Agent replays a used authorization | ⛔ aborts on-chain `E_REPLAY` | **live on testnet** |
| 6 | Open the Walrus audit log | 🔍 every proposal+verdict, immutable on Walrus | **live in app** (Seal-encrypted blobs) |

Real testnet transactions (committed, explorer-visible): **real DeepBook fill** `5SMBQo8B…`
(0.5 SUI → 20 DEEP); `seal_approve` compliant `3mVozzJP…`; over-cap abort `E_OVER_CAP` `DcUUFG8b…`;
`E_REPLAY` `3aNnknYg…`. The **same policy is also proven on Sui mainnet** (package `0xd37ca38e…`):
compliant `seal_approve` `2z8CxQ6C…`, over-cap `E_OVER_CAP` `6JWnSZKX…`. Full transcript in
[DEPLOYMENTS.md](DEPLOYMENTS.md).

▶️ **Demo:** run [DEMO_CHECKLIST.md](DEMO_CHECKLIST.md) against the [live app](https://sentinel-clay-web.vercel.app/).

## Architecture

```
  Browser (your custody)                    Server (keyless)              Sui testnet
  ┌─────────────────────────┐      propose   ┌──────────────────┐
  │ zkLogin / demo wallet    │ ◄───────────── │ /api/agent       │  reads DeepBook + mandate
  │  · witness seed (local)  │   PaymentIntent│  DeepSeek "Yield  │  (no keypair, only proposes)
  │  · approve → sign        │                │  Hunter" + fallbk │
  └───────────┬─────────────┘                └──────────────────┘
              │ pay_real (Enoki-sponsored gas)
              ▼
  ┌───────────────────────────────────────────────────────────────────────────────┐
  │  Move package  ·  payment::pay → policy::check (budget·asset·market·expiry·nonce)│
  │                  → verify+rotate one-shot Witness → execute → emit / ABORT       │
  └───────────────┬───────────────────────────────────────────┬─────────────────────┘
                  ▼                                             ▼
            DeepBook v3 (fill)                          Walrus (Seal-encrypted audit blob)
```

**The core invariant:** the *same* predicate logic gates both the off-chain Seal key-server dry-run and the on-chain `payment::pay` enforcement - they share code. A verdict released off-chain that violates the mandate is impossible to *settle* on-chain, because the Move contract re-checks and aborts. We prove this with a differential test (see [Security](#security)).

### Sui Stack used

| Primitive | Role in Sentinel |
|-----------|------------------|
| **Move (Sui)** | Mandate object, dry-runnable `seal_approve` predicate, one-shot `Witness` resource (no `copy`/`drop`/`store`), atomic check-rotate-transfer |
| **Seal** | Threshold encryption gates **release of the one-shot witness secret**: `seal_approve` (same `policy::check` as `pay`) decides whether key servers release the preimage; rogue intent denied off-chain + re-aborted on-chain. Also encrypts the audit log (owner-only). _wired in `sdk/`; on-chain predicate proven live_ |
| **DeepBook v3** | On-chain trade execution venue; the agent reads live mid/quote via dev-inspect |
| **Walrus** | Immutable audit log - every proposal+verdict is a Seal-encrypted blob (testnet publisher/aggregator). _live in app_ |
| **zkLogin + Enoki sponsored tx** | Google login, no seed phrase, gas sponsored - judge needs no wallet/SUI. _live in app (dapp-kit + @mysten/enoki)_ |
| **DeepSeek agent** | The keyless "Yield Hunter" runs server-side (`/api/agent`), proposes trades with plain-English rationale; never holds a key |
| **Nautilus** *(stretch)* | Agent strategy in a TEE so proposals are provably from the attested binary; on-chain ed25519 verifier module shipped + tested (`nautilus/`), live AWS Nitro deploy is the documented last mile. See [NAUTILUS.md](NAUTILUS.md) |

## Move highlights (for reviewers)

- **`Witness`** has no `copy`, no `drop`, no `store` - Move's type system enforces one-shot authorization at **compile time**. It cannot be duplicated, silently dropped, or stashed for replay.
- **`seal_approve` and `payment::pay` call the identical `policy::check`** - off-chain authorization can never diverge from on-chain enforcement.
- **Atomic check → rotate witness commitment → execute**, all in one Programmable Transaction Block; any violation reverts the whole transaction.

## Security

**`sui move test` → 32 passed, 0 failed** (sentinel) · **4 passed** (`nautilus/` enclave verifier, ed25519 vs RFC 8032) · **`pnpm test` (sdk) → 6 passed** (keccak↔Move parity, `seal_id` codec).

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

| What | ID / URL | Date |
|------|----------|------|
| **Mainnet package** (same source; compliant `seal_approve` + over-cap `E_OVER_CAP` proven on mainnet) | `0xd37ca38e54a3218bbdf7417b9817d0075ebd56ed65584a382af87854e2605066` | 2026-06-28 |
| **Live app** | https://sentinel-clay-web.vercel.app/ | 2026-06-27 |
| Testnet package (current - Seal adapter, vendored clean build) | `0x7a7ee7186ccb69b2b250e7b08fc31b8ccfadae9a7596a352112f7aa3e72a77f9` | 2026-06-26 |
| App market registry (shared, DEEP_SUI allowlisted) | `0x8b49d0d7afde529a8784f3f255b1fa2168519988aae242f5bf3a881b6a7f7c1f` | 2026-06-27 |
| Testnet package (Stage 3.1 - real DeepBook fill) | `0xd3dc1607b52c49864e7298846dd0440ae8f49e3cc130babacc267697718d9a2e` | 2026-06-26 |

Fresh Package ID per checkpoint during development; full history + runtime object IDs and the
live abort/replay tx digests are in [DEPLOYMENTS.md](DEPLOYMENTS.md).

## Repo layout
```
sentinel/   Move package (mandate · policy · payment · seal_policy · execution) + vendored deepbook
nautilus/   Move package (stretch): enclave attestation/authorship verifier (ed25519) + tests
sdk/        TypeScript: AuthorizationProvider (LocalWitness + Seal), PaymentClient, SealAuditLog
web/        Next.js app - landing, mandate builder, keyless agent, settle, Walrus audit
```

## Run it locally
```bash
# Move package - DeepBook is vendored (vendor/deepbook, corrected Published.toml) so a fresh clone
# builds + links to live testnet DeepBook with NO --allow-dirty and no cache edits.
cd sentinel && sui move build && sui move test          # 32 passed

# Whole workspace (sdk + web)
pnpm install
pnpm --filter @sentinel/sdk test                         # 6 passed (keccak↔Move parity, seal_id codec)
pnpm --filter web dev                                    # → http://localhost:3000
```
Without any keys the app runs on a **self-custodial demo wallet** (browser keypair + faucet) and the
agent uses a deterministic heuristic - so it works end-to-end out of the box. Add the keys below to
switch on Google/zkLogin onboarding and the DeepSeek agent.

### Environment (`web/.env.local`; see `web/.env.example`)
| Var | Purpose | Where |
|-----|---------|-------|
| `NEXT_PUBLIC_ENOKI_API_KEY` / `ENOKI_SECRET_KEY` | zkLogin + sponsored gas | [portal.enoki.mystenlabs.com](https://portal.enoki.mystenlabs.com) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google OAuth (register it in Enoki too) | [console.cloud.google.com](https://console.cloud.google.com) |
| `DEEPSEEK_API_KEY` | the Yield Hunter agent (server-only) | [platform.deepseek.com](https://platform.deepseek.com) |
| `NEXT_PUBLIC_SENTINEL_PKG`, `NEXT_PUBLIC_APP_REGISTRY` | on-chain ids (defaults shipped) | - |

> **Deploying to Vercel:** set these in **Project → Settings → Environment Variables** (`.env.local`
> is local-only and gitignored), then redeploy. Add your Vercel URL to the Google OAuth origins and the
> Enoki project's allowed origins. `NEXT_PUBLIC_FORCE_LOCAL=1` forces the demo wallet for local dev.

## Demo path
Google login (no wallet/SUI) → set mandate → **arm** (sponsored, one signature) → faucet a little
trade-SUI → agent **proposes** a DeepBook trade → **Approve** → settles + fills → **tampered agent**
over-cap → aborts `E_OVER_CAP` → **replay** → aborts `E_REPLAY` → **Activity** shows the Walrus audit trail.

## What's next
Live AWS Nitro enclave deploy (the on-chain verifier + mock path already ship, see [NAUTILUS.md](NAUTILUS.md)) · multi-asset mandate vault (Model B) · Walrus Site + SuiNS.

## Built for
The **CLAY Hackathon** (Code Like A Yeti) on Sui, by Emmanuel Olamiye.

## License
MIT.

---

<div align="center">
<sub>The agent can propose. Only your Move policy can approve.</sub>
</div>