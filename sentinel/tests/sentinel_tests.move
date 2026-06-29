#[test_only]
/// Stage 1-3 suite: every abort code, spend-cap invariant, deterministic fuzz, off-chain/on-chain
/// differential, one-shot witness / replay protection, AND MockPool venue execution (a real,
/// mock-priced fill). Backs the demo's three beats: compliant fill, over-cap abort, replay abort.
/// (CLAUDE.md §7)
module sentinel::sentinel_tests;

use std::bcs;
use sui::test_scenario::{Self as ts, Scenario};
use sui::clock::{Self, Clock};
use sui::coin::{Self, Coin};
use sui::hash;
use sentinel::errors;
use sentinel::mandate::{Self, Mandate};
use sentinel::market_registry::{Self, MarketRegistry};
use sentinel::policy::{Self, PaymentIntent};
use sentinel::payment::{Self, Witness};
use sentinel::execution::{Self, MockPool};
use sentinel::seal_policy;
use sentinel::seal_id;

const ADMIN: address = @0xA;
const STRANGER: address = @0xB;
const RECIP: address = @0xCAFE;
const CAT_STABLE: u8 = 0;
const CAT_OTHER: u8 = 7;
const DAY1: u64 = 86_400_000;
const EXPIRY: u64 = 100 * 86_400_000;
const SEED: vector<u8> = b"sentinel-local-witness-seed";

// test-only coin marker types for the MockPool
public struct BASE has drop {}
public struct QUOTE has drop {}

// --- LocalWitnessProvider (deterministic) ---

#[test_only]
fun preimage(n: u64): vector<u8> {
    let mut data = SEED;
    data.append(bcs::to_bytes(&n));
    hash::keccak256(&data)
}
#[test_only]
fun commitment(n: u64): vector<u8> { payment::commitment_of(preimage(n)) }
#[test_only]
fun valid_witness(n: u64): Witness { payment::mint_witness(preimage(n), n) }

// --- object helpers ---

#[test_only]
fun pool_ok(): ID { object::id_from_address(@0xBEEF) }
#[test_only]
fun pool_bad(): ID { object::id_from_address(@0xBAD) }

#[test_only]
fun start(cap: u64): (Scenario, MarketRegistry, Mandate, Clock) {
    let mut sc = ts::begin(ADMIN);
    let ctx = sc.ctx();
    let mut reg = market_registry::new_for_testing(ctx);
    market_registry::add_market(&mut reg, pool_ok(), ctx);
    let reg_id = market_registry::id(&reg);
    let m = mandate::new_for_testing(reg_id, cap, vector[CAT_STABLE], EXPIRY, commitment(0), ctx);
    let mut clock = clock::create_for_testing(ctx);
    clock::set_for_testing(&mut clock, DAY1);
    (sc, reg, m, clock)
}

#[test_only]
fun finish(sc: Scenario, reg: MarketRegistry, m: Mandate, clock: Clock) {
    market_registry::destroy_for_testing(reg);
    mandate::destroy_for_testing(m);
    clock::destroy_for_testing(clock);
    ts::end(sc);
}

#[test_only]
fun mk_intent(m: &Mandate, pool: ID, cat: u8, amount: u64, nonce: u64, expiry: u64): PaymentIntent {
    // proceeds return to the mandate owner (policy::check now binds recipient == owner)
    policy::new_intent(mandate::id(m), pool, cat, amount, mandate::owner(m), nonce, expiry)
}

/// Drive the Seal witness-release predicate for an intent exactly as a key-server dry-run
/// would: id = encode(mandate_id, nonce), the intent passed field-wise. Aborts identically to
/// `payment::pay` (both route through `policy::check`) - this is the §7-5 differential.
#[test_only]
fun seal_check_intent(m: &Mandate, reg: &MarketRegistry, it: &PaymentIntent, clock: &Clock) {
    let id = seal_id::encode(policy::mandate_id(it), policy::nonce(it));
    seal_policy::seal_check(
        id,
        m,
        reg,
        object::id_to_address(&policy::pool_id(it)),
        policy::category(it),
        policy::amount(it),
        policy::recipient(it),
        policy::expiry_ms(it),
        clock,
    );
}

/// Run the on-chain LAW for a compliant intent at the current nonce (no venue/coins).
#[test_only]
fun authorize_compliant(m: &mut Mandate, reg: &MarketRegistry, clock: &Clock, amount: u64) {
    let n = mandate::nonce(m);
    let it = mk_intent(m, pool_ok(), CAT_STABLE, amount, n, EXPIRY);
    payment::authorize(m, reg, &it, valid_witness(n), commitment(n + 1), clock);
}

#[test_only]
fun lcg(x: u64): u64 {
    let a: u128 = 6364136223846793005;
    let c: u128 = 1442695040888963407;
    (((a * (x as u128) + c) % (1u128 << 64)) as u64)
}

// --- per-abort-code matrix via evaluate (non-aborting) ---

#[test]
fun evaluate_compliant_is_zero() {
    let (sc, reg, m, clock) = start(1_000_000);
    let it = mk_intent(&m, pool_ok(), CAT_STABLE, 40, mandate::nonce(&m), EXPIRY);
    assert!(policy::evaluate(&m, &reg, &it, &clock) == 0, 0);
    finish(sc, reg, m, clock);
}

#[test]
fun evaluate_over_cap() {
    let (sc, reg, m, clock) = start(100);
    let it = mk_intent(&m, pool_ok(), CAT_STABLE, 101, mandate::nonce(&m), EXPIRY);
    assert!(policy::evaluate(&m, &reg, &it, &clock) == errors::over_cap(), 0);
    finish(sc, reg, m, clock);
}

#[test]
fun evaluate_cap_boundary_is_ok() {
    let (sc, reg, m, clock) = start(100);
    let it = mk_intent(&m, pool_ok(), CAT_STABLE, 100, mandate::nonce(&m), EXPIRY);
    assert!(policy::evaluate(&m, &reg, &it, &clock) == 0, 0);
    finish(sc, reg, m, clock);
}

#[test]
fun evaluate_bad_category() {
    let (sc, reg, m, clock) = start(1_000_000);
    let it = mk_intent(&m, pool_ok(), CAT_OTHER, 10, mandate::nonce(&m), EXPIRY);
    assert!(policy::evaluate(&m, &reg, &it, &clock) == errors::category(), 0);
    finish(sc, reg, m, clock);
}

#[test]
fun evaluate_bad_market() {
    let (sc, reg, m, clock) = start(1_000_000);
    let it = mk_intent(&m, pool_bad(), CAT_STABLE, 10, mandate::nonce(&m), EXPIRY);
    assert!(policy::evaluate(&m, &reg, &it, &clock) == errors::market(), 0);
    finish(sc, reg, m, clock);
}

#[test]
fun evaluate_expired_intent() {
    let (sc, reg, m, clock) = start(1_000_000);
    let it = mk_intent(&m, pool_ok(), CAT_STABLE, 10, mandate::nonce(&m), DAY1 - 1);
    assert!(policy::evaluate(&m, &reg, &it, &clock) == errors::expired(), 0);
    finish(sc, reg, m, clock);
}

#[test]
fun evaluate_bad_nonce() {
    let (sc, reg, m, clock) = start(1_000_000);
    let it = mk_intent(&m, pool_ok(), CAT_STABLE, 10, mandate::nonce(&m) + 1, EXPIRY);
    assert!(policy::evaluate(&m, &reg, &it, &clock) == errors::nonce(), 0);
    finish(sc, reg, m, clock);
}

#[test]
fun evaluate_wrong_recipient() {
    let (sc, reg, m, clock) = start(1_000_000);
    // recipient = RECIP (@0xCAFE), not the mandate owner -> a leaked witness cannot redirect funds
    let it = policy::new_intent(mandate::id(&m), pool_ok(), CAT_STABLE, 10, RECIP, mandate::nonce(&m), EXPIRY);
    assert!(policy::evaluate(&m, &reg, &it, &clock) == errors::recipient(), 0);
    finish(sc, reg, m, clock);
}

// --- abort-path proofs via authorize (the law) ---

#[test]
#[expected_failure(abort_code = 1, location = sentinel::policy)] // E_OVER_CAP
fun authorize_over_cap_aborts() {
    let (sc, reg, mut m, clock) = start(100);
    let it = mk_intent(&m, pool_ok(), CAT_STABLE, 101, mandate::nonce(&m), EXPIRY);
    payment::authorize(&mut m, &reg, &it, valid_witness(0), commitment(1), &clock);
    finish(sc, reg, m, clock);
}

#[test]
#[expected_failure(abort_code = 3, location = sentinel::policy)] // E_MARKET
fun authorize_wrong_market_aborts() {
    let (sc, reg, mut m, clock) = start(1_000_000);
    let it = mk_intent(&m, pool_bad(), CAT_STABLE, 10, mandate::nonce(&m), EXPIRY);
    payment::authorize(&mut m, &reg, &it, valid_witness(0), commitment(1), &clock);
    finish(sc, reg, m, clock);
}

#[test]
#[expected_failure(abort_code = 13, location = sentinel::policy)] // E_RECIPIENT
fun authorize_wrong_recipient_aborts() {
    let (sc, reg, mut m, clock) = start(1_000_000);
    let it = policy::new_intent(mandate::id(&m), pool_ok(), CAT_STABLE, 10, RECIP, mandate::nonce(&m), EXPIRY);
    payment::authorize(&mut m, &reg, &it, valid_witness(0), commitment(1), &clock);
    finish(sc, reg, m, clock);
}

#[test]
#[expected_failure(abort_code = 5, location = sentinel::mandate)] // E_REVOKED
fun authorize_on_revoked_mandate_aborts() {
    let (mut sc, reg, mut m, clock) = start(1_000_000);
    mandate::revoke(&mut m, sc.ctx());
    let it = mk_intent(&m, pool_ok(), CAT_STABLE, 10, mandate::nonce(&m), EXPIRY);
    payment::authorize(&mut m, &reg, &it, valid_witness(0), commitment(1), &clock);
    finish(sc, reg, m, clock);
}

#[test]
#[expected_failure(abort_code = 2, location = sentinel::policy)] // E_CATEGORY
fun seal_approve_rejects_bad_category() {
    let (sc, reg, m, clock) = start(1_000_000);
    let it = mk_intent(&m, pool_ok(), CAT_OTHER, 10, mandate::nonce(&m), EXPIRY);
    seal_check_intent(&m, &reg, &it, &clock);
    finish(sc, reg, m, clock);
}

#[test]
#[expected_failure(abort_code = 9, location = sentinel::mandate)] // E_NOT_OWNER
fun revoke_by_non_owner_aborts() {
    let (mut sc, reg, mut m, clock) = start(1_000_000);
    ts::next_tx(&mut sc, STRANGER);
    mandate::revoke(&mut m, sc.ctx());
    finish(sc, reg, m, clock);
}

// --- one-shot witness / replay protection (via authorize) ---

#[test]
#[expected_failure(abort_code = 7, location = sentinel::payment)] // E_REPLAY
fun replayed_witness_aborts() {
    let (sc, reg, mut m, clock) = start(1_000_000);
    authorize_compliant(&mut m, &reg, &clock, 10); // nonce 0 -> 1
    let it = mk_intent(&m, pool_ok(), CAT_STABLE, 10, mandate::nonce(&m), EXPIRY);
    payment::authorize(&mut m, &reg, &it, valid_witness(0), commitment(2), &clock); // reuse nonce-0 witness
    finish(sc, reg, m, clock);
}

#[test]
#[expected_failure(abort_code = 7, location = sentinel::payment)] // E_REPLAY (wrong nonce)
fun wrong_nonce_witness_aborts() {
    let (sc, reg, mut m, clock) = start(1_000_000);
    let it = mk_intent(&m, pool_ok(), CAT_STABLE, 10, mandate::nonce(&m), EXPIRY);
    payment::authorize(&mut m, &reg, &it, valid_witness(1), commitment(1), &clock);
    finish(sc, reg, m, clock);
}

#[test]
#[expected_failure(abort_code = 6, location = sentinel::payment)] // E_BAD_WITNESS
fun forged_witness_aborts() {
    let (sc, reg, mut m, clock) = start(1_000_000);
    let it = mk_intent(&m, pool_ok(), CAT_STABLE, 10, mandate::nonce(&m), EXPIRY);
    let forged = payment::mint_witness(b"not-the-real-preimage", 0);
    payment::authorize(&mut m, &reg, &it, forged, commitment(1), &clock);
    finish(sc, reg, m, clock);
}

#[test]
fun rotation_advances_commitment_and_nonce() {
    let (sc, reg, mut m, clock) = start(1_000_000);
    assert!(mandate::nonce(&m) == 0, 0);
    assert!(mandate::witness_commitment(&m) == commitment(0), 1);
    authorize_compliant(&mut m, &reg, &clock, 10);
    assert!(mandate::nonce(&m) == 1, 2);
    assert!(mandate::witness_commitment(&m) == commitment(1), 3);
    finish(sc, reg, m, clock);
}

#[test]
fun invariant_nonce_monotonic_and_rotates() {
    let (sc, reg, mut m, clock) = start(1_000_000_000);
    let mut prev = mandate::nonce(&m);
    let mut i = 0;
    while (i < 25) {
        authorize_compliant(&mut m, &reg, &clock, 1);
        let now = mandate::nonce(&m);
        assert!(now == prev + 1, i);
        assert!(mandate::witness_commitment(&m) == commitment(now), 1000 + i);
        prev = now;
        i = i + 1;
    };
    finish(sc, reg, m, clock);
}

// --- accounting / rollover (via authorize) ---

#[test]
fun authorize_settles_and_accounts() {
    let (sc, reg, mut m, clock) = start(1_000_000);
    authorize_compliant(&mut m, &reg, &clock, 40);
    assert!(mandate::spent_today(&m) == 40, 0);
    assert!(mandate::nonce(&m) == 1, 1);
    authorize_compliant(&mut m, &reg, &clock, 60);
    assert!(mandate::spent_today(&m) == 100, 2);
    assert!(mandate::nonce(&m) == 2, 3);
    finish(sc, reg, m, clock);
}

#[test]
fun day_rollover_resets_spend() {
    let (sc, reg, mut m, mut clock) = start(100);
    authorize_compliant(&mut m, &reg, &clock, 80);
    assert!(mandate::spent_today(&m) == 80, 0);
    let it_over = mk_intent(&m, pool_ok(), CAT_STABLE, 80, mandate::nonce(&m), EXPIRY);
    assert!(policy::evaluate(&m, &reg, &it_over, &clock) == errors::over_cap(), 1);
    clock::set_for_testing(&mut clock, DAY1 * 3);
    assert!(mandate::effective_spent(&m, &clock) == 0, 2);
    authorize_compliant(&mut m, &reg, &clock, 80);
    assert!(mandate::spent_today(&m) == 80, 3);
    finish(sc, reg, m, clock);
}

// --- invariant: spent_today never exceeds cap (§7-1) ---

#[test]
fun invariant_spent_never_exceeds_cap() {
    let (sc, reg, mut m, mut clock) = start(1_000);
    let cap = mandate::daily_cap(&m);
    let mut seed = 99u64;
    let mut cur = DAY1;
    let mut i = 0;
    while (i < 200) {
        seed = lcg(seed);
        let amt = seed % 400;
        seed = lcg(seed);
        cur = cur + (seed % (DAY1 / 4));
        clock::set_for_testing(&mut clock, cur);
        let n = mandate::nonce(&m);
        let it = mk_intent(&m, pool_ok(), CAT_STABLE, amt, n, EXPIRY);
        if (policy::evaluate(&m, &reg, &it, &clock) == 0) {
            payment::authorize(&mut m, &reg, &it, valid_witness(n), commitment(n + 1), &clock);
        };
        assert!(mandate::effective_spent(&m, &clock) <= cap, 100 + i);
        i = i + 1;
    };
    finish(sc, reg, m, clock);
}

// --- fuzz: evaluate matches an independent spec (§7 fuzz + inv 5) ---

#[test]
fun fuzz_evaluate_matches_spec() {
    let (sc, reg, m, clock) = start(1_000);
    let cap = mandate::daily_cap(&m);
    let nonce = mandate::nonce(&m);
    let now = clock.timestamp_ms();
    let mut seed = 7u64;
    let mut i = 0;
    while (i < 400) {
        seed = lcg(seed); let cat = ((seed % 3) as u8);
        seed = lcg(seed); let amt = seed % 2000;
        seed = lcg(seed); let ok_pool = (seed % 2) == 0;
        seed = lcg(seed); let good_nonce = (seed % 2) == 0;
        seed = lcg(seed); let future = (seed % 2) == 0;
        let pool = if (ok_pool) pool_ok() else pool_bad();
        let nn = if (good_nonce) nonce else nonce + 1;
        let exp = if (future) EXPIRY else now - 1;
        let it = mk_intent(&m, pool, cat, amt, nn, exp);
        let expected = if (now > exp) errors::expired()
            else if (cat != CAT_STABLE) errors::category()
            else if (!ok_pool) errors::market()
            else if (nn != nonce) errors::nonce()
            else if (amt > cap) errors::over_cap()
            else 0;
        assert!(policy::evaluate(&m, &reg, &it, &clock) == expected, i);
        i = i + 1;
    };
    finish(sc, reg, m, clock);
}

// --- differential: compliant seal_approve passes AND the law settles (§7-5) ---

#[test]
fun differential_compliant_seal_and_authorize_agree() {
    let (sc, reg, mut m, clock) = start(1_000);
    let it = mk_intent(&m, pool_ok(), CAT_STABLE, 50, mandate::nonce(&m), EXPIRY);
    seal_check_intent(&m, &reg, &it, &clock); // does not abort
    authorize_compliant(&mut m, &reg, &clock, 50);
    assert!(mandate::spent_today(&m) == 50, 0);
    finish(sc, reg, m, clock);
}

/// Differential on the rogue path: an over-cap intent makes the Seal release predicate ABORT
/// with the SAME code/location as `payment::pay` - so the key servers deny the secret off-chain
/// for exactly what Move would abort on-chain.
#[test]
#[expected_failure(abort_code = 1, location = sentinel::policy)] // E_OVER_CAP
fun differential_over_cap_seal_aborts() {
    let (sc, reg, m, clock) = start(100);
    let it = mk_intent(&m, pool_ok(), CAT_STABLE, 101, mandate::nonce(&m), EXPIRY);
    seal_check_intent(&m, &reg, &it, &clock);
    finish(sc, reg, m, clock);
}

// --- Stage 4: seal_id codec + (mandate, nonce) binding ---

#[test]
fun seal_id_roundtrip() {
    let mid = object::id_from_address(@0x1234);
    let id = seal_id::encode(mid, 42);
    let (got_mid, got_nonce) = seal_id::decode(id);
    assert!(got_mid == mid, 0);
    assert!(got_nonce == 42, 1);
}

#[test]
/// Decoding reads from the tail, so a package-id prefix (as Seal prepends) is transparent.
fun seal_id_decode_ignores_prefix() {
    let mid = object::id_from_address(@0x1234);
    let mut id = object::id_to_bytes(&object::id_from_address(@0xABCD)); // 32-byte fake pkg prefix
    id.append(seal_id::encode(mid, 7));
    let (got_mid, got_nonce) = seal_id::decode(id);
    assert!(got_mid == mid && got_nonce == 7, 0);
}

#[test]
#[expected_failure(abort_code = 8, location = sentinel::seal_policy)] // E_NONCE (stale id binding)
fun seal_check_wrong_nonce_aborts() {
    let (sc, reg, m, clock) = start(1_000);
    let it = mk_intent(&m, pool_ok(), CAT_STABLE, 50, mandate::nonce(&m), EXPIRY);
    let bad_id = seal_id::encode(mandate::id(&m), mandate::nonce(&m) + 1); // wrong nonce
    seal_policy::seal_check(
        bad_id,
        &m,
        &reg,
        object::id_to_address(&policy::pool_id(&it)),
        policy::category(&it),
        policy::amount(&it),
        policy::recipient(&it),
        policy::expiry_ms(&it),
        &clock,
    );
    finish(sc, reg, m, clock);
}

// --- Stage 3: MockPool venue execution (real, mock-priced fills) ---

/// Create a funded MockPool<BASE,QUOTE> and allowlist its real id in the registry, returning
/// the pool + its id (which the intent's pool_id must match - the pool-id binding).
#[test_only]
fun mk_pool_allowed(
    sc: &mut Scenario,
    reg: &mut MarketRegistry,
    num: u64,
    den: u64,
    base_reserve: u64,
): (MockPool<BASE, QUOTE>, ID) {
    let mut pool = {
        let ctx = sc.ctx();
        let mut p = execution::new_for_testing<BASE, QUOTE>(num, den, ctx);
        execution::fund_base(&mut p, coin::mint_for_testing<BASE>(base_reserve, ctx));
        p
    };
    let pid = execution::id(&pool);
    market_registry::add_market(reg, pid, sc.ctx());
    (pool, pid)
}

#[test]
fun mock_fill_settles_and_delivers_base() {
    let (mut sc, mut reg, mut m, clock) = start(1_000_000);
    let (mut pool, pid) = mk_pool_allowed(&mut sc, &mut reg, 2, 1, 1_000_000); // price 2 base/quote
    let n = mandate::nonce(&m);
    let it = mk_intent(&m, pid, CAT_STABLE, 40, n, EXPIRY);
    let quote = coin::mint_for_testing<QUOTE>(40, sc.ctx());
    payment::pay_mock(&mut m, &reg, &mut pool, it, valid_witness(n), commitment(n + 1), quote, 0, &clock, sc.ctx());
    assert!(mandate::spent_today(&m) == 40, 0);
    assert!(mandate::nonce(&m) == 1, 1);
    assert!(execution::base_reserve(&pool) == 1_000_000 - 80, 2);
    assert!(execution::quote_reserve(&pool) == 40, 3);
    ts::next_tx(&mut sc, ADMIN); // base_out is delivered to the mandate owner (recipient == owner)
    let got = ts::take_from_address<Coin<BASE>>(&sc, ADMIN);
    assert!(coin::value(&got) == 80, 4);
    coin::burn_for_testing(got);
    execution::destroy_for_testing(pool);
    finish(sc, reg, m, clock);
}

#[test]
#[expected_failure(abort_code = 11, location = sentinel::execution)] // E_SLIPPAGE
fun mock_fill_slippage_aborts() {
    let (mut sc, mut reg, mut m, clock) = start(1_000_000);
    let (mut pool, pid) = mk_pool_allowed(&mut sc, &mut reg, 2, 1, 1_000_000);
    let n = mandate::nonce(&m);
    let it = mk_intent(&m, pid, CAT_STABLE, 40, n, EXPIRY);
    let quote = coin::mint_for_testing<QUOTE>(40, sc.ctx());
    payment::pay_mock(&mut m, &reg, &mut pool, it, valid_witness(n), commitment(n + 1), quote, 1000, &clock, sc.ctx());
    execution::destroy_for_testing(pool);
    finish(sc, reg, m, clock);
}

#[test]
#[expected_failure(abort_code = 3, location = sentinel::payment)] // E_MARKET (venue != declared pool)
fun mock_wrong_venue_aborts() {
    let (mut sc, mut reg, mut m, clock) = start(1_000_000);
    let (mut pool, _pid) = mk_pool_allowed(&mut sc, &mut reg, 2, 1, 1_000_000);
    let n = mandate::nonce(&m);
    // intent declares an allowlisted-but-different market id, not this pool's id
    market_registry::add_market(&mut reg, pool_ok(), sc.ctx());
    let it = mk_intent(&m, pool_ok(), CAT_STABLE, 40, n, EXPIRY);
    let quote = coin::mint_for_testing<QUOTE>(40, sc.ctx());
    payment::pay_mock(&mut m, &reg, &mut pool, it, valid_witness(n), commitment(n + 1), quote, 0, &clock, sc.ctx());
    execution::destroy_for_testing(pool);
    finish(sc, reg, m, clock);
}

#[test]
#[expected_failure(abort_code = 10, location = sentinel::payment)] // E_AMOUNT
fun mock_amount_mismatch_aborts() {
    let (mut sc, mut reg, mut m, clock) = start(1_000_000);
    let (mut pool, pid) = mk_pool_allowed(&mut sc, &mut reg, 2, 1, 1_000_000);
    let n = mandate::nonce(&m);
    let it = mk_intent(&m, pid, CAT_STABLE, 40, n, EXPIRY); // intent says 40
    let quote = coin::mint_for_testing<QUOTE>(99, sc.ctx()); // coin is 99
    payment::pay_mock(&mut m, &reg, &mut pool, it, valid_witness(n), commitment(n + 1), quote, 0, &clock, sc.ctx());
    execution::destroy_for_testing(pool);
    finish(sc, reg, m, clock);
}

#[test]
#[expected_failure(abort_code = 1, location = sentinel::policy)] // E_OVER_CAP before any execution
fun mock_over_cap_aborts_before_execution() {
    let (mut sc, mut reg, mut m, clock) = start(100);
    let (mut pool, pid) = mk_pool_allowed(&mut sc, &mut reg, 2, 1, 1_000_000);
    let n = mandate::nonce(&m);
    let it = mk_intent(&m, pid, CAT_STABLE, 101, n, EXPIRY);
    let quote = coin::mint_for_testing<QUOTE>(101, sc.ctx());
    payment::pay_mock(&mut m, &reg, &mut pool, it, valid_witness(n), commitment(n + 1), quote, 0, &clock, sc.ctx());
    execution::destroy_for_testing(pool);
    finish(sc, reg, m, clock);
}

// --- Stage 0 sanity (kept) ---

#[test]
fun error_codes_are_distinct_and_stable() {
    assert!(errors::over_cap() == 1, 0);
    assert!(errors::replay() == 7, 0);
    assert!(errors::bad_witness() == 6, 0);
    assert!(errors::amount() == 10, 0);
    assert!(errors::slippage() == 11, 0);
}
