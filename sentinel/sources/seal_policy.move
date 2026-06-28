/// Seal key-release predicates. Seal key servers DRY-RUN these in a PTB to decide whether to
/// release the decryption key-shares for a blob encrypted under a given identity. A dry-run can
/// only pass objects + pure values (never a constructed `&PaymentIntent`), so the proposed trade
/// is supplied field-wise and the `id` binds the release to exactly one (mandate, nonce).
///
/// `seal_check` routes through the SAME `policy::check` that `payment::pay` calls - so a key
/// release granted off-chain can never authorize a payment that on-chain Move would abort. Seal
/// gates the *secret*; `payment.move` remains the *law* (CLAUDE.md §5.3, locked Decision #1).
module sentinel::seal_policy;

use sui::clock::Clock;
use sentinel::mandate::{Self, Mandate};
use sentinel::market_registry::MarketRegistry;
use sentinel::policy;
use sentinel::seal_id;
use sentinel::errors;

/// The witness-release predicate (reusable; `seal_approve` is the thin entry wrapper Seal calls,
/// and tests call this directly to prove the seal_approve ⇔ payment::pay differential). Aborts
/// with the exact `errors::E_*` code on any violation.
public fun seal_check(
    id: vector<u8>,
    mandate: &Mandate,
    registry: &MarketRegistry,
    pool_id: address,
    category: u8,
    amount: u64,
    recipient: address,
    expiry_ms: u64,
    clock: &Clock,
) {
    let (mid, nonce) = seal_id::decode(id);
    // Bind the encrypted preimage to THIS mandate at its CURRENT nonce (one-shot release).
    assert!(mid == mandate::id(mandate), errors::nonce());
    assert!(nonce == mandate::nonce(mandate), errors::nonce());
    let intent = policy::new_intent(
        mid,
        object::id_from_address(pool_id),
        category,
        amount,
        recipient,
        nonce,
        expiry_ms,
    );
    policy::check(mandate, registry, &intent, clock);
}

/// Seal entry point for releasing the one-shot witness preimage. Key servers dry-run this.
entry fun seal_approve(
    id: vector<u8>,
    mandate: &Mandate,
    registry: &MarketRegistry,
    pool_id: address,
    category: u8,
    amount: u64,
    recipient: address,
    expiry_ms: u64,
    clock: &Clock,
) {
    seal_check(id, mandate, registry, pool_id, category, amount, recipient, expiry_ms, clock);
}

/// Owner-only release predicate for the encrypted audit log / agent memory. The blob's id tail
/// identifies the mandate; only the mandate owner may decrypt. (`seq` distinguishes records.)
public fun owner_check(id: vector<u8>, mandate: &Mandate, ctx: &TxContext) {
    let (mid, _seq) = seal_id::decode(id);
    assert!(mid == mandate::id(mandate), errors::not_owner());
    assert!(ctx.sender() == mandate::owner(mandate), errors::not_owner());
}

/// Seal entry point for the owner-gated audit-log / memory blobs.
entry fun seal_approve_owner(id: vector<u8>, mandate: &Mandate, ctx: &TxContext) {
    owner_check(id, mandate, ctx);
}
