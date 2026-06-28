# Sentinel - demo & test checklist

A runnable checklist to exercise the whole app and surface bugs. Tick each box; the **Expect** line is
the pass condition. Reference ids are at the bottom.

> Thesis under test: *the agent only proposes; a Move policy enforces the budget on every trade; the
> agent never holds a key.* The wow is the **on-chain abort** of a rogue or replayed trade.

---

## 0. Setup
- [ ] **Local:** `pnpm install` at the repo root, then `pnpm --filter web dev` → open `http://localhost:3000`.
- [ ] **Env (optional):** `web/.env.local` has `DEEPSEEK_API_KEY` (agent), `NEXT_PUBLIC_ENOKI_API_KEY` +
      `ENOKI_SECRET_KEY` + `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (zkLogin). With none set, the app still runs
      (demo wallet + heuristic agent).
  - **Expect:** the app loads with no console errors; no keys required to proceed.
- [ ] **Vercel:** the same vars are set in Project → Settings → Environment Variables, and the deploy is
      current. Google OAuth + Enoki origins include the Vercel URL.

## 1. Landing (`/`)
- [ ] Hero number **animates** 0 → $48.20; the stat strip animates 0 → 100% and 0 → 2.
  - **Expect:** a visible count-up on load (not frozen).
- [ ] "Try the policy" simulator: SWAP 5 / 12 / 28 fill the budget green; **SWAP 500** and **REPLAY LAST
      AUTH** show a red `ABORTED` row with the real codes (`E_OVER_CAP` / `E_REPLAY`).
  - **Expect:** verdicts + abort codes match the Move policy.
- [ ] No em-dashes anywhere on the page.

## 2. Wallet (`/wallet`)
- [ ] **Sign in:** "Continue with Google" (zkLogin, if Enoki set) **or** "Create demo wallet".
  - **Expect:** an address appears in the top bar.
- [ ] **Copy address:** click `copy` → it shows `copied ✓`; paste elsewhere to confirm the **full** address.
- [ ] **Faucet:** "Get testnet SUI" → balance rises within a few seconds (request twice if you want headroom).
  - **Expect:** SUI balance > 0 (need at least ~0.6 SUI for the demo).

## 3. Mandate (`/mandate`)
- [ ] Slider defaults to **0.5 SUI/day** with a `$` estimate; range 0.1–5.
- [ ] Toggle categories / market; the "in plain words" sentence updates live.
- [ ] "Continue to arm" → the real `seal_approve` source shows → **"Arm mandate · sign once"**.
  - **Expect:** one signature; the mandate is created on-chain; you land on `/agent`. (zkLogin: gas sponsored.)

## 4. Agent dashboard (`/agent`)
- [ ] Budget meter reflects the on-chain cap (0.5 SUI), nonce shows `0`.
- [ ] **"Agent: propose a trade"** → a proposal appears with a plain-English rationale (DeepSeek) and a
      predicate panel of PASS checks; the verdict reads `policy: PASS`.
  - **Expect:** the proposed amount is affordable (≤ your balance) and ≤ the budget.
- [ ] **Approve on-chain** the compliant proposal.
  - **Expect:** `settled` with a tx digest; some DEEP delivered; budget meter + nonce advance.

## 5. The wow - rogue & replay (do after at least one settle)
- [ ] **"Tampered agent · over-cap"** → a red proposal; predicate panel shows budget **FAIL**.
- [ ] Approve it.
  - **Expect:** `aborted · E_OVER_CAP` with a committed (reverted) tx; **no funds moved**; budget unchanged.
- [ ] **"Tampered agent · replay"** → approve it.
  - **Expect:** `aborted · E_REPLAY` (a recycled authorization against the rotated nonce). Requires the
        prior settle in step 4.

## 6. Activity (`/activity`)
- [ ] Settled payments are listed (read from `PaymentSettled` events) with explorer links.
- [ ] **Walrus audit trail:** each proposal/verdict has a `blob …` link (opens the Walrus aggregator) and an
      `owner-decrypt` button.
  - **Expect:** the blob link returns bytes; decrypt shows the record (or, best-effort, notes the ciphertext
        is on Walrus). Rogue/replay aborts appear as `ABORTED` entries.

## 7. Edge cases / resilience
- [ ] **Budget > balance:** the agent declines to over-propose ("wallet balance too low - faucet").
- [ ] **No DeepSeek key:** proposals still appear (heuristic), labelled `heuristic`.
- [ ] **No Enoki:** the wallet screen offers "Create demo wallet" instead of Google.
- [ ] **Revoke mandate** (Agent screen) → returns to an un-armed state.

## Reference
| Thing | Value |
|------|-------|
| Live app | https://sentinel-clay-web.vercel.app/ |
| Package | `0x7a7ee7186ccb69b2b250e7b08fc31b8ccfadae9a7596a352112f7aa3e72a77f9` |
| App market registry | `0x8b49d0d7afde529a8784f3f255b1fa2168519988aae242f5bf3a881b6a7f7c1f` |
| DEEP_SUI pool | `0x48c95963e9eac37a316b7ae04a0deb761bcdcc2b67912374d6036e7f0e9bae9f` |
| Explorer | https://suiscan.xyz/testnet |

## Known limitations (honest)
- Real DeepBook fills depend on testnet liquidity; if a compliant fill shows `0 DEEP`, the **policy
  enforcement is unaffected** (the abort beats are the wow). A deterministic MockPool venue is available
  in the Move package if a fully liquidity-independent fill is needed.
- The Seal key-server decrypt is best-effort; the audit blob is always written to Walrus (Seal-encrypted
  when key servers are reachable, plaintext otherwise).
- zkLogin sponsored-sign falls back to user-paid gas if the sponsor seam errors.
