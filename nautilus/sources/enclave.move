/// sentinel_nautilus::enclave - provable agent-strategy authorship (Nautilus TEE stretch).
///
/// Binds an agent's PaymentIntent proposals to a key that lives only inside an attested AWS Nitro
/// enclave, so a proposal can be proven to come from the published strategy binary (its PCR0 code
/// measurement) rather than a tampered fork. This is ADDITIVE and NON-CUSTODIAL: the enclave key
/// signs *proposals* (data), never *settlements* - custody stays with the user's wallet, so the
/// Sentinel thesis ("the agent never holds a spending key") is untouched. The enclave key is an
/// authorship attestation, not a spending authority.
///
/// Kept in a SEPARATE package from `sentinel` so the audited core is never destabilized by a stretch
/// (CLAUDE.md Decision #1 / Stage 6). See NAUTILUS.md for the full architecture and the live-deploy
/// last mile (on-chain CBOR/COSE Nitro attestation parsing). This module ships the genuinely
/// verifiable machinery: register an enclave key (dev/unattested for the mock path) and verify that
/// a proposal payload was signed by it, using Sui's native ed25519.
module sentinel_nautilus::enclave;

use sui::ed25519;
use sui::clock::Clock;

/// Signature did not verify against the registered enclave key.
const E_BAD_SIG: u64 = 1;
/// The registered enclave config has passed its expiry.
const E_EXPIRED: u64 = 2;

/// A registered enclave identity. `attested` distinguishes a real Nitro-attested registration from
/// the dev/mock path; the dev path is clearly labelled unattested on-chain and in the UI so we never
/// overclaim a hardware root of trust we did not produce (CLAUDE.md: verified over optimistic).
public struct EnclaveConfig has key, store {
    id: UID,
    /// 32-byte ed25519 public key that signs proposals inside the enclave.
    public_key: vector<u8>,
    /// Code measurement of the strategy binary (PCR0), or a human label in the dev path.
    pcr0: vector<u8>,
    /// True iff registered from a verified Nitro attestation (always false on the dev path).
    attested: bool,
    /// 0 = never expires; otherwise a ms timestamp after which proposals are rejected.
    expiry_ms: u64,
}

// --- accessors ---
public fun public_key(c: &EnclaveConfig): vector<u8> { c.public_key }
public fun pcr0(c: &EnclaveConfig): vector<u8> { c.pcr0 }
public fun is_attested(c: &EnclaveConfig): bool { c.attested }
public fun expiry_ms(c: &EnclaveConfig): u64 { c.expiry_ms }

public fun is_expired(c: &EnclaveConfig, clock: &Clock): bool {
    c.expiry_ms != 0 && clock.timestamp_ms() > c.expiry_ms
}

/// DEV / mock registration: register a locally generated keypair as the "enclave" and share the
/// config. `attested = false` - this exercises the full verify path end-to-end WITHOUT AWS Nitro
/// (the CLAUDE.md fallback so the story is demoable even without live hardware). Returns the
/// shared EnclaveConfig's ID.
public fun register_dev(
    public_key: vector<u8>,
    pcr0_label: vector<u8>,
    expiry_ms: u64,
    ctx: &mut TxContext,
): ID {
    let cfg = EnclaveConfig {
        id: object::new(ctx),
        public_key,
        pcr0: pcr0_label,
        attested: false,
        expiry_ms,
    };
    let cid = object::id(&cfg);
    transfer::share_object(cfg);
    cid
}

/// Non-aborting authorship check: true iff `sig` is a valid enclave-key ed25519 signature over
/// `payload` and the config has not expired. Use this to drive an "attested" badge in the UI.
public fun verify_proposal(
    cfg: &EnclaveConfig,
    payload: vector<u8>,
    sig: vector<u8>,
    clock: &Clock,
): bool {
    if (is_expired(cfg, clock)) return false;
    ed25519::ed25519_verify(&sig, &cfg.public_key, &payload)
}

/// Asserting variant: aborts `E_EXPIRED` / `E_BAD_SIG`. Use to gate a proposal before it is settled
/// - a forged or unauthored proposal cannot pass.
public fun assert_proposal(
    cfg: &EnclaveConfig,
    payload: vector<u8>,
    sig: vector<u8>,
    clock: &Clock,
) {
    assert!(!is_expired(cfg, clock), E_EXPIRED);
    assert!(ed25519::ed25519_verify(&sig, &cfg.public_key, &payload), E_BAD_SIG);
}

// --- tests (inline so they can see the private error codes) ---
// Vectors are RFC 8032 ed25519 Test 2 (1-byte message 0x72), proving we verify against the real
// curve, not a stub: a genuine (pk, msg, sig) triple verifies; a tampered message does not.

#[test_only]
const PK: vector<u8> = x"3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c";
#[test_only]
const MSG: vector<u8> = x"72";
#[test_only]
const SIG: vector<u8> = x"92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00";

#[test_only]
fun drop_cfg(c: EnclaveConfig) {
    let EnclaveConfig { id, public_key: _, pcr0: _, attested: _, expiry_ms: _ } = c;
    object::delete(id);
}

#[test]
fun authentic_proposal_verifies() {
    let mut ctx = sui::tx_context::dummy();
    let clock = sui::clock::create_for_testing(&mut ctx);
    let cfg = EnclaveConfig { id: object::new(&mut ctx), public_key: PK, pcr0: b"dev-pcr0", attested: false, expiry_ms: 0 };
    assert!(verify_proposal(&cfg, MSG, SIG, &clock), 0);
    assert_proposal(&cfg, MSG, SIG, &clock); // must not abort
    assert!(!is_attested(&cfg), 1);          // dev path is unattested
    drop_cfg(cfg);
    sui::clock::destroy_for_testing(clock);
}

#[test]
fun forged_proposal_returns_false() {
    let mut ctx = sui::tx_context::dummy();
    let clock = sui::clock::create_for_testing(&mut ctx);
    let cfg = EnclaveConfig { id: object::new(&mut ctx), public_key: PK, pcr0: b"dev-pcr0", attested: false, expiry_ms: 0 };
    assert!(!verify_proposal(&cfg, b"tampered-proposal", SIG, &clock), 0);
    drop_cfg(cfg);
    sui::clock::destroy_for_testing(clock);
}

#[test]
#[expected_failure(abort_code = E_BAD_SIG)]
fun forged_proposal_aborts() {
    let mut ctx = sui::tx_context::dummy();
    let clock = sui::clock::create_for_testing(&mut ctx);
    let cfg = EnclaveConfig { id: object::new(&mut ctx), public_key: PK, pcr0: b"dev-pcr0", attested: false, expiry_ms: 0 };
    assert_proposal(&cfg, b"tampered-proposal", SIG, &clock);
    drop_cfg(cfg);
    sui::clock::destroy_for_testing(clock);
}

#[test]
#[expected_failure(abort_code = E_EXPIRED)]
fun expired_config_aborts() {
    let mut ctx = sui::tx_context::dummy();
    let mut clock = sui::clock::create_for_testing(&mut ctx);
    sui::clock::set_for_testing(&mut clock, 1_000);
    let cfg = EnclaveConfig { id: object::new(&mut ctx), public_key: PK, pcr0: b"dev-pcr0", attested: false, expiry_ms: 500 };
    assert_proposal(&cfg, MSG, SIG, &clock); // expired -> abort before sig check
    drop_cfg(cfg);
    sui::clock::destroy_for_testing(clock);
}
