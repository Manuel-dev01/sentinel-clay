/// Venue adapter. `execute_mock` fills against a deterministic in-package `MockPool`;
/// `execute_real` (added with the DeepBook dependency) fills against DeepBook v3. Both sit
/// AFTER `payment::authorize` (policy + witness) - the mock replaces the *venue*, never the
/// *law* (locked Decision #3). (CLAUDE.md §5.5)
module sentinel::execution;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::clock::Clock;
use deepbook::pool::{Self, Pool};
use token::deep::DEEP;
use sentinel::errors;

/// Deterministic constant-price AMM-ish pool used as the demo fallback so an on-camera fill
/// never stalls on thin testnet liquidity. `base_out = quote_in * price_num / price_den`.
/// Holds real `Balance` reserves so it returns a real `Coin<B>` (a genuine, if mock-priced, fill).
public struct MockPool<phantom B, phantom Q> has key {
    id: UID,
    base: Balance<B>,
    quote: Balance<Q>,
    price_num: u64,
    price_den: u64,
}

public fun new_mock_pool<B, Q>(price_num: u64, price_den: u64, ctx: &mut TxContext): ID {
    assert!(price_den > 0, errors::slippage());
    let pool = MockPool<B, Q> {
        id: object::new(ctx),
        base: balance::zero<B>(),
        quote: balance::zero<Q>(),
        price_num,
        price_den,
    };
    let pid = object::id(&pool);
    transfer::share_object(pool);
    pid
}

/// Seed base reserves so the pool can pay out fills. (Anyone may donate liquidity.)
public fun fund_base<B, Q>(pool: &mut MockPool<B, Q>, c: Coin<B>) {
    pool.base.join(c.into_balance());
}

public fun fund_quote<B, Q>(pool: &mut MockPool<B, Q>, c: Coin<Q>) {
    pool.quote.join(c.into_balance());
}

/// Swap the entire `quote_in` for base at the fixed price. Aborts `E_SLIPPAGE` if the computed
/// fill is below `min_base_out` or exceeds the base reserve. Consumes all of `quote_in` into the
/// pool and returns the base out - a real coin movement. Only `payment` calls this.
public(package) fun execute_mock<B, Q>(
    pool: &mut MockPool<B, Q>,
    quote_in: Coin<Q>,
    min_base_out: u64,
    ctx: &mut TxContext,
): Coin<B> {
    let qval = quote_in.value();
    let base_out_amt = (((qval as u128) * (pool.price_num as u128)) / (pool.price_den as u128)) as u64;
    assert!(base_out_amt >= min_base_out, errors::slippage());
    assert!(pool.base.value() >= base_out_amt, errors::slippage());
    pool.quote.join(quote_in.into_balance());
    coin::from_balance(pool.base.split(base_out_amt), ctx)
}

/// Real venue: thin wrapper over DeepBook v3's permissionless swap (quote -> base). DEEP is the
/// fee coin (over-estimate refunded; whitelisted pools accept a zero DEEP coin). Returns
/// (base_out, quote_remainder, deep_remainder). Only `payment` calls this. (CLAUDE.md §5.5)
public(package) fun execute_real<B, Q>(
    pool: &mut Pool<B, Q>,
    quote_in: Coin<Q>,
    deep_in: Coin<DEEP>,
    min_base_out: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): (Coin<B>, Coin<Q>, Coin<DEEP>) {
    pool::swap_exact_quote_for_base(pool, quote_in, deep_in, min_base_out, clock, ctx)
}

/// The DeepBook pool's object id - used by `payment` to bind the intent's declared market to the
/// actual venue traded (so the registry allowlist can't be bypassed with a different pool object).
public fun real_pool_id<B, Q>(pool: &Pool<B, Q>): ID { object::id(pool) }

// --- read-only accessors ---
public fun base_reserve<B, Q>(pool: &MockPool<B, Q>): u64 { pool.base.value() }
public fun quote_reserve<B, Q>(pool: &MockPool<B, Q>): u64 { pool.quote.value() }
public fun price<B, Q>(pool: &MockPool<B, Q>): (u64, u64) { (pool.price_num, pool.price_den) }
public fun id<B, Q>(pool: &MockPool<B, Q>): ID { object::id(pool) }

#[test_only]
public fun new_for_testing<B, Q>(price_num: u64, price_den: u64, ctx: &mut TxContext): MockPool<B, Q> {
    MockPool<B, Q> {
        id: object::new(ctx),
        base: balance::zero<B>(),
        quote: balance::zero<Q>(),
        price_num,
        price_den,
    }
}

#[test_only]
public fun destroy_for_testing<B, Q>(pool: MockPool<B, Q>) {
    let MockPool { id, base, quote, price_num: _, price_den: _ } = pool;
    base.destroy_for_testing();
    quote.destroy_for_testing();
    object::delete(id);
}
