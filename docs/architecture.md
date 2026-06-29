# How Sentinel works

Sentinel lets you switch on an AI trading agent **without handing it your keys**. You fund a
self-custodial mandate wallet, set human-readable rules, and the agent can only *propose* trades. A
Move policy on Sui approves or aborts every one. This page explains the moving parts and how a payment
flows through them.

## The core idea

> The agent proposes. Only your Move policy can approve. Off-chain authorization is an optimization;
> on-chain Move is the law.

A compromised, buggy, or over-reaching agent cannot move funds it was not authorized to move, because
the settlement transaction re-checks your mandate on-chain and reverts if anything is off-budget,
off-market, expired, or replayed.

## The mandate

A **Mandate** is a shared on-chain object you own. It holds your rules:

- **Daily cap** - max spend per day, with automatic day rollover.
- **Allowed asset categories** - e.g. stablecoins, blue-chips.
- **Allowed markets** - a registry of permitted DeepBook pools.
- **Expiry** - the mandate auto-revokes after this time.
- **Witness commitment + nonce** - the rotating one-shot authorization (see below).

Only you (the owner) can create, change, or revoke a mandate. The agent can read it; it can never
change it.

## The payment flow

Every trade runs the same gauntlet, atomically, in one Programmable Transaction Block:

```
  agent (keyless)          your wallet signs            Move package on Sui
  ┌───────────────┐  intent ┌──────────────┐  pay_real  ┌──────────────────────────────┐
  │ reads DeepBook│────────▶│ approve + sign│───────────▶│ payment::pay                 │
  │ + the mandate │         └──────────────┘            │  1 assert mandate active     │
  │ proposes only │                                     │  2 policy::check             │
  └───────────────┘                                     │      budget·asset·market·    │
                                                        │      expiry·nonce            │
                                                        │  3 verify one-shot Witness   │
                                                        │  4 rotate commitment + nonce │
                                                        │  5 apply spend               │
                                                        │  6 execute on DeepBook       │
                                                        │  7 emit PaymentSettled        │
                                                        │     · any failure ABORTS all │
                                                        └──────────────────────────────┘
```

If step 2 or 3 fails, the whole transaction reverts - no funds move, and the failure is committed
on-chain for anyone to verify.

## The one-shot witness (no replay)

Authorization is a **`Witness`** resource with no `copy`, no `drop`, and no `store`. Move's type
system enforces, at compile time, that it cannot be duplicated, silently discarded, or stashed for
later. `payment::pay` checks that the witness matches the mandate's current commitment and nonce, then
**rotates** both in the same call. A used authorization can never validate again, so a replayed
trade aborts with `E_REPLAY`.

## The shared predicate (off-chain can't diverge from on-chain)

`payment::pay` and Seal's `seal_approve` call the **same** `policy::check` function. That means a
verdict released off-chain can never authorize a payment that on-chain Move would reject - they share
the code. A differential test proves the two accept and reject the identical set of intents.

## The keyless agent

The "Yield Hunter" agent runs server-side (`web/src/app/api/agent`) and holds **no keypair**. It reads
live DeepBook quotes and your mandate, then emits a `PaymentIntent` proposal with a plain-English
rationale. It can be backed by an LLM (DeepSeek) or a deterministic heuristic. Custody always stays
with your wallet; your zkLogin session signs the settlement.

## The Sui stack

| Primitive | Role in Sentinel |
|-----------|------------------|
| **Move** | The mandate object, the dry-runnable `seal_approve` predicate, the one-shot `Witness`, and the atomic check-rotate-execute path. This is the load-bearing core. |
| **DeepBook v3** | The on-chain order-book venue where compliant trades execute. The agent reads live mid/quote via dev-inspect. |
| **Seal** | Identity-based threshold encryption gates *release of the one-shot witness secret*: the agent can decrypt its authorization only if `seal_approve` (the same `policy::check`) passes. Rogue intents are denied off-chain and re-aborted on-chain. Seal also encrypts the audit log (owner-only). |
| **Walrus** | The immutable audit log - every proposal and verdict is stored as a (Seal-encrypted) blob. |
| **zkLogin + Enoki** | Google sign-in with sponsored gas, so a new user needs no wallet and no SUI to try it. |

## Nautilus: provable agent strategy

A stretch feature in the separate `nautilus/` package. Today the Move policy already guarantees the
agent can only spend within your mandate. Nautilus closes the remaining trust gap - *is this proposal
really from the published strategy, not a tampered fork?* - by running the agent inside an AWS Nitro
**enclave** and signing each proposal with a key that only exists inside it. An on-chain ed25519
verifier (`sentinel_nautilus::enclave`) binds proposals to that attested key.

What ships today: the verifier module + a dev/mock registration path, tested end to end. The remaining
last mile is the live hardware attestation (parsing the AWS Nitro attestation document on-chain). This
is additive and non-custodial - the enclave key signs *proposals* (data), never settlements.

## Repo layout

```
sentinel/   Move package: mandate · policy · payment · seal_policy · execution · market_registry
            · seal_id · errors, plus vendored deepbook
nautilus/   Move package (stretch): the enclave proposal-authorship verifier (ed25519)
sdk/        TypeScript: AuthorizationProvider (local + Seal), PaymentClient, SealAuditLog
web/        Next.js app: landing, wallet, mandate builder, keyless agent, settle, Walrus audit
```

See [getting-started](getting-started.md) to run it, or [the SDK guide](sdk.md) to integrate it.
