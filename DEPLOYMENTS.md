# DEPLOYMENTS.md - Sentinel

On-chain deployment record. One row per publish. Keep newest at top.

| Date | Stage | Network | Package ID | Publisher address | Notes |
|------|-------|---------|------------|-------------------|-------|
| 2026-06-28 | 6 | **mainnet** | `0xd37ca38e54a3218bbdf7417b9817d0075ebd56ed65584a382af87854e2605066` | `0x14c6ce9f17daec0d358b01becc22aeff722123634cddb88d911b8c40f98c37cb` | **MAINNET deploy.** Same source as the testnet canonical, linked against mainnet DeepBook (`0x0e735f…`, lineage `0x2c8d60…`). Publisher SUI arrived in Sui's **address-balance** accumulator (exchange `send_funds`), which CLI 1.74 cannot select as a gas coin - so published via SDK (gas paid from address balance) signed with `sui keytool sign` (**key never left the keystore**). Publish tx `JCKDTvQo…`. **Mainnet smoke:** `new_mandate`+registry created; compliant `seal_approve` **success** (`2z8CxQ6C…`); over-cap `seal_approve` **aborts `E_OVER_CAP`** (`6JWnSZKX…`, `MoveAbort policy::check, 1`). |
| 2026-06-26 | 4 | testnet | `0x7a7ee7186ccb69b2b250e7b08fc31b8ccfadae9a7596a352112f7aa3e72a77f9` | `0x14c6ce9f17daec0d358b01becc22aeff722123634cddb88d911b8c40f98c37cb` | **Seal adapter + caveat closed.** DeepBook **vendored** (`vendor/deepbook`, published-at→`0xa3886a`) → clean build links `0xfb28c4→0xa3886a (v4)` with **no `--allow-dirty`**. `seal_approve` reworked to dry-runnable `entry fun` + `seal_id` codec + `seal_approve_owner`. 32 Move + 6 TS tests. Live: `pay_real` **20 DEEP** (`5SMBQo8B…`); `seal_approve` compliant (`3mVozzJP…`) / over-cap `E_OVER_CAP` (`DcUUFG8b…`). **Current canonical.** |
| 2026-06-26 | 4-interim | testnet | `0xff42de0ea207f3698b437f68efb1adde07c4e8898bf0dc551905eb9ed66f9a1f` | `0x14c6ce9f17daec0d358b01becc22aeff722123634cddb88d911b8c40f98c37cb` | Interim: `[dep-replacements.testnet]` attempt - sui 1.74 **ignored** the override, linkage stayed stale `0x74cd56` (real fill would version-guard abort). Superseded by the vendored build. |
| 2026-06-26 | 3.1 | testnet | `0xd3dc1607b52c49864e7298846dd0440ae8f49e3cc130babacc267697718d9a2e` | `0x14c6ce9f17daec0d358b01becc22aeff722123634cddb88d911b8c40f98c37cb` | DeepBook version-rev aligned via **cache patch + `--allow-dirty`** (superseded by vendoring). 28 tests, `pay_real` 20 DEEP (`FSiwLoHG…`), over-cap real-path abort (`EGDZtuoc…`). |
| 2026-06-26 | 3 | testnet | `0x180575cf365f77d5c48ee33ba8556cb1e6e69ab9d14d75f32153433a8035259a` | `0x14c6ce9f17daec0d358b01becc22aeff722123634cddb88d911b8c40f98c37cb` | DeepBook v3 + MockPool venue adapter. `pay_mock`/`pay_real` (coin-input, pool-id binding). 28 tests green. MockPool fill live; real DeepBook reached but version-skew aborted (fixed in 3.1). |
| 2026-06-26 | 3 | testnet | `0xe7edcd61f6aa0bb1048be10197feef9ddef938a785ef36d9219a9bee79b20936` | `0x14c6ce9f17daec0d358b01becc22aeff722123634cddb88d911b8c40f98c37cb` | Stage 3a: MockPool-only (no DeepBook dep) - the guaranteed beat secured before adding the dep. |
| 2026-06-26 | 2 | testnet | `0x6b0aa9c6e7efc655a71529aed597a1abbc71adeb16920a56bbd62e2a588e972b` | `0x14c6ce9f17daec0d358b01becc22aeff722123634cddb88d911b8c40f98c37cb` | One-shot `Witness` (no copy/drop/store) + keccak256 commitment rotation. 23 tests green (+replay/forged/rotation). Replay aborts `E_REPLAY` on-chain. No DeepBook yet. |
| 2026-06-26 | 1 | testnet | `0x2a4b9e2a4ee9f7797a0f421fab01cdc2a077ea4dd602b648e248a1e82149a222` | `0x14c6ce9f17daec0d358b01becc22aeff722123634cddb88d911b8c40f98c37cb` | Mandate + policy core (7 modules incl. new `policy`). 18 tests green (abort matrix, invariant, fuzz, differential). No witness/DeepBook yet. |
| 2026-06-26 | 0 | testnet | `0xc7d0bbff70c96fc47eb7ff36c50bb11800db78133ff649500d67b4d729ca9e32` | `0x14c6ce9f17daec0d358b01becc22aeff722123634cddb88d911b8c40f98c37cb` | Empty compiling stubs (6 modules) + 1 trivial test. `build`+`test` green. |

> Fresh Package ID per checkpoint (Stage 0 `Published.toml` entry removed before the Stage 1 publish).
> Stage 0 package remains live on-chain at its ID; Stage 1 is the current canonical deployment.

## Key object IDs
| Object | ID | Stage |
|--------|----|-------|
| **MAINNET package** | `0xd37ca38e54a3218bbdf7417b9817d0075ebd56ed65584a382af87854e2605066` | 6 |
| MAINNET UpgradeCap | `0xace01e916483451b51ef0ee74474ae4e4e20d44c627cb708b0fede1113bcc856` | 6 |
| MAINNET MarketRegistry (smoke) | `0xfefe6a4eb736aa0d693f9fa84f0f2a7648ae4436eec7fbfe42428c26241429d1` | 6 |
| MAINNET Mandate (smoke) | `0x207b4a4a74377dcf5cbaa8fa9d72c0f402c42b6a66cd8103c0689be612b214a2` | 6 |
| **Live app (Vercel)** | https://sentinel-clay-web.vercel.app/ | 5 |
| **App market registry** (shared, DEEP_SUI allowlisted; arming uses this) | `0x8b49d0d7afde529a8784f3f255b1fa2168519988aae242f5bf3a881b6a7f7c1f` | 5 |
| **Package (current)** | `0x7a7ee7186ccb69b2b250e7b08fc31b8ccfadae9a7596a352112f7aa3e72a77f9` | 4 |
| UpgradeCap (current) | `0x0250e15d0b4d32f859473813d31d3069062bd9a4e719240ff7aefc1b0d047cdf` | 4 |
| Package (Stage 3.1) | `0xd3dc1607b52c49864e7298846dd0440ae8f49e3cc130babacc267697718d9a2e` | 3.1 |
| UpgradeCap (Stage 3.1) | `0x9b414ff23f337ea2488a2f7c5a17f829e05e0860d78a9221e090d613d721bd8f` | 3.1 |
| Package (Stage 3) | `0x180575cf365f77d5c48ee33ba8556cb1e6e69ab9d14d75f32153433a8035259a` | 3 |
| UpgradeCap (Stage 3) | `0x4ebd7cb0382e2336e55c5f861e223bfc1c9cb056c8862f77f06f286e03f3e0c9` | 3 |
| Package (Stage 2) | `0x6b0aa9c6e7efc655a71529aed597a1abbc71adeb16920a56bbd62e2a588e972b` | 2 |
| UpgradeCap (Stage 2) | `0xdae0f3cc07959aeee2a7a1f052486beeec96539ffa411a7c43ad16ccb921b00d` | 2 |
| Package (Stage 1) | `0x2a4b9e2a4ee9f7797a0f421fab01cdc2a077ea4dd602b648e248a1e82149a222` | 1 |
| UpgradeCap (Stage 1) | `0xc350c03adcc64e87caf15ab0d0ee30491eb70dab7b0e38bd8b9c361c7b412715` | 1 |
| Package (Stage 0) | `0xc7d0bbff70c96fc47eb7ff36c50bb11800db78133ff649500d67b4d729ca9e32` | 0 |
| UpgradeCap (Stage 0) | `0x556f1591d52a90b172cd09b29f2eff1957ac9f714f7fe1c13bfc3c7738c872d1` | 0 |

_Shared objects (Mandate, MarketRegistry) are created at runtime via `new_mandate` / `new_registry`._

## Live Stage 4 smoke (on-chain, 2026-06-26) - vendored clean build + the Seal predicate
Package `0x7a7ee718…`, built from `vendor/deepbook` (NO `--allow-dirty`); linkage verified
`0xfb28c4 → 0xa3886a (v4)` and `0x36dbef (DEEP) v1`. Registry `0xae671e52d1c1c91adc940b983fa7743fa939286cefa74d7addc52ca85d8e5b59`,
mandate `0xfd624a8e8a744d02b3dee7ea5014c35ff142061d4da6408f4e5d3c0c81ca0506` (cap 0.6 SUI, cat [0], commitment C0).

| Beat | Tx | Result |
|------|-----|--------|
| **compliant `pay_real` 0.5 SUI → DEEP** (real venue, vendored build) | `5SMBQo8Bca7bWHZ6frwWSrMFh4BRCyCZFW9gcYdBP9zb` | ✅ `success`, `PaymentSettled{base_out:20000000}` = **20 DEEP delivered** |
| **`seal_approve` compliant** (amount 50M, nonce-1 id) | `3mVozzJPT3gEnH7vXfXKbhBJ2XnRRjRbFGyjabkxuYTp` | ✅ `success` - key servers would RELEASE the witness secret |
| **`seal_approve` over-cap** (amount 999M > 0.6 cap) | `DcUUFG8byRMPx2G2Fk8fTvcKbXPi18KFpa8DrkjWHRs9` | ⛔ `MoveAbort(policy::check, 1)` = `E_OVER_CAP` - key servers would DENY (same law as `pay`) |

The `seal_approve` calls exercise the EXACT predicate Seal key servers dry-run before releasing key
shares (intent encoded into the `id`, bound to (mandate, nonce), routed through the shared
`policy::check`). The Seal key-server `fetchKeys`/`decrypt` roundtrip + TS-driven execution are wired in
`sdk/` but not run live here (needs a funded signer; CLAUDE.md §9 forbids exporting the wallet key) -
deferred to the Stage 5 frontend where a zkLogin wallet signs in-browser. TS layer verified: 6/6 unit
tests (keccak↔Move parity on C0/C1, seal_id codec) + `tsc`.

## Live Stage 3.1 smoke (on-chain, 2026-06-26) - REAL DeepBook fill (version-rev aligned)
Package `0xd3dc1607…`. Linkage re-pointed deepbook → live `0xa3886aaa…068` (lineage `0xfb28c4…`,
v4); on-chain `linkage_table` verified `0xfb28c4 → 0xa3886a (v4)`. DeepBook core `0xa3886a…`,
DEEP token `0x36dbef…::deep::DEEP`, DEEP_SUI pool `0x48c95963…9bae9f` = `Pool<DEEP,SUI>`,
**whitelisted = true** (zero-DEEP fee → swap takes `coin::zero<DEEP>()`).

| Beat | Tx | Result |
|------|-----|--------|
| **compliant pay_real, 0.5 SUI → DEEP** (real venue) | `FSiwLoHG48xtWpwS6c2D8EhBfYtgh6jPmXwzyuvRz1Qb` | ✅ `success`, `PaymentSettled{amount:500000000, base_out:20000000}` = **20.00 DEEP delivered** to recipient (confirmed in wallet balance) |
| compliant pay_real, 0.05 SUI (below book lot) | `Czt9sAthSrS9cc2H9r6zSUgVrMJygesfJ18CPkejbUKd` | ✅ `success`, `base_out:0` - path settled on real DeepBook; amount too small to clear a lot |
| **over-cap pay_real, 200000000 > cap 50000000** (real venue) | `EGDZtuocitZUD5JfCkZSkgtwxrxQoJVpi3rb8LkHdJmG` | ⛔ committed **failure**: `MoveAbort(policy::check, 1)` = `E_OVER_CAP` at the pay command - **DeepBook swap never ran** (law before venue, real path) |

Runtime objects (3.1): registry `0x3ab37f81f216a1198dc89a8c68b0e00f4d4899459bc286551a894a5c765baa07`,
mandate(cap 0.1) `0x68e0d399…`, mandate2(cap 0.6, the 20-DEEP fill) `0x55aad2679d28541fe11540d60fdd9f88be7bf8a207804ab0db2667e050f54fb1`,
mandate3(cap 0.05, over-cap) `0xa4d58d9ae193edd4977cac899a8fccccc7380c61828bd3abd5f71583263d6da8`.
Received DEEP coins `0x0635ade7…`, `0x9ca45de0…`. Commitments: `C0 = keccak256(0x00) =
0xbc36789e…bcc98a`, `C1 = keccak256(0x01) = 0x5fe7f977…dcffd2`. Publish tx `6eXHrMQzhT4uDjbXq9AhKuJX5U5F74Pa1keCHQ1MC6qU`.

Root cause + fix: see DECISIONS.md (2026-06-26 "DeepBook version-rev ALIGNED"); rebuild helper
`sentinel/scripts/align-deepbook.sh`. The deployed package already embeds the correct linkage.

## Live Stage 3 smoke (on-chain, 2026-06-26) - venue execution
**MockPool fill (guaranteed beat)** on package `0xe7edcd61…` (Stage 3a). `MockPool<SUI,SUI>` price 2/1:

| Beat | Tx | Result |
|------|-----|--------|
| compliant pay_mock (40 quote → 80 base) | `38Q1RQwcfmucD7UPN45UwbCFcErjDGLhR1pA6NBsuEac` | ✅ settled, `PaymentSettled{amount:40, base_out:80}`, 80 base delivered to recipient |
| over-cap pay_mock (500, cap 50) | `ByywWqRLBASS8oM1qWqTjVvjcTikvRfZQbVwDicbBTYU` | ⛔ `MoveAbort(policy::check, 1)` = E_OVER_CAP - venue never ran (law before execution) |

Runtime objects: MockPool `0xb162aab3…db98`, registry `0xe8af5511…`, mandate `0x5afb8295…`.

**Real DeepBook fill (best-effort)** on package `0x180575cf…` (Stage 3, DeepBook-integrated),
DEEP_SUI pool `0x48c95963…` (spend SUI → DEEP):

| Beat | Tx | Result |
|------|-----|--------|
| live pay_real (0.1 SUI → DEEP, zero DEEP fee) | `CocqcxYZi9xgQzNbxXuj6hrBFZXw2Nyy524nv4rDA955` | ⚠️ reached DeepBook; aborted in `deepbook::pool::load_inner` code 11 (DeepBook **package-version guard**) |

Interpretation: Sentinel's amount-binding, pool-id binding, `policy::check`, and witness verify
ALL passed - the call composed into DeepBook's real swap and was stopped only by DeepBook's
version guard (our pinned deepbook `0x74cd56…` predates the enabled testnet `0x22be4c…`). A
dependency-rev alignment at demo freeze closes this; the MockPool fill is the gate. See DECISIONS.md.
Real-DeepBook objects: registry `0xab46b07a…`, mandate `0x73ce0ed7…`.

## Transactions
- Publish (Stage 3, DeepBook): digest `EAi9dGpqoHdTHNJqkHeKoY4CN4z3eBLmnrXbD22We3gq` - `success`.
- Publish (Stage 3a, MockPool): digest `mSRid5g1YN2Q9rrvJezD3SbdYQ6RLK92M3fX18QZPvW` - `success`.
- Publish (Stage 2): digest `iC5JpBzPopJt2Pxw7DFcsmSzwSjsLMkA1FxK72bqnXB` - status `success`, ~0.044 SUI.
- Publish (Stage 1): digest `45QRpJKYs2rP5MeAcpLGKJPBG9H3DcEXdVnj3qEdvZFb` - status `success`, ~0.041 SUI.
  Modules: `errors, execution, mandate, market_registry, payment, policy, seal_policy`.
- Publish (Stage 0): digest `BQ3CapeEAC6naMSFoQvKGZUG8aUi8SC3ywM6ZnPZm4nY` - status `success`.

## Live Stage 2 smoke (on-chain, 2026-06-26) - the REPLAY wow, proven on testnet
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

## Live Stage 1 smoke (on-chain, 2026-06-26) - the wow, proven on testnet
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

Note: nonce stayed 0 across both compliant and rogue pays (Stage 1 does not rotate it) - replay
protection (E_REPLAY) lands in Stage 2.

## Toolchain
- sui CLI: **1.74.0-d034d564f84b** (testnet release), installed via direct binary
  (`sui-testnet-v1.74.0-windows-x86_64.tgz`) after suiup's bundled download failed on a
  flaky link; binary at `~/.local/bin/sui.exe` (already on persistent user PATH).
- suiup: 0.0.13 (kept for later `walrus`/`mvr` installs).
- Active env: **testnet** (`https://fullnode.testnet.sui.io:443`).
- Active address: `0x14c6ce9f17daec0d358b01becc22aeff722123634cddb88d911b8c40f98c37cb`
  - funded: 2.45 SUI, 20 USDC, 500 DeepBook USDC.
