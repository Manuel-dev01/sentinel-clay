# Getting started

Run Sentinel end to end: the Move package, the test suites, and the web app. Everything works on
**Sui testnet** out of the box, and the app runs with no API keys (a self-custodial demo wallet plus a
deterministic agent), so you can see the full flow before configuring anything.

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| [Sui CLI](https://docs.sui.io/guides/developer/getting-started/sui-install) | 1.74+ | for `sui move build` / `sui move test` |
| Node.js | 20+ | runs the web app + SDK tests |
| [pnpm](https://pnpm.io/installation) | 9+ | the repo is a pnpm workspace |

## 1. Clone

```bash
git clone https://github.com/Manuel-dev01/sentinel-clay.git
cd sentinel-clay
```

## 2. Build + test the Move package

DeepBook is vendored (`sentinel/vendor/deepbook` with a corrected `Published.toml`), so a fresh clone
builds and links against live testnet DeepBook with no `--allow-dirty` and no cache edits.

```bash
cd sentinel
sui move build
sui move test          # 34 passed - policy, recipient binding, witness rotation, invariants, fuzz, differential
cd ..
```

Optional - the Nautilus stretch package (provable agent strategy, see
[architecture](architecture.md#nautilus-provable-agent-strategy)):

```bash
cd nautilus && sui move test   # 4 passed - ed25519 proposal verification
cd ..
```

## 3. Install the workspace + run the app

```bash
pnpm install
pnpm --filter @sentinel/sdk test    # 6 passed - keccak <-> Move parity, seal_id codec
pnpm --filter web dev               # -> http://localhost:3000
```

With **no keys set**, the app runs on a self-custodial demo wallet (a browser keypair + the testnet
faucet) and the agent uses a deterministic heuristic. The full flow - set a mandate, propose a trade,
approve it, watch a rogue trade abort - works immediately.

## 4. (Optional) configure keys

Add the keys below to `web/.env.local` (see `web/.env.example`) to switch on Google / zkLogin
onboarding and the LLM agent.

| Var | Purpose | Where to get it |
|-----|---------|-----------------|
| `NEXT_PUBLIC_ENOKI_API_KEY` / `ENOKI_SECRET_KEY` | zkLogin + sponsored gas | [portal.enoki.mystenlabs.com](https://portal.enoki.mystenlabs.com) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google OAuth (register it in Enoki too) | [console.cloud.google.com](https://console.cloud.google.com) |
| `DEEPSEEK_API_KEY` | the "Yield Hunter" agent (server-only) | [platform.deepseek.com](https://platform.deepseek.com) |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` + `AGENT_MANDATE_ID` | so the app reads the autonomous worker's live feed (server-only; see step 5) | [upstash.com](https://upstash.com) |
| `NEXT_PUBLIC_SENTINEL_PKG`, `NEXT_PUBLIC_APP_REGISTRY` | on-chain ids (testnet defaults shipped) | - |

> `.env.local` is gitignored. When deploying (e.g. Vercel), set these in the host's environment
> settings and add your deployed URL to the Google OAuth origins and the Enoki project's allowed
> origins. `NEXT_PUBLIC_FORCE_LOCAL=1` forces the demo wallet for local development.

## 5. (Optional) run the autonomous agent

The web app lets you propose on demand, but the agent can also run **24/7 on its own**. The worker in
[`agent/`](../agent) ticks on an interval, reads the on-chain mandate + live DeepBook, asks the LLM for
a trade within budget, and **streams proposals** to an [Upstash Redis](https://upstash.com) feed the
`/agent` page renders live. It holds **no key** and never signs - you still approve each settle, and
Move re-checks on-chain. See [how it works](architecture.md#the-autonomous-agent-worker).

```bash
cp agent/.env.example agent/.env       # fill AGENT_MANDATE_ID + UPSTASH_* (+ DEEPSEEK_API_KEY)
pnpm --filter @sentinel/agent dev      # ticks every ~12s; logs each proposal
```

Set the same `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (and `AGENT_MANDATE_ID`) in
`web/.env.local` (and in your Vercel project's env, to light up the feed on the deployed site) so the
app can read it. The `/agent` screen then shows an "agent live" heartbeat and proposals appearing with
**no clicks**; without these vars the feed is simply empty and the manual propose button still works.

Running the worker **locally is free**. To host it always-on, deploy `agent/` to any worker host
([`agent/render.yaml`](../agent/render.yaml) is a Render Background Worker blueprint - note Render
workers require a paid plan; Railway and similar also work).

## 6. Walk the demo

1. **Wallet** - sign in with Google (zkLogin) or create a demo wallet; fund it from the faucet.
2. **Mandate** - set the daily cap, allowed asset categories, markets, and expiry; arm it in one
   signature.
3. **Agent** - the agent proposes a compliant trade; approve it and watch it settle and fill on
   DeepBook.
4. **The wow** - trigger the tampered agent: an over-cap trade aborts on-chain with `E_OVER_CAP`, and
   a replayed authorization aborts with `E_REPLAY`.
5. **Activity** - every proposal and verdict is written to Walrus as an immutable audit entry.

Next: read [how it works](architecture.md), or [integrate the SDK](sdk.md) into your own agent.
