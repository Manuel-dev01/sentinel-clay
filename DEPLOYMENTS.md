# DEPLOYMENTS.md — Sentinel

On-chain deployment record. One row per publish. Keep newest at top.

| Date | Stage | Network | Package ID | Publisher address | Notes |
|------|-------|---------|------------|-------------------|-------|
| 2026-06-26 | 2 | testnet | `0x6b0aa9c6e7efc655a71529aed597a1abbc71adeb16920a56bbd62e2a588e972b` | `0x14c6ce9f17daec0d358b01becc22aeff722123634cddb88d911b8c40f98c37cb` | One-shot `Witness` (no copy/drop/store) + keccak256 commitment rotation. 23 tests green (+replay/forged/rotation). Replay aborts `E_REPLAY` on-chain. No DeepBook yet. |
| 2026-06-26 | 1 | testnet | `0x2a4b9e2a4ee9f7797a0f421fab01cdc2a077ea4dd602b648e248a1e82149a222` | `0x14c6ce9f17daec0d358b01becc22aeff722123634cddb88d911b8c40f98c37cb` | Mandate + policy core (7 modules incl. new `policy`). 18 tests green (abort matrix, invariant, fuzz, differential). No witness/DeepBook yet. |
| 2026-06-26 | 0 | testnet | `0xc7d0bbff70c96fc47eb7ff36c50bb11800db78133ff649500d67b4d729ca9e32` | `0x14c6ce9f17daec0d358b01becc22aeff722123634cddb88d911b8c40f98c37cb` | Empty compiling stubs (6 modules) + 1 trivial test. `build`+`test` green. |

> Fresh Package ID per checkpoint (Stage 0 `Published.toml` entry removed before the Stage 1 publish).
> Stage 0 package remains live on-chain at its ID; Stage 1 is the current canonical deployment.

## Key object IDs
| Object | ID | Stage |
|--------|----|-------|
| **Package (current)** | `0x6b0aa9c6e7efc655a71529aed597a1abbc71adeb16920a56bbd62e2a588e972b` | 2 |
| UpgradeCap (current) | `0xdae0f3cc07959aeee2a7a1f052486beeec96539ffa411a7c43ad16ccb921b00d` | 2 |
| Package (Stage 1) | `0x2a4b9e2a4ee9f7797a0f421fab01cdc2a077ea4dd602b648e248a1e82149a222` | 1 |
| UpgradeCap (Stage 1) | `0xc350c03adcc64e87caf15ab0d0ee30491eb70dab7b0e38bd8b9c361c7b412715` | 1 |
| Package (Stage 0) | `0xc7d0bbff70c96fc47eb7ff36c50bb11800db78133ff649500d67b4d729ca9e32` | 0 |
| UpgradeCap (Stage 0) | `0x556f1591d52a90b172cd09b29f2eff1957ac9f714f7fe1c13bfc3c7738c872d1` | 0 |

_Shared objects (Mandate, MarketRegistry) are created at runtime via `new_mandate` / `new_registry`._

## Transactions
- Publish (Stage 2): digest `iC5JpBzPopJt2Pxw7DFcsmSzwSjsLMkA1FxK72bqnXB` — status `success`, ~0.044 SUI.
- Publish (Stage 1): digest `45QRpJKYs2rP5MeAcpLGKJPBG9H3DcEXdVnj3qEdvZFb` — status `success`, ~0.041 SUI.
  Modules: `errors, execution, mandate, market_registry, payment, policy, seal_policy`.
- Publish (Stage 0): digest `BQ3CapeEAC6naMSFoQvKGZUG8aUi8SC3ywM6ZnPZm4nY` — status `success`.

## Live Stage 2 smoke (on-chain, 2026-06-26) — the REPLAY wow, proven on testnet
Package `0x6b0a…972b`. Commitments computed via on-chain `dev-inspect` of `payment::commitment_of`
(Node can't reproduce Sui's Ethereum-Keccak): `C0 = keccak256("preimage-zero")`, `C1 = keccak256("preimage-one")`.

| Beat | Tx digest | Result |
|------|-----------|--------|
| new_mandate (cap 50, commitment C0) | (see object below) | success |
| compliant pay (amount 40, witness preimage_0, next=C1) | `DdDYYMzw3Q7BLnv6j7FEUhTZgqJfCxdwKsX4khQG3PTE` | ✅ settled, `PaymentSettled{nonce:0}`; mandate rotated → nonce 1, commitment C1, spent 40 |
| **replay (reuse nonce-0 witness, fresh nonce-1 intent)** | `3aNnknYgG1iNHNM7qkm1Ehe5ySfRTLXTcaQgKXAcWLPH` | ⛔ committed **failure**: `MoveAbort(payment::pay, 7)` = **E_REPLAY** |

Runtime object IDs (Stage 2, testnet):
- MarketRegistry: `0xf41b4fd1f57a48388782270e67ab36f4ed8d6c6c5fdb19cfd90447db8812e01d`
- Mandate (cap 50, post-smoke nonce 1): `0xa482b058137f74c6e0687cdb82f8e855e984bebba99125f27f8ac7d10a5a4ce5`
- C0 `0x3f52c25acf76cf3216f0ceae5dc5777be6a68d25044a5851aac232d3fc2f3a59` · C1 `0xe234b659e85a1fee3b8bcda1acb2245c633cbb248e6e60897bd876bb3352ed27`

Combined with the Stage 1 smoke, both demo aborts are now real & explorer-visible:
`E_OVER_CAP` (`6aVwy…`), `E_MARKET` (`FfAzT…`), `E_REPLAY` (`3aNnk…`).

## Live Stage 1 smoke (on-chain, 2026-06-26) — the wow, proven on testnet
Package `0x2a4b…a222`. Created a real registry + mandate (cap 50, category 0), then ran a
compliant trade (settles) and two rogue trades (aborted on-chain by `policy::check`).

| Beat | Tx digest | Result |
|------|-----------|--------|
| new_registry | `92Srrga3z435odi2x8rZSVwTzE9s5p8WQkUbKcq8TdYa` | success |
| add_market(0x…beef) | `5ofXiwXdHdsF21jCoaZTjuFXVYt5sYzcNzjcrpYUoMgk` | success |
| new_mandate (cap 50, cats [0]) | `E1KHLYrLuDzmvjNfNJUbMk1gTxeYFPvfApQzk2SUSxXK` | success |
| compliant pay (amount 40) | `G8oVNJpTZ4wpTDUu2AAwYabKGaudo6h16KNzWt8ExPr7` | ✅ settled, `PaymentSettled{amount:40,category:0,nonce:0}` |
| rogue pay (amount 500, over cap) | `6aVwyWSTsKhGtC1jhULPqGqWiL7SuWVB8bt5bVSxQFMN` | ⛔ committed **failure**: `MoveAbort(policy::check, 1)` = E_OVER_CAP |
| rogue pay (wrong market 0x…dead) | `FfAzTn3kqtEsUiEi2V6qhtAnx2vsYeRfBthtdsbCGKDM` | ⛔ `MoveAbort(policy::check, 3)` = E_MARKET |

Runtime object IDs (testnet):
- MarketRegistry (shared): `0x9cb7ee4aa88ae2a1c4647dc94dfd581ab1ebc06fc015925d093d7a7a3eef6dbe`
- Mandate (shared, cap 50): `0xd35d415625daa95cdfa75c926fdfd9bcd5c4200c5c725429fb06adabbbae14b0`
- Allowed pool (allowlist entry): `0x…beef`

Note: nonce stayed 0 across both compliant and rogue pays (Stage 1 does not rotate it) — replay
protection (E_REPLAY) lands in Stage 2.

## Toolchain
- sui CLI: **1.74.0-d034d564f84b** (testnet release), installed via direct binary
  (`sui-testnet-v1.74.0-windows-x86_64.tgz`) after suiup's bundled download failed on a
  flaky link; binary at `~/.local/bin/sui.exe` (already on persistent user PATH).
- suiup: 0.0.13 (kept for later `walrus`/`mvr` installs).
- Active env: **testnet** (`https://fullnode.testnet.sui.io:443`).
- Active address: `0x14c6ce9f17daec0d358b01becc22aeff722123634cddb88d911b8c40f98c37cb`
  — funded: 2.45 SUI, 20 USDC, 500 DeepBook USDC.
