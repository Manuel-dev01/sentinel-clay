#[test_only]
/// Stage 1+2 suite: every abort code, the spend-cap invariant, a deterministic fuzz, the
/// off-chain/on-chain differential, AND one-shot witness / replay protection. This is the test
/// backing the demo's two aborts: "over-cap rejected" and "replayed authorization rejected".
/// (CLAUDE.md §7)
module sentinel::sentinel_tests;

use std::bcs;
use sui::test_scenario::{Self as ts, Scenario};
use sui::clock::{Self, Clock};
use sui::hash;
use sentinel::errors;
use sentinel::mandate::{Self, Mandate};
use sentinel::market_registry::{Self, MarketRegistry};
use sentinel::policy::{Self, PaymentIntent};
use sentinel::payment::{Self, Witness};
use sentinel::seal_policy;

const ADMIN: address = @0xA;
const STRANGER: address = @0xB;
const RECIP: address = @0xCAFE;
const CAT_STABLE: u8 = 0; // the one allowed category in these tests
const CAT_OTHER: u8 = 7;
const DAY1: u64 = 86_400_000; // 1 day in ms
const EXPIRY: u64 = 100 * 86_400_000; // mandate lifetime: far future
const SEED: vector<u8> = b"sentinel-local-witness-seed";

// --- LocalWitnessProvider (deterministic): preimage_n = keccak(seed||bcs(n)); commit = keccak(preimage) ---

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

/// Fresh scenario at day 1: registry (POOL_OK allowed) + mandate (cap, category {0}, nonce 0,
/// commitment(0)). By-value objects (no shared-object ceremony for unit tests).
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
    policy::new_intent(mandate::id(m), pool, cat, amount, RECIP, nonce, expiry)
}

/// Compliant pay at the mandate's CURRENT nonce with a valid witness + the next commitment.
#[test_only]
fun pay_compliant(sc: &mut Scenario, m: &mut Mandate, reg: &MarketRegistry, clock: &Clock, amount: u64) {
    let n = mandate::nonce(m);
    let it = mk_intent(m, pool_ok(), CAT_STABLE, amount, n, EXPIRY);
    payment::pay(m, reg, it, valid_witness(n), commitment(n + 1), clock, sc.ctx());
}

/// Deterministic LCG (overflow-safe via u128) so the fuzz is reproducible.
#[test_only]
fun lcg(x: u64): u64 {
    let a: u128 = 6364136223846793005;
    let c: u128 = 1442695040888963407;
    (((a * (x as u128) + c) % (1u128 << 64)) as u64)
}

// --- per-abort-code matrix via evaluate (non-aborting, exact code) ---

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

// --- abort-path proofs: pay / check / seal_approve abort on violations ---

#[test]
#[expected_failure(abort_code = 1, location = sentinel::policy)] // E_OVER_CAP
fun pay_over_cap_aborts() {
    let (mut sc, reg, mut m, clock) = start(100);
    let it = mk_intent(&m, pool_ok(), CAT_STABLE, 101, mandate::nonce(&m), EXPIRY);
    payment::pay(&mut m, &reg, it, valid_witness(0), commitment(1), &clock, sc.ctx());
    finish(sc, reg, m, clock);
}

#[test]
#[expected_failure(abort_code = 3, location = sentinel::policy)] // E_MARKET
fun pay_wrong_market_aborts() {
    let (mut sc, reg, mut m, clock) = start(1_000_000);
    let it = mk_intent(&m, pool_bad(), CAT_STABLE, 10, mandate::nonce(&m), EXPIRY);
    payment::pay(&mut m, &reg, it, valid_witness(0), commitment(1), &clock, sc.ctx());
    finish(sc, reg, m, clock);
}

#[test]
#[expected_failure(abort_code = 5, location = sentinel::mandate)] // E_REVOKED
fun pay_on_revoked_mandate_aborts() {
    let (mut sc, reg, mut m, clock) = start(1_000_000);
    mandate::revoke(&mut m, sc.ctx());
    let it = mk_intent(&m, pool_ok(), CAT_STABLE, 10, mandate::nonce(&m), EXPIRY);
    payment::pay(&mut m, &reg, it, valid_witness(0), commitment(1), &clock, sc.ctx());
    finish(sc, reg, m, clock);
}

#[test]
#[expected_failure(abort_code = 2, location = sentinel::policy)] // E_CATEGORY
fun seal_approve_rejects_bad_category() {
    let (sc, reg, m, clock) = start(1_000_000);
    let it = mk_intent(&m, pool_ok(), CAT_OTHER, 10, mandate::nonce(&m), EXPIRY);
    seal_policy::seal_approve(b"id", &m, &reg, &it, &clock);
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

// --- Stage 2: one-shot witness / replay protection ---

#[test]
#[expected_failure(abort_code = 7, location = sentinel::payment)] // E_REPLAY
fun replayed_witness_aborts() {
    let (mut sc, reg, mut m, clock) = start(1_000_000);
    // first compliant pay at nonce 0 settles and rotates -> nonce 1
    pay_compliant(&mut sc, &mut m, &reg, &clock, 10);
    // attacker: fresh intent at the CURRENT nonce (1) but recycles the already-used nonce-0 witness
    let it = mk_intent(&m, pool_ok(), CAT_STABLE, 10, mandate::nonce(&m), EXPIRY);
    payment::pay(&mut m, &reg, it, valid_witness(0), commitment(2), &clock, sc.ctx());
    finish(sc, reg, m, clock);
}

#[test]
#[expected_failure(abort_code = 7, location = sentinel::payment)] // E_REPLAY (wrong nonce)
fun wrong_nonce_witness_aborts() {
    let (mut sc, reg, mut m, clock) = start(1_000_000);
    // intent nonce matches (0) so policy passes, but witness is minted for nonce 1
    let it = mk_intent(&m, pool_ok(), CAT_STABLE, 10, mandate::nonce(&m), EXPIRY);
    payment::pay(&mut m, &reg, it, valid_witness(1), commitment(1), &clock, sc.ctx());
    finish(sc, reg, m, clock);
}

#[test]
#[expected_failure(abort_code = 6, location = sentinel::payment)] // E_BAD_WITNESS
fun forged_witness_aborts() {
    let (mut sc, reg, mut m, clock) = start(1_000_000);
    let it = mk_intent(&m, pool_ok(), CAT_STABLE, 10, mandate::nonce(&m), EXPIRY);
    // correct nonce (0) but garbage preimage -> hash mismatch
    let forged = payment::mint_witness(b"not-the-real-preimage", 0);
    payment::pay(&mut m, &reg, it, forged, commitment(1), &clock, sc.ctx());
    finish(sc, reg, m, clock);
}

#[test]
fun rotation_advances_commitment_and_nonce() {
    let (mut sc, reg, mut m, clock) = start(1_000_000);
    assert!(mandate::nonce(&m) == 0, 0);
    assert!(mandate::witness_commitment(&m) == commitment(0), 1);
    pay_compliant(&mut sc, &mut m, &reg, &clock, 10);
    assert!(mandate::nonce(&m) == 1, 2);
    assert!(mandate::witness_commitment(&m) == commitment(1), 3);
    finish(sc, reg, m, clock);
}

#[test]
fun invariant_nonce_monotonic_and_rotates() {
    let (mut sc, reg, mut m, clock) = start(1_000_000_000);
    let mut prev = mandate::nonce(&m);
    let mut i = 0;
    while (i < 25) {
        pay_compliant(&mut sc, &mut m, &reg, &clock, 1); // tiny spends, big cap, same day
        let now = mandate::nonce(&m);
        assert!(now == prev + 1, i); // strictly monotonic, +1 per spend
        assert!(mandate::witness_commitment(&m) == commitment(now), 1000 + i); // rotated to next
        prev = now;
        i = i + 1;
    };
    finish(sc, reg, m, clock);
}

// --- settle + accounting ---

#[test]
fun pay_compliant_settles_and_accounts() {
    let (mut sc, reg, mut m, clock) = start(1_000_000);
    pay_compliant(&mut sc, &mut m, &reg, &clock, 40);
    assert!(mandate::spent_today(&m) == 40, 0);
    assert!(mandate::nonce(&m) == 1, 1);
    // second compliant pay (now at nonce 1) accumulates same-day spend
    pay_compliant(&mut sc, &mut m, &reg, &clock, 60);
    assert!(mandate::spent_today(&m) == 100, 2);
    assert!(mandate::nonce(&m) == 2, 3);
    finish(sc, reg, m, clock);
}

#[test]
fun day_rollover_resets_spend() {
    let (mut sc, reg, mut m, mut clock) = start(100);
    pay_compliant(&mut sc, &mut m, &reg, &clock, 80);
    assert!(mandate::spent_today(&m) == 80, 0);
    // same day: +80 would exceed cap 100 (nonce now 1)
    let it_over = mk_intent(&m, pool_ok(), CAT_STABLE, 80, mandate::nonce(&m), EXPIRY);
    assert!(policy::evaluate(&m, &reg, &it_over, &clock) == errors::over_cap(), 1);
    // advance to day 3: effective spend resets
    clock::set_for_testing(&mut clock, DAY1 * 3);
    assert!(mandate::effective_spent(&m, &clock) == 0, 2);
    pay_compliant(&mut sc, &mut m, &reg, &clock, 80);
    assert!(mandate::spent_today(&m) == 80, 3);
    finish(sc, reg, m, clock);
}

// --- invariant: spent_today never exceeds daily_cap across arbitrary sequences (§7-1) ---

#[test]
fun invariant_spent_never_exceeds_cap() {
    let (mut sc, reg, mut m, mut clock) = start(1_000);
    let cap = mandate::daily_cap(&m);
    let mut seed = 99u64;
    let mut cur = DAY1; // monotonic clock (set_for_testing only moves forward)
    let mut i = 0;
    while (i < 200) {
        seed = lcg(seed);
        let amt = seed % 400;
        seed = lcg(seed);
        cur = cur + (seed % (DAY1 / 4)); // advance 0..0.25 day; crosses boundaries, stays < EXPIRY
        clock::set_for_testing(&mut clock, cur);
        let n = mandate::nonce(&m);
        let it = mk_intent(&m, pool_ok(), CAT_STABLE, amt, n, EXPIRY);
        if (policy::evaluate(&m, &reg, &it, &clock) == 0) {
            payment::pay(&mut m, &reg, it, valid_witness(n), commitment(n + 1), &clock, sc.ctx());
        };
        assert!(mandate::effective_spent(&m, &clock) <= cap, 100 + i);
        i = i + 1;
    };
    finish(sc, reg, m, clock);
}

// --- fuzz: evaluate matches an independent spec for random intents (§7 fuzz + inv 5) ---

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
        let got = policy::evaluate(&m, &reg, &it, &clock);
        assert!(got == expected, i);
        i = i + 1;
    };
    finish(sc, reg, m, clock);
}

// --- differential: on a compliant intent, seal_approve passes AND pay settles (§7-5) ---

#[test]
fun differential_compliant_seal_and_pay_agree() {
    let (mut sc, reg, mut m, clock) = start(1_000);
    let it = mk_intent(&m, pool_ok(), CAT_STABLE, 50, mandate::nonce(&m), EXPIRY);
    seal_policy::seal_approve(b"id", &m, &reg, &it, &clock); // does not abort
    pay_compliant(&mut sc, &mut m, &reg, &clock, 50); // settles the same shape of intent
    assert!(mandate::spent_today(&m) == 50, 0);
    finish(sc, reg, m, clock);
}

// --- Stage 0 sanity (kept) ---

#[test]
fun error_codes_are_distinct_and_stable() {
    assert!(errors::over_cap() == 1, 0);
    assert!(errors::replay() == 7, 0);
    assert!(errors::bad_witness() == 6, 0);
    assert!(errors::over_cap() != errors::replay(), 1);
}
