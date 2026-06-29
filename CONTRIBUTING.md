# Contributing to Sentinel

Thanks for your interest. This guide covers the GitHub flow and the checks to run before opening a
pull request. For a full local setup, see [docs/getting-started.md](docs/getting-started.md).

## Project layout

| Path | What it is |
|------|------------|
| `sentinel/` | The Move package - the load-bearing policy core. |
| `nautilus/` | The Move package for the provable-agent-strategy stretch (ed25519 verifier). |
| `sdk/` | The TypeScript off-chain layer (authorization providers, PaymentClient, audit log). |
| `web/` | The Next.js app (landing, wallet, mandate builder, agent, activity). |

## Fork and branch

```bash
# fork on GitHub, then:
git clone https://github.com/<you>/sentinel-clay.git
cd sentinel-clay
git checkout -b feat/short-description
```

Branch off `main`. Keep one logical change per branch.

## Run the checks

Before opening a PR, make sure these pass:

```bash
# Move - the policy core and the stretch verifier
cd sentinel && sui move build && sui move test      # 34 passed
cd ../nautilus && sui move test                      # 4 passed
cd ..

# TypeScript - SDK tests and a production build of the app
pnpm install
pnpm --filter @sentinel/sdk test                     # 6 passed
pnpm --filter web build                              # type-checks + builds
```

If you change the Move public interface, update the SDK and the web client to match, and add or adjust
tests. New behavior in the policy core should come with a test (an abort code, an invariant, or a
fuzz/differential case) - the test suite is the product's safety story.

## Conventions

- **Keep custody on the user's side.** The agent proposes; it must never hold a spending key. A change
  that has the agent sign a settlement will not be accepted.
- Match the surrounding code style; no new em-dashes in user-facing text or docs.
- Write clear commit messages (imperative mood, e.g. "add expiry check to policy::check").
- Internal/process docs (`CLAUDE.md`, `DECISIONS.md`, design comps) are gitignored - keep working notes
  out of the public history.

## Open a pull request

Push your branch and open a PR against `main` with:

- A short description of what changed and why.
- The output of the checks above (or a note that CI ran them).
- A linked issue if one exists.

## Reporting issues

Open a GitHub issue with steps to reproduce, what you expected, and what happened (include the network,
package id, and any tx digest if it is on-chain behavior).
