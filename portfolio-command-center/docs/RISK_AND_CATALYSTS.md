# Analysts, Earnings, Catalysts & Risk — Phase 5

Status: implemented, read-only. **No real Finnhub analyst/earnings call has
been made from this environment** — `FINNHUB_API_KEY` is not set here. See
[§4 Live testing](#4-live-testing) for what that means and what's required
to run one.

## 1. Provider decision

Analyst estimates, rating changes, and the earnings calendar reuse
**Finnhub** — the same vendor and `FINNHUB_API_KEY` as Phase 4's news
integration, rather than onboarding a second vendor. Finnhub publishes
documented endpoints for all three:

- `stock/recommendation` — analyst recommendation trends (monthly
  strong-buy/buy/hold/sell/strong-sell counts).
- `stock/price-target` — consensus high/low/mean/median price target.
- `stock/upgrade-downgrade` — individual analyst rating/target changes
  (firm, from-grade, to-grade, action, date).
- `calendar/earnings` — earnings calendar entries (date, timing, EPS/revenue
  estimate and actual, per symbol).

**Verification caveat**: as with Finnhub's news endpoints
(`docs/NEWS_INTEGRATION.md` §2), this sandbox's network policy blocks
direct fetches to `finnhub.io` — these four endpoint shapes are documented
publicly at `finnhub.io/docs/api/*` but weren't verified against a live
response from here. `apps/api/src/integrations/analyst/types.ts` and
`apps/api/src/integrations/earnings/types.ts` isolate that assumption to
two files; if a real key surfaces a shape mismatch, that's the one place
to fix (the same containment `FinnhubHttpClient`/`classify*Error` already
give every other integration).

Reusing the existing key was a deliberate choice over evaluating a
dedicated analyst-data vendor (e.g. a paid estimates provider): it needs no
second account/API key from the user, and Finnhub's free tier (~60
requests/minute, see `docs/NEWS_INTEGRATION.md` §2) comfortably covers a
personal-portfolio-scale refresh pattern (a handful of calls per held
symbol on a multi-hour cache TTL, §3.3).

**Consensus rating**: Finnhub's recommendation-trend endpoint returns raw
analyst counts, not a single label. `deriveConsensusRating()`
(`apps/api/src/integrations/analyst/normalizer.ts`) computes one
deterministically — `(strongBuy*2 + buy*1 + hold*0 + sell*-1 +
strongSell*-2) / totalAnalysts`, bucketed into Strong Buy / Buy / Hold /
Sell / Strong Sell — and is always presented as analyst-derived, never as
this application's own view (task spec §5.1).

## 2. Catalyst engine

`CatalystService` (`apps/api/src/integrations/catalysts/catalyst-service.ts`)
is a deterministic aggregator, not a data source of its own: it depends
only on the existing `NewsDataSource`, `EarningsDataSource`, and
`AnalystDataSource` interfaces and maps their already-normalized output
into the shared `Catalyst` model.

| Source | Trigger | Catalyst type | `dateConfirmed` | `status` |
|---|---|---|---|---|
| News (medium/high relevance) | `NewsCategory` → `CatalystType` (`category-map.ts`) | e.g. `earnings`, `product_launch`, `merger_acquisition` | `true` (a reported fact) | `completed` (already happened, per its `publishedAt`) |
| Earnings calendar entry | Any entry with a `reportDate` | `earnings` | `false` (Finnhub gives a date, not a confirmation flag — see §1) | `upcoming` if the date is in the future, else `completed` |
| Analyst revision | Any upgrade/downgrade/reiterate | `analyst_revision` | `true` (a reported fact) | `completed` |

Idempotency: each catalyst carries `(sourceType, sourceId)` — e.g.
`(NEWS, <articleId>)`, `(EARNINGS, <earningsId>)`,
`(ANALYST_REVISION, <revisionId>)` — enforced as a DB unique constraint, so
re-syncing the same underlying event upserts the same row instead of
duplicating it (`catalyst-service.test.ts` verifies this directly).

Catalysts are events, not predictions: nothing in this engine forecasts an
outcome, assigns a probability, or recommends an action — it states what
is scheduled/reported and lets the reader (or Portfolio AI, per its system
prompt) draw conclusions.

## 3. Risk engine

`apps/api/src/integrations/risk/risk-engine.ts` computes every metric as a
pure function over already-fetched `Position[]`/`AccountSummary` — no I/O
of its own, easy to unit-test with fixtures (`risk-engine.test.ts`). There
is no composite "risk score": each metric is independently measurable,
documented, and returned with its own formula/source/severity.

| Metric key | Formula | Source |
|---|---|---|
| `largest_position_weight` | `max(position.weight)` | Computed |
| `top5_concentration` / `top10_concentration` | `sum(weight)` for the N largest positions | Computed |
| `sector_concentration` / `country_concentration` | `max(sum(weight) grouped by sector/country)` | Computed |
| `etf_vs_equity_exposure` | `sum(weight)` where `assetClass=STK` and `sector` is non-null (heuristic — see below) | Computed |
| `cash_exposure` | `account.cash / account.netLiquidation * 100` | IBKR |
| `single_name_exposure` | `count(positions where weight > 10%)` | Computed |
| `gross_exposure` | `sum(abs(marketValue)) / netLiquidation * 100` | Computed |
| `leverage` | Passed through as IBKR reports it (not recomputed) | IBKR |
| `margin_utilization` | `account.margin / account.netLiquidation * 100` | IBKR |
| `unrealized_pnl_concentration` | `abs(largest mover's unrealizedPnl) / sum(abs(every position's unrealizedPnl)) * 100` | Computed |
| `exposure_change_7d` / `concentration_change_7d` | Change vs. the closest `PortfolioSnapshot` at least ~5 days older | `PortfolioSnapshot`/`PositionSnapshot` history (Phase 6 scheduler) |

Severity thresholds (`risk-engine.ts`) are simple two-tier cutoffs per
metric (e.g. sector concentration: ≥30% medium, ≥50% high) — documented in
code alongside each metric, not hidden constants.

**Limitations, stated plainly:**

- **ETF vs. individual equity is a heuristic, not authoritative.** IBKR's
  position data has no explicit "is this an ETF" flag — ETFs trade under
  the same `STK` asset class as individual stocks
  (`apps/api/src/integrations/ibkr/portfolio-mapper.ts`, unchanged this
  phase). The heuristic (`STK` + empty GICS sector ⇒ "likely ETF", since
  ETFs generally have no single-industry sector classification) is
  documented in `apps/api/src/integrations/risk/asset-type.ts` and can
  misclassify a security with genuinely no sector data on file.
- **`exposure_change_7d`/`concentration_change_7d` need real snapshot
  history.** Before the Phase 6 `refreshPortfolioState` job has run at
  least twice, roughly a week apart, these two metrics report `value:
  null` with an explanation — never a substituted zero or an assumed
  trend (`historical-risk.test.ts` verifies this directly).
- **Volatility and drawdown metrics are not implemented.** They would need
  a return time series longer than the snapshot history this phase can
  realistically accumulate; listed here rather than silently omitted.

## 4. Live testing

`FINNHUB_API_KEY` is not set anywhere in this environment — confirmed
before writing this document. **No real analyst or earnings API call has
been made**; the endpoint shapes in §1 are unverified against a live
response from here.

To verify for real:

1. Set `FINNHUB_API_KEY` in `.env` (repo root) — the same key Phase 4's
   news integration uses.
2. Restart the backend.
3. Open Analysts or Targets, or call `GET /api/v1/analysts/AAPL`.
4. Check Settings → Connections / System Health — `checkAnalyst` (covering
   both analyst and earnings, since they share the vendor/key) only
   reports `operational` after a real fetch actually succeeds, the same
   honesty rule every other integration uses.
5. If Finnhub's actual field names differ from
   `apps/api/src/integrations/analyst/types.ts` or
   `apps/api/src/integrations/earnings/types.ts` in a way that breaks
   normalization, that's the one place to fix.

Risk and catalyst data don't need their own live test beyond IBKR/Finnhub
being connected — they're computed/aggregated from those two, not fetched
from a third vendor.

## 5. API endpoints

All under `/api/v1`, all requiring auth
(`apps/api/src/routes/{analysts,earnings,catalysts,risk}.ts`):

| Method | Path | Purpose |
|---|---|---|
| GET | `/analysts` | Analyst consensus for every currently-held symbol. |
| GET | `/analysts/:symbol` | Analyst consensus for one symbol, held or not. |
| GET | `/analysts/:symbol/revisions` | Recent rating/target changes for one symbol. |
| GET | `/earnings` | Upcoming earnings across every held symbol. |
| GET | `/earnings/:symbol` | Earnings entries for one symbol. |
| GET | `/catalysts`, `/catalysts/portfolio` | Portfolio-aware catalysts (same view — see §2's "no market-wide feed" note in the route file). |
| GET | `/catalysts/symbol/:symbol` | Catalysts for one symbol. |
| GET | `/risk`, `/risk/summary` | Full `PortfolioRiskSummary` — metrics + concentration breakdowns. |

## 6. AI tools

`getAnalystData`, `getAnalystRevisions`, `getUpcomingEarnings`,
`getPortfolioCatalysts`, `getRiskMetrics`, `getPortfolioRiskSummary`
(`apps/api/src/integrations/openai/tool-{definitions,executor}.ts`) —
following the Phase 3 pattern exactly: each calls the matching
`*DataSource` interface, never a provider directly. The system prompt
(`system-prompt.ts`) requires analyst data to be labeled **ANALYST
ESTIMATE** and forbids treating risk metrics or catalysts as investment
recommendations.

## 7. Security

Same pattern as every prior integration: `FINNHUB_API_KEY` read once in
`config.ts`, passed only into the two provider constructors, never
returned by any route, logged, or written to Postgres. Every route in §5
requires an authenticated session and scopes portfolio-aware queries to
`request.user.id` via the existing `PortfolioDataSource`.
