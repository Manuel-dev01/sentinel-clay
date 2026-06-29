# SDK integration guide

`@sentinel/sdk` is the off-chain layer between a trading agent and Sentinel's Move contract. It turns
a proposed trade into the one-shot witness material the contract needs - **if the policy permits it** -
and builds the settlement transaction. The contract re-checks and aborts regardless, so the SDK is an
optimization, never the authority.

> The SDK is a workspace package in this monorepo (`sdk/`). To use it in your own project, install it
> from the workspace, or vendor `sdk/src` until it is published.

## The pieces

| Export | Role |
|--------|------|
| `AuthorizationProvider` | Interface: turn a `PaymentIntentFields` into `WitnessMaterial`, or throw `PolicyDeniedError`. |
| `LocalWitnessProvider` | The always-available default. Deterministic witness from a seed; `keccak256(preimage_n)` is the on-chain commitment. |
| `SealMpcProvider` | Gates the witness secret behind Seal's key servers (the same on-chain policy). Degrades to local if the committee is unreachable. |
| `PaymentClient` | Builds + signs the `pay_real` (DeepBook) / `pay_mock` settlement PTBs from the witness material. |
| `SealAuditLog` | Encrypts each proposal + verdict (owner-only) for the Walrus audit trail. |
| `sealId`, `keccak` | The `mandate_id ‖ nonce` identity codec and Ethereum Keccak-256, mirrored byte-for-byte from Move. |
| `makeClient`, `keypairFromEnv`, `DEEPBOOK`, `SENTINEL_PACKAGE_ID` | Testnet client factory + constants. |

## Core types

```ts
interface PaymentIntentFields {
  mandateId: string;   // the on-chain Mandate object id
  poolId: string;      // the DeepBook pool the trade targets
  category: number;    // asset category (must be allowed by the mandate)
  amount: bigint;      // spend amount; equals the quote-coin value
  recipient: string;   // where the filled base asset goes
  nonce: bigint;       // must equal the mandate's current nonce
  expiryMs: bigint;    // per-intent deadline
}

interface WitnessMaterial {
  preimage: Uint8Array;        // the one-shot secret for `nonce`
  nonce: bigint;
  nextCommitment: Uint8Array;  // keccak256(preimage_{nonce+1}); what pay_* rotates to
}
```

## Authorize a proposal

The agent forms an intent and asks a provider to authorize it. A policy violation throws
`PolicyDeniedError`; the agent never gets witness material it is not entitled to.

```ts
import { LocalWitnessProvider, PolicyDeniedError, type PaymentIntentFields } from '@sentinel/sdk';

const provider = new LocalWitnessProvider(); // seed defaults to the shared test seed

const intent: PaymentIntentFields = {
  mandateId: '0x...mandate',
  poolId: '0x48c9...', // DEEP_SUI pool
  category: 0,
  amount: 400_000_000n, // 0.4 SUI
  recipient: '0x...you',
  nonce: 0n,
  expiryMs: BigInt(Date.now() + 60_000),
};

try {
  const witness = await provider.authorize(intent);
  // witness.preimage / witness.nonce / witness.nextCommitment
} catch (e) {
  if (e instanceof PolicyDeniedError) {
    // the intent violates the mandate - do not attempt to settle
  }
}
```

The seed the provider uses must match the commitment the mandate was created with. Seed the mandate's
initial `witness_commitment` from the same provider:

```ts
const initial = await provider.initialCommitment(); // pass to mandate::new_mandate
```

## Settle on-chain

`PaymentClient` builds the settlement PTB from the witness material and submits it. It runs the exact
`authorize -> execute` path the contract enforces.

```ts
import { PaymentClient, makeClient, keypairFromEnv, DEEPBOOK } from '@sentinel/sdk';

const client = makeClient();                 // SuiJsonRpcClient (testnet)
const signer = keypairFromEnv();             // your signer; custody stays with the user
const payments = new PaymentClient(client, signer);

const tx = payments.buildPayReal({
  registryId: '0x8b49...',   // the market registry the mandate is bound to
  intent,                    // the same PaymentIntentFields
  witness,                   // from provider.authorize(intent)
  // baseType / quoteType default to DEEP / SUI; minBaseOut optional (slippage floor)
});

const result = await payments.execute(tx);
// compliant -> PaymentSettled event; over-cap/replayed -> the tx aborts on-chain
```

`buildPayMock(args)` does the same against a deterministic `MockPool<B,Q>` (useful for tests and
liquidity-independent demos); it takes the pool object id and an owned `Coin<Q>` of exactly
`intent.amount`.

## Custody rule

The agent that calls `authorize` must **never** hold a spending key. In the app, the browser wallet
(or zkLogin session) signs the settlement; the agent only proposes. If a design has the agent sign a
settlement, that breaks the entire guarantee - keep signing on the user's side.

## Choosing a provider

- **`LocalWitnessProvider`** - deterministic, always available; the default and the fallback.
- **`SealMpcProvider`** - the agent decrypts each witness preimage only by passing Seal's key-server
  dry-run of `seal_approve`. If the key servers are unreachable it degrades to local, and on-chain
  enforcement never depends on the committee.

Either way, `payment::pay` re-checks the policy and aborts on any violation.

See [how it works](architecture.md) for the on-chain side of this flow.
