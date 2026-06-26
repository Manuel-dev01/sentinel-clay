/// Seal access predicate. Seal key servers dry-run this; it MUST be side-effect-free
/// and call the SAME `policy::check` that `payment::pay` calls, so the off-chain verdict
/// can never diverge from on-chain enforcement. (CLAUDE.md §5.3)
///
/// Stage 1: the predicate exists and is testable (it routes through `policy::check`).
/// Stage 2/4: `id` will encode `mandate_id || nonce` to bind a release to one mandate
/// state, and the signature will be adapted to Seal's exact `entry fun seal_approve*`
/// shape (entry params can't take a non-object `&PaymentIntent`). See DECISIONS.md.
module sentinel::seal_policy;

use sui::clock::Clock;
use sentinel::mandate::Mandate;
use sentinel::market_registry::MarketRegistry;
use sentinel::policy::{Self, PaymentIntent};

public fun seal_approve(
    _id: vector<u8>,
    mandate: &Mandate,
    registry: &MarketRegistry,
    intent: &PaymentIntent,
    clock: &Clock,
) {
    policy::check(mandate, registry, intent, clock);
}
