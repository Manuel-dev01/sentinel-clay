/// Shared abort codes for the Sentinel package (CLAUDE.md §5.6).
///
/// Every policy check, witness verification, and mandate guard aborts with one of
/// these codes. Exposing them through accessors means `seal_policy::seal_approve`
/// (off-chain dry-run) and `payment::pay` (on-chain enforcement) reference the
/// *exact same* values - the off-chain verdict can never diverge from on-chain law.
module sentinel::errors;

const E_OVER_CAP: u64 = 1; // daily cap exceeded
const E_CATEGORY: u64 = 2; // asset category not allowed
const E_MARKET: u64 = 3; // DeepBook market not in registry
const E_EXPIRED: u64 = 4; // intent or mandate expired
const E_REVOKED: u64 = 5; // mandate revoked by owner
const E_BAD_WITNESS: u64 = 6; // witness hash != commitment
const E_REPLAY: u64 = 7; // witness already consumed (one-shot)
const E_NONCE: u64 = 8; // nonce mismatch
const E_NOT_OWNER: u64 = 9; // caller is not the mandate owner / registry admin
const E_AMOUNT: u64 = 10; // intent.amount != the coin actually supplied to execute
const E_SLIPPAGE: u64 = 11; // fill below min_base_out (slippage / insufficient reserve)
const E_BAD_ID: u64 = 12; // Seal identity bytes malformed (too short to decode mandate||nonce)

public fun over_cap(): u64 { E_OVER_CAP }
public fun category(): u64 { E_CATEGORY }
public fun market(): u64 { E_MARKET }
public fun expired(): u64 { E_EXPIRED }
public fun revoked(): u64 { E_REVOKED }
public fun bad_witness(): u64 { E_BAD_WITNESS }
public fun replay(): u64 { E_REPLAY }
public fun nonce(): u64 { E_NONCE }
public fun not_owner(): u64 { E_NOT_OWNER }
public fun amount(): u64 { E_AMOUNT }
public fun slippage(): u64 { E_SLIPPAGE }
public fun bad_id(): u64 { E_BAD_ID }
