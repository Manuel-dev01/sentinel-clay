/// The heart: atomic verify-intent -> verify+rotate one-shot witness -> spend -> execute -> emit.
/// `authorize` is the shared on-chain LAW (policy + witness + spend); the `pay_*` wrappers add a
/// venue and emit. Same law for every venue — the mock replaces the venue, never the law
/// (locked Decision #3). Any violation aborts the whole PTB. (CLAUDE.md §5.4)
///
/// Stage 3: `pay_mock` fills against the in-package MockPool (the guaranteed demo beat).
/// `pay_real` (DeepBook v3) is added alongside once the DeepBook dependency is wired.
module sentinel::payment;

use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;
use sui::hash;
use sentinel::mandate::{Self, Mandate};
use sentinel::market_registry::MarketRegistry;
use sentinel::policy::{Self, PaymentIntent};
use sentinel::execution::{Self, MockPool};
use sentinel::errors;
use deepbook::pool::Pool;
use token::deep::DEEP;

/// One-shot authorization. **No `copy`, `drop`, or `store`** — the type system forbids
/// duplicating, dropping, or stashing it; it MUST be consumed by `authorize` in the same PTB.
public struct Witness {
    preimage: vector<u8>,
    nonce: u64,
}

public struct PaymentSettled has copy, drop {
    mandate_id: ID,
    pool_id: ID,
    amount: u64, // quote spent (== intent.amount)
    base_out: u64, // base received from the fill
    category: u8,
    nonce: u64, // the nonce that was authorized (pre-rotation)
}

/// The single hash used by BOTH on-chain rotation and off-chain providers/tests.
public fun commitment_of(preimage: vector<u8>): vector<u8> {
    hash::keccak256(&preimage)
}

/// On-chain Witness constructor. Unprivileged — the gate is that `keccak256(preimage)` must equal
/// the mandate's current commitment.
public fun mint_witness(preimage: vector<u8>, nonce: u64): Witness {
    Witness { preimage, nonce }
}

/// The shared LAW: assert active -> policy check -> verify+rotate one-shot witness -> spend.
/// No venue, no emit. Every `pay_*` wrapper calls exactly this, so off-chain `seal_approve`
/// (which calls `policy::check`) can never diverge from what settles on-chain.
public(package) fun authorize(
    mandate: &mut Mandate,
    registry: &MarketRegistry,
    intent: &PaymentIntent,
    witness: Witness,
    next_commitment: vector<u8>,
    clock: &Clock,
) {
    // 1. mandate live
    mandate::assert_active(mandate, clock);
    // 2. policy — the EXACT same check seal_approve dry-runs
    policy::check(mandate, registry, intent, clock);
    // 3. verify the one-shot witness (consume the resource into its fields)
    let Witness { preimage, nonce: witness_nonce } = witness;
    assert!(witness_nonce == mandate::nonce(mandate), errors::replay());
    assert!(commitment_of(preimage) == mandate::witness_commitment(mandate), errors::bad_witness());
    // 4. rotate: advance nonce + install next commitment; the used preimage dies here
    mandate::rotate(mandate, next_commitment);
    // 5. spend accounting (rollover-aware)
    mandate::apply_spend(mandate, policy::amount(intent), clock);
}

/// Compliant trade against the deterministic MockPool. `quote_in` is the funds to spend this
/// trade (coin-input model); it MUST equal `intent.amount` so the policy cap governs real coins.
public fun pay_mock<B, Q>(
    mandate: &mut Mandate,
    registry: &MarketRegistry,
    pool: &mut MockPool<B, Q>,
    intent: PaymentIntent,
    witness: Witness,
    next_commitment: vector<u8>,
    quote_in: Coin<Q>,
    min_base_out: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    // bind the policy cap to the actual coins moved, and the declared market to the actual venue
    assert!(policy::amount(&intent) == coin::value(&quote_in), errors::amount());
    assert!(execution::id(pool) == policy::pool_id(&intent), errors::market());
    // law (consumes witness, rotates, accounts)
    authorize(mandate, registry, &intent, witness, next_commitment, clock);
    // venue: execute the swap and deliver the fill to the recipient
    let base_out = execution::execute_mock(pool, quote_in, min_base_out, ctx);
    let filled = coin::value(&base_out);
    transfer::public_transfer(base_out, policy::recipient(&intent));
    // audit event
    event::emit(PaymentSettled {
        mandate_id: policy::mandate_id(&intent),
        pool_id: policy::pool_id(&intent),
        amount: policy::amount(&intent),
        base_out: filled,
        category: policy::category(&intent),
        nonce: policy::nonce(&intent),
    });
}

/// Compliant trade against a real DeepBook v3 pool. Same law as `pay_mock` (coin-input model,
/// pool-id binding) — only the venue differs. `deep_in` pays the DeepBook fee (over-estimate
/// refunded; whitelisted pools take a zero DEEP coin). Remainders are refunded to the caller.
public fun pay_real<B, Q>(
    mandate: &mut Mandate,
    registry: &MarketRegistry,
    pool: &mut Pool<B, Q>,
    intent: PaymentIntent,
    witness: Witness,
    next_commitment: vector<u8>,
    quote_in: Coin<Q>,
    deep_in: Coin<DEEP>,
    min_base_out: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(policy::amount(&intent) == coin::value(&quote_in), errors::amount());
    assert!(execution::real_pool_id(pool) == policy::pool_id(&intent), errors::market());
    authorize(mandate, registry, &intent, witness, next_commitment, clock);
    let (base_out, quote_rem, deep_rem) =
        execution::execute_real(pool, quote_in, deep_in, min_base_out, clock, ctx);
    let filled = coin::value(&base_out);
    transfer::public_transfer(base_out, policy::recipient(&intent));
    // refund any unspent quote + DEEP to the caller
    transfer::public_transfer(quote_rem, ctx.sender());
    transfer::public_transfer(deep_rem, ctx.sender());
    event::emit(PaymentSettled {
        mandate_id: policy::mandate_id(&intent),
        pool_id: policy::pool_id(&intent),
        amount: policy::amount(&intent),
        base_out: filled,
        category: policy::category(&intent),
        nonce: policy::nonce(&intent),
    });
}
