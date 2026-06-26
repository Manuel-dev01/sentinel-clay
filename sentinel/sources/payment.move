/// The heart: atomic verify-intent -> verify+rotate one-shot witness -> (Stage 3) execute
/// -> emit. `pay` runs the SAME `policy::check` that `seal_approve` dry-runs, then consumes a
/// one-shot `Witness` (rotating the commitment so it can never be replayed), updates daily
/// spend, and emits `PaymentSettled`. Any violation aborts the whole PTB. (CLAUDE.md §5.4)
///
/// Stage 2 scope: steps 1-5,7 — assert active, policy check, witness verify, rotate, spend,
/// emit. Real DeepBook execution (step 6) is Stage 3 (no-op for now).
module sentinel::payment;

use sui::clock::Clock;
use sui::event;
use sui::hash;
use sentinel::mandate::{Self, Mandate};
use sentinel::market_registry::MarketRegistry;
use sentinel::policy::{Self, PaymentIntent};
use sentinel::errors;

/// One-shot authorization. **No `copy`, `drop`, or `store`** — Move's type system forbids
/// duplicating it, silently discarding it, or stashing it for a later replay; it MUST be
/// consumed by `pay` in the same PTB. This is the compile-time half of replay protection;
/// commitment rotation is the runtime half.
public struct Witness {
    preimage: vector<u8>,
    nonce: u64,
}

public struct PaymentSettled has copy, drop {
    mandate_id: ID,
    pool_id: ID,
    amount: u64,
    category: u8,
    nonce: u64, // the nonce that was authorized (pre-rotation)
}

/// The single hash used by BOTH on-chain rotation and off-chain providers/tests, so the
/// commitment can never be computed two different ways. `commitment_n = keccak256(preimage_n)`.
public fun commitment_of(preimage: vector<u8>): vector<u8> {
    hash::keccak256(&preimage)
}

/// On-chain constructor: the authorization provider releases `preimage` for `nonce`; the PTB
/// mints the Witness and feeds it straight into `pay`. Minting is unprivileged — the gate is
/// that `keccak256(preimage)` must equal the mandate's current commitment.
public fun mint_witness(preimage: vector<u8>, nonce: u64): Witness {
    Witness { preimage, nonce }
}

public fun pay(
    mandate: &mut Mandate,
    registry: &MarketRegistry,
    intent: PaymentIntent,
    witness: Witness,
    next_commitment: vector<u8>,
    clock: &Clock,
    _ctx: &mut TxContext,
) {
    // 1. mandate must be live (not revoked / expired)
    mandate::assert_active(mandate, clock);
    // 2. policy — the EXACT same check seal_approve dry-runs (incl. intent.nonce == mandate.nonce)
    policy::check(mandate, registry, &intent, clock);
    // 3. verify the one-shot witness (consume the resource into its fields)
    let Witness { preimage, nonce: witness_nonce } = witness;
    //    a stale/recycled witness carries an old nonce -> replay
    assert!(witness_nonce == mandate::nonce(mandate), errors::replay());
    //    a forged witness hashes to something other than the stored commitment
    assert!(commitment_of(preimage) == mandate::witness_commitment(mandate), errors::bad_witness());
    // 4. rotate: advance nonce + install the next commitment; the used preimage dies here
    mandate::rotate(mandate, next_commitment);
    // 5. spend accounting (rollover-aware, mutating)
    mandate::apply_spend(mandate, policy::amount(&intent), clock);
    // 6. venue execution -> Stage 3 (no-op for now)
    // 7. emit settlement for the audit log
    event::emit(PaymentSettled {
        mandate_id: policy::mandate_id(&intent),
        pool_id: policy::pool_id(&intent),
        amount: policy::amount(&intent),
        category: policy::category(&intent),
        nonce: policy::nonce(&intent),
    });
}
