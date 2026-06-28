# @sentinel/sdk - off-chain authorization layer

The agent **proposes**; it authorizes nothing. This package turns a proposed `PaymentIntent` into the
one-shot witness material `payment::pay_*` needs - *if* it is allowed to - and builds the venue PTBs.
On-chain Move re-checks and aborts regardless: the provider is an optimization, never the law.

## Pieces
| Module | Role |
|--------|------|
| `provider.ts` | `AuthorizationProvider` interface + `WitnessMaterial` + `PolicyDeniedError` |
| `localWitness.ts` | **default / guarantee.** Deterministic `preimage_n = keccak256(seed‖bcs(n))`; `keccak256(preimage_n)` is the on-chain commitment. Byte-identical to `payment::commitment_of`. |
| `sealProvider.ts` | **Seal adapter (Model B).** Pre-encrypts each preimage under `id = mandate_id‖nonce`; the agent decrypts preimage_n only by passing the key-server dry-run of `seal_approve` with its actual intent. Policy-deny ⇒ `PolicyDeniedError`; key servers unreachable ⇒ graceful fallback to local. |
| `auditLog.ts` | `SealAuditLog` - encrypt each proposal+verdict (owner-only decrypt via `seal_approve_owner`); the ciphertext is what Stage 5 writes to Walrus. |
| `paymentClient.ts` | Builds + signs the `pay_mock` / `pay_real` PTBs from the witness material. |
| `sealId.ts` | The Move `sentinel::seal_id` codec, mirrored byte-for-byte. |
| `keccak.ts` | Ethereum Keccak-256 (matches `sui::hash::keccak256`; **not** NIST sha3). |

## Test / run
```bash
pnpm install
pnpm test            # keccak↔Move parity (on-chain C0/C1), seal_id codec round-trip
pnpm smoke           # live testnet run - needs SENTINEL_PKG + SUI_PRIVATE_KEY (a funded signer)
```
`pnpm smoke` is opt-in: it needs a funded signer key, which is intentionally never committed or exported
(CLAUDE.md §9 - the agent never holds a key). In Stage 5 a zkLogin wallet signs in-browser. Seal key
servers are configured via `SEAL_KEY_SERVERS` (the SDK's `getAllowlistedKeyServers` helper was removed).

Notes: sui 2.x client is `SuiJsonRpcClient` (`@mysten/sui/jsonRpc`); it exposes `.core`, so it is also the
Seal-compatible client. Tested against `@mysten/sui` 2.20 and `@mysten/seal` 1.2.2.
