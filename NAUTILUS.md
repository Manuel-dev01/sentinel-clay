# Sentinel x Nautilus - provable agent strategy (stretch)

> Status: **design + on-chain verifier module + mock-attestation path** shipped and tested.
> A live AWS Nitro enclave deploy is the optional last mile (see "Live deploy"); the submission
> never depends on it. This is the CLAUDE.md §6 Stage 6 / §4 "optional Nautilus TEE" stretch.

## Why add a TEE at all

Sentinel's core guarantee is already complete without a TEE: the agent holds no key, and a Move
policy aborts any trade that breaks the mandate. The agent can *propose* garbage; it can never
*settle* it. So what does a TEE add?

**It closes the one remaining trust gap: "is this proposal really from the strategy I think is
running?"** Today the proposal is just data from a server. A judge has to trust that the server is
running the published "Yield Hunter" code and not a tampered fork that front-runs the user or leaks
the strategy. Nautilus removes that trust: the agent runs inside an AWS Nitro **enclave**, and every
proposal it emits is signed by a key that **only exists inside the enclave** and is bound, by a
hardware attestation, to the exact code measurement (PCR0) of the published strategy.

The result: **"this proposal provably came from the attested strategy binary, running unmodified,
in an isolated enclave."** Combined with the existing Move policy, you get *provable logic* on top
of *enforced limits*.

This is additive and non-custodial: the enclave key signs *proposals* (data), never *settlements*.
Custody stays with the user's zkLogin wallet. The thesis ("the agent never holds a spending key")
is untouched - the enclave key is an authorship attestation, not a spending authority.

## Architecture

```
  AWS Nitro Enclave (isolated, no persistent storage, no operator shell)
  ┌───────────────────────────────────────────────────────────┐
  │  Yield Hunter strategy (the published agent binary)          │
  │   · reads DeepBook quotes + the on-chain mandate             │
  │   · forms a PaymentIntent proposal                           │
  │   · signs  H(proposal)  with the enclave-only key  ──────────┼──┐
  │  Attestation: Nitro Security Module signs a document binding │  │
  │   the enclave public key to PCR0 (code measurement) ─────────┼┐ │
  └───────────────────────────────────────────────────────────┘│ │
                                                                 │ │
   one-time registration                  per-proposal           │ │
        │ attestation doc                       │ signed proposal │ │
        ▼                                        ▼                │ │
  ┌──────────────────────────────────────────────────────────────▼─▼──┐
  │  Move:  sentinel_nautilus::enclave                                  │
  │   register_enclave(attestation)  ->  EnclaveConfig{ pk, pcr0 }      │
  │       · verifies the Nitro attestation chain (AWS root of trust)    │
  │       · pins the expected PCR0 (the published code hash)            │
  │   verify_proposal(config, payload, sig)  -> bool / abort            │
  │       · the agent's proposal is authentic iff signed by the         │
  │         enclave key registered against the expected PCR0            │
  └────────────────────────────────────────────────────────────────────┘
                                  │ authentic proposal
                                  ▼
                 existing Sentinel flow: policy::check + one-shot Witness + settle
```

Two on-chain steps:

1. **Register (once):** establish an `EnclaveConfig { public_key, pcr0, attested, expiry_ms }`. In
   production (live deploy) you submit the enclave's attestation document and the Move module verifies
   it against AWS's Nitro root of trust and the *expected* PCR0 (the code measurement of the published
   strategy, committed in the repo), setting `attested = true`; a tampered binary produces a different
   PCR0 and is rejected. Today the shipped `register_dev` records the key directly with
   `attested = false` (the mock path below).

2. **Verify (per proposal):** before a proposal is shown/settled, `verify_proposal` checks the
   proposal payload was signed by the registered enclave key. Authentic proposals carry a provable
   "from the attested strategy" stamp; anything else is just unattested data and is flagged.

## On-chain module

`sentinel_nautilus::enclave` (a **separate package** from `sentinel`, so the audited core is never
destabilized by the stretch). The shipped surface today (`nautilus/sources/enclave.move`):

- `register_dev(public_key, pcr0_label, expiry_ms, ctx): ID` - registers a public key as the
  "enclave" with `attested = false` (the dev/mock path; see below). Shares an
  `EnclaveConfig { public_key, pcr0, attested, expiry_ms }` and returns its id.
- `verify_proposal(cfg: &EnclaveConfig, payload: vector<u8>, sig: vector<u8>, clock: &Clock): bool`
  - true iff `sig` is a valid enclave-key signature over `payload` and the config has not expired.
- `assert_proposal(cfg, payload, sig, clock)` - the aborting variant; aborts `E_EXPIRED` / `E_BAD_SIG`.
- Accessors: `public_key`, `pcr0`, `is_attested`, `expiry_ms`, `is_expired`.

Signature verification uses Sui's native **`sui::ed25519`**, so the per-proposal check is cheap and
on-chain. The production attested-registration entry (`register_enclave`, which parses the Nitro
attestation document and sets `attested = true`) is the live-deploy last mile - see "Live deploy"
below. It is **not** in the current module, which ships the dev path plus the full verification
machinery. The heavy part it adds is attestation parsing (CBOR/COSE + the AWS cert chain).

## Mock-attestation path (what runs today, no AWS needed)

To keep the story demoable without provisioning Nitro hardware, the module accepts a **dev-mode
registration** that takes a public key directly (instead of parsing a real attestation), guarded so
it is unmistakable in the demo:

- `register_dev(public_key, pcr0_label, expiry_ms, ctx)` - registers a locally generated keypair as
  the "enclave," `attested = false`, clearly labelled `DEV / unattested` on-chain and in the UI.
- The off-chain agent generates an ephemeral keypair, signs each proposal payload with it, and the
  same `verify_proposal` path checks it on-chain.

This exercises the **entire end-to-end mechanism** - sign a proposal off-chain, verify authorship
on-chain, bind it to the registered key - identically to the real flow. Only the *root of trust*
differs (a dev keypair vs an AWS-attested enclave key). The demo can show "authentic proposal
verifies / a forged proposal fails `E_BAD_SIG`," which is the same shape as the production claim.

> Honesty rule (CLAUDE.md §2: verified over optimistic): the dev path is labelled `unattested`
> everywhere. We never claim a real TEE attestation that we did not produce. The mock proves the
> *verification machinery*; the real Nitro deploy (below) would supply the *hardware root of trust*.

## Live deploy (optional last mile, never blocks submission)

To make the attestation real:

1. Build the Yield Hunter strategy into a reproducible enclave image (EIF); record its PCR0.
2. Run it on an AWS Nitro-enabled EC2 instance; the Nitro Security Module issues the attestation
   document binding the in-enclave public key to that PCR0.
3. Submit the attestation to a `register_enclave(expected_pcr0, attestation_bytes, clock, ctx)` entry
   - the planned production registration that verifies the AWS cert chain on-chain, pins PCR0, and
   sets `attested = true`. This entry ships with the live enclave; it is not in the current module.
4. The enclave signs proposals; the already-shipped `verify_proposal` / `assert_proposal` gate them.

Cost/risk: standing up Nitro + the on-chain CBOR/COSE attestation parser is the heavy lift and is
gated behind the mainnet deploy (Stage 6 E2). If Nitro is not reachable at submission time, the
mock-attestation path above carries the demo, and this section documents exactly what the real
deploy adds. Mysten's `nautilus` reference (AWS Nitro + on-chain verifier) is the basis for the
attestation-parsing implementation.

## What a judge sees

- The agent's proposal in the UI carries an **"attested by enclave"** (or **"DEV / unattested"**)
  badge derived from the on-chain `verify_proposal` result.
- A tampered/forged proposal fails verification (`E_BAD_SIG`) - visible, like the policy aborts.
- Together with the existing Move policy: **provable logic** (this is the strategy that ran) +
  **enforced limits** (it can only spend within your mandate) = an agent you can switch on without
  trusting either the operator or the agent.
