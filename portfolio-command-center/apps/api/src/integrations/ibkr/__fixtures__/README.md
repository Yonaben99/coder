# IBKR fixtures

Hand-constructed JSON shaped to match IBKR's documented Client Portal
Gateway response fields (see `docs/IBKR_INTEGRATION.md`), used only to test
the mapping functions in `portfolio-mapper.ts` and `market-data.ts`.

**These are not real account data, not captured from a live session, and
must never be used as a stand-in for a real IBKR connection anywhere
outside `*.test.ts` files.** Values are deliberately round/obviously
synthetic (`1000`, `100.5`, ticker `TEST`) for that reason.
