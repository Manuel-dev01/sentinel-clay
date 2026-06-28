/// Mandate object: per-user spending rules + daily-spend accounting + (Stage 2)
/// witness commitment/nonce. Shared object (consensus-ordered) - agent proposals and
/// owner revocations both touch it. Mutating fns are owner-gated; the agent never
/// holds a key. (CLAUDE.md §5.1)
module sentinel::mandate;

use sui::vec_set::{Self, VecSet};
use sui::clock::{Self, Clock};
use sentinel::errors;

const MS_PER_DAY: u64 = 86_400_000;

public struct Mandate has key {
    id: UID,
    owner: address,
    daily_cap: u64,
    spent_today: u64,
    day_epoch: u64, // day index (timestamp_ms / MS_PER_DAY) the spend total belongs to
    allowed_categories: VecSet<u8>,
    registry_id: ID, // the MarketRegistry this mandate is bound to (§5.1 allowed_markets)
    expiry_ms: u64,
    revoked: bool,
    witness_commitment: vector<u8>, // Stage 2: hash of the currently-valid one-shot witness
    nonce: u64, // monotonic; rotated on every spend in Stage 2
}

/// Shared internal builder so `new_mandate` (shares) and `new_for_testing` (returns) can't drift.
fun build(
    registry_id: ID,
    daily_cap: u64,
    categories: vector<u8>,
    expiry_ms: u64,
    initial_commitment: vector<u8>,
    ctx: &mut TxContext,
): Mandate {
    let mut set = vec_set::empty<u8>();
    let mut i = 0;
    while (i < categories.length()) {
        let c = categories[i];
        if (!set.contains(&c)) set.insert(c);
        i = i + 1;
    };
    Mandate {
        id: object::new(ctx),
        owner: ctx.sender(),
        daily_cap,
        spent_today: 0,
        day_epoch: 0,
        allowed_categories: set,
        registry_id,
        expiry_ms,
        revoked: false,
        witness_commitment: initial_commitment, // keccak256(preimage_0) - the first one-shot witness
        nonce: 0,
    }
}

/// Create a mandate and share it. Owner = caller. `initial_commitment` is keccak256 of the
/// preimage for nonce 0 (see payment::commitment_of). Returns the new Mandate's ID.
public fun new_mandate(
    registry_id: ID,
    daily_cap: u64,
    categories: vector<u8>,
    expiry_ms: u64,
    initial_commitment: vector<u8>,
    ctx: &mut TxContext,
): ID {
    let m = build(registry_id, daily_cap, categories, expiry_ms, initial_commitment, ctx);
    let mid = object::id(&m);
    transfer::share_object(m);
    mid
}

// --- owner-gated mutations (never the agent) ---

public fun set_caps(m: &mut Mandate, new_daily_cap: u64, ctx: &TxContext) {
    assert!(ctx.sender() == m.owner, errors::not_owner());
    m.daily_cap = new_daily_cap;
}

public fun revoke(m: &mut Mandate, ctx: &TxContext) {
    assert!(ctx.sender() == m.owner, errors::not_owner());
    m.revoked = true;
}

// --- guards / accounting / rotation (package-internal: only payment::pay drives these) ---

/// Aborts unless the mandate is live: not revoked, not past its expiry.
public(package) fun assert_active(m: &Mandate, clock: &Clock) {
    assert!(!m.revoked, errors::revoked());
    assert!(clock.timestamp_ms() <= m.expiry_ms, errors::expired());
}

/// Mutating spend: rolls the day over (resets spent_today) if needed, then adds `amount`.
/// Only `payment::pay` calls this - the policy dry-run stays read-only via `effective_spent`.
public(package) fun apply_spend(m: &mut Mandate, amount: u64, clock: &Clock) {
    let today = current_day(clock);
    if (today != m.day_epoch) {
        m.day_epoch = today;
        m.spent_today = 0;
    };
    m.spent_today = m.spent_today + amount;
}

/// Rotate the one-shot witness commitment and advance the nonce. Called by `payment::pay`
/// AFTER the current witness has verified - the just-used preimage can never validate again.
public(package) fun rotate(m: &mut Mandate, next_commitment: vector<u8>) {
    m.witness_commitment = next_commitment;
    m.nonce = m.nonce + 1;
}

// --- read-only accessors (used by policy::evaluate, clients, tests) ---

public fun current_day(clock: &Clock): u64 { clock.timestamp_ms() / MS_PER_DAY }

/// Rollover-aware spent-today WITHOUT mutating - what the pure policy check reads.
public fun effective_spent(m: &Mandate, clock: &Clock): u64 {
    if (current_day(clock) != m.day_epoch) 0 else m.spent_today
}

public fun owner(m: &Mandate): address { m.owner }
public fun daily_cap(m: &Mandate): u64 { m.daily_cap }
public fun spent_today(m: &Mandate): u64 { m.spent_today }
public fun day_epoch(m: &Mandate): u64 { m.day_epoch }
public fun expiry_ms(m: &Mandate): u64 { m.expiry_ms }
public fun is_revoked(m: &Mandate): bool { m.revoked }
public fun nonce(m: &Mandate): u64 { m.nonce }
public fun registry_id(m: &Mandate): ID { m.registry_id }
public fun id(m: &Mandate): ID { object::id(m) }
public fun category_allowed(m: &Mandate, c: u8): bool { m.allowed_categories.contains(&c) }
public fun witness_commitment(m: &Mandate): vector<u8> { m.witness_commitment }

// --- test-only constructors/destructors (Stage 1 uses by-value objects) ---

#[test_only]
public fun new_for_testing(
    registry_id: ID,
    daily_cap: u64,
    categories: vector<u8>,
    expiry_ms: u64,
    initial_commitment: vector<u8>,
    ctx: &mut TxContext,
): Mandate {
    build(registry_id, daily_cap, categories, expiry_ms, initial_commitment, ctx)
}

#[test_only]
public fun destroy_for_testing(m: Mandate) {
    let Mandate {
        id,
        owner: _,
        daily_cap: _,
        spent_today: _,
        day_epoch: _,
        allowed_categories: _,
        registry_id: _,
        expiry_ms: _,
        revoked: _,
        witness_commitment: _,
        nonce: _,
    } = m;
    object::delete(id);
}
