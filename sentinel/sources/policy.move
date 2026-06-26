/// The shared "law": `PaymentIntent` + the single policy predicate that BOTH
/// `payment::pay` (on-chain enforcement) and `seal_policy::seal_approve` (off-chain
/// dry-run) call. Because there is exactly one intent type and one check path, the
/// off-chain verdict can never diverge from on-chain enforcement (CLAUDE.md §7 inv. 5).
///
/// `evaluate` is non-aborting (returns 0 or the precise errors::E_* code) and
/// side-effect-free; `check` is the aborting wrapper. Keeping `evaluate` pure lets the
/// Seal key-server dry-run be honest and lets fuzz tests classify intents without an
/// abort halting the run. (Design logged in DECISIONS.md — a 7th module beyond §5.4.)
module sentinel::policy;

use sui::clock::{Self, Clock};
use sentinel::mandate::{Self, Mandate};
use sentinel::market_registry::{Self, MarketRegistry};
use sentinel::errors;

/// A proposed trade. `copy`+`drop` so it can be freely passed/dry-run; `store` so it can
/// live in events/off-chain payloads. The agent constructs these; it authorizes nothing.
public struct PaymentIntent has copy, drop, store {
    mandate_id: ID,
    pool_id: ID,
    category: u8,
    amount: u64,
    recipient: address,
    nonce: u64,
    expiry_ms: u64,
}

public fun new_intent(
    mandate_id: ID,
    pool_id: ID,
    category: u8,
    amount: u64,
    recipient: address,
    nonce: u64,
    expiry_ms: u64,
): PaymentIntent {
    PaymentIntent { mandate_id, pool_id, category, amount, recipient, nonce, expiry_ms }
}

// --- accessors ---
public fun mandate_id(i: &PaymentIntent): ID { i.mandate_id }
public fun pool_id(i: &PaymentIntent): ID { i.pool_id }
public fun category(i: &PaymentIntent): u8 { i.category }
public fun amount(i: &PaymentIntent): u64 { i.amount }
public fun recipient(i: &PaymentIntent): address { i.recipient }
public fun nonce(i: &PaymentIntent): u64 { i.nonce }
public fun expiry_ms(i: &PaymentIntent): u64 { i.expiry_ms }

/// Non-aborting verdict: returns 0 if compliant, else the precise `errors::E_*` code.
/// Side-effect-free. Evaluation order is fixed so the returned code is deterministic.
public fun evaluate(
    m: &Mandate,
    registry: &MarketRegistry,
    intent: &PaymentIntent,
    clock: &Clock,
): u64 {
    // mandate must be bound to THIS registry (defends against a swapped allowlist)
    if (mandate::registry_id(m) != market_registry::id(registry)) return errors::market();
    // per-intent deadline
    if (clock.timestamp_ms() > intent.expiry_ms) return errors::expired();
    // asset category must be allowed
    if (!mandate::category_allowed(m, intent.category)) return errors::category();
    // market must be in the registry allowlist
    if (!market_registry::is_allowed(registry, intent.pool_id)) return errors::market();
    // nonce must match the mandate's current nonce (Stage 2 rotates this on every spend)
    if (intent.nonce != mandate::nonce(m)) return errors::nonce();
    // daily cap, rollover-aware and overflow-safe (effective_spent <= daily_cap invariant holds)
    let cap = mandate::daily_cap(m);
    let spent = mandate::effective_spent(m, clock);
    if (spent > cap || intent.amount > cap - spent) return errors::over_cap();
    0
}

/// Aborting wrapper — the on-chain "law". `pay` and `seal_approve` both call this.
public fun check(
    m: &Mandate,
    registry: &MarketRegistry,
    intent: &PaymentIntent,
    clock: &Clock,
) {
    let code = evaluate(m, registry, intent, clock);
    assert!(code == 0, code);
}
