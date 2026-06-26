/// Venue adapter: `execute_real(pool, ...)` against DeepBook v3 and
/// `execute_mock(pool, ...)` against a MockPool, identical interface. Sits AFTER
/// policy + witness checks — the mock replaces the venue, never the law.
/// Implemented in Stage 3. Stub for Stage 0. (CLAUDE.md §5.5)
module sentinel::execution;
