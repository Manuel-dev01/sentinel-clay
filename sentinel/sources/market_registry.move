/// Allowlist of permitted DeepBook pool IDs. Shared object; admin-gated add/remove.
/// `is_allowed(registry, pool_id)` gates which markets a mandate may trade. (CLAUDE.md §5.2)
module sentinel::market_registry;

use sui::vec_set::{Self, VecSet};
use sentinel::errors;

public struct MarketRegistry has key {
    id: UID,
    admin: address,
    allowed: VecSet<ID>, // permitted DeepBook pool object IDs
}

fun build_registry(ctx: &mut TxContext): MarketRegistry {
    MarketRegistry { id: object::new(ctx), admin: ctx.sender(), allowed: vec_set::empty<ID>() }
}

/// Create a registry and share it. Admin = caller. Returns the new registry's ID.
public fun new_registry(ctx: &mut TxContext): ID {
    let r = build_registry(ctx);
    let rid = object::id(&r);
    transfer::share_object(r);
    rid
}

public fun add_market(r: &mut MarketRegistry, pool: ID, ctx: &TxContext) {
    assert!(ctx.sender() == r.admin, errors::not_owner());
    if (!r.allowed.contains(&pool)) r.allowed.insert(pool);
}

public fun remove_market(r: &mut MarketRegistry, pool: ID, ctx: &TxContext) {
    assert!(ctx.sender() == r.admin, errors::not_owner());
    if (r.allowed.contains(&pool)) r.allowed.remove(&pool);
}

public fun is_allowed(r: &MarketRegistry, pool: ID): bool { r.allowed.contains(&pool) }
public fun id(r: &MarketRegistry): ID { object::id(r) }
public fun admin(r: &MarketRegistry): address { r.admin }

#[test_only]
public fun new_for_testing(ctx: &mut TxContext): MarketRegistry { build_registry(ctx) }

#[test_only]
public fun destroy_for_testing(r: MarketRegistry) {
    let MarketRegistry { id, admin: _, allowed: _ } = r;
    object::delete(id);
}
