# News Integration — Phase 4

Status: implemented, read-only. **No real Finnhub call has been made from
this environment** — `FINNHUB_API_KEY` is not set here. See
[§9 Live testing](#9-live-testing) for what that means and what's required
to run one.

## 1. What this is — and isn't

Real, portfolio-aware news retrieval: recent market news, news for a
specific symbol, and news for the symbols currently held in the user's
IBKR account, each classified into deterministic categories with a
low/medium/high relevance signal. It does **not** interpret news, generate
a summary, or produce a "score" — that's a later layer (Portfolio AI can
already read this data via tools, see §7; deeper AI interpretation of news
is not part of this phase). Materiality classification here is a fixed
keyword rule table (§6), not a model.

Explicitly out of scope for this phase (see the task spec): analyst
targets/ratings, a catalyst/risk engine beyond what news normalization
already needs, automated alerts, trading, and autonomous/scheduled AI
monitoring of news.

## 2. Provider selection

Finnhub was chosen over Financial Modeling Prep (the other candidate named
in `ARCHITECTURE.md`/`README.md`). Both offer a free tier with news
endpoints; the deciding factors:

| | Finnhub | FMP |
|---|---|---|
| Free-tier rate limit | ~60 requests/minute | 250 requests/**day** |
| Ticker-scoped news endpoint | `/company-news?symbol=...&from=...&to=...` — purpose-built for "news about this symbol" | Endpoint exists but is less consistently documented/available on the free tier |
| Auth | Single header (`X-Finnhub-Token`) | Query-param API key |
| Bundled adjacent data (useful later, not used this phase) | SEC filings, basic financials | Similar breadth |

FMP's 250-requests-per-day free-tier cap is materially tighter for a
portfolio-aware feature that fans out one company-news call per held
symbol (§5) on top of a general market-news call — a ~10-position
portfolio refreshed every 10 minutes would exhaust FMP's daily quota in
well under an hour. Finnhub's per-minute limit comfortably covers that
same pattern.

**Verification caveat**: this sandbox's network policy blocks direct
fetches to `finnhub.io` (consistent with the same restriction documented in
`docs/IBKR_INTEGRATION.md` and `docs/OPENAI_INTEGRATION.md` for their own
vendor docs) — the endpoint shapes, auth header, and rate limits above are
from WebSearch's indexed summaries and cross-corroborated across multiple
independent sources, not read directly from Finnhub's own current docs
from here. `FinnhubHttpClient` (`apps/api/src/integrations/news/client.ts`)
isolates that assumption to one file — see §9 for how to verify it for
real once a key is available.

**Pricing**: Finnhub's free tier is used here (no paid tier configured or
assumed). Paid tiers exist for higher throughput/lower latency but are out
of scope — nothing in this codebase assumes or requires one.

## 3. Architecture

```
NewsDataSource (interface)
      ↓
NewsIntegrationDataSource ⟶ resolves "which symbols" via PortfolioDataSource
      ↓                      (never reads IBKR directly, never invents holdings)
NewsService ⟶ NewsProvider (interface)
      ↓              ↓
      ↓        FinnhubNewsProvider ⟶ FinnhubHttpClient ⟶ Finnhub REST API
      ↓
  ingest(): normalize → classify → dedup → upsert
      ↓
  Postgres (NewsArticle / NewsEvent)
```

- **`NewsDataSource`** (`apps/api/src/domain/data-sources/news-data-source.ts`)
  — the interface the rest of the app depends on. `NotConnectedNewsDataSource`
  (Phase 1) implements it honestly before a provider is configured;
  `NewsIntegrationDataSource` (this phase) implements it for real.
- **`NewsIntegrationDataSource`**
  (`apps/api/src/integrations/news/news-integration-data-source.ts`) — mirrors
  `IbkrPortfolioDataSource`'s role: resolves "what does this user hold" via
  the existing `PortfolioDataSource` (so it inherits IBKR's own honesty —
  no holdings if IBKR isn't connected, real holdings otherwise) and shapes
  the response. Owns nothing vendor-specific.
- **`NewsService`** (`apps/api/src/integrations/news/news-service.ts`) — the
  orchestrator: caching (§8), ingestion (normalize → classify → dedup →
  upsert), and the live/cached/unavailable decision, mirroring
  `IbkrConnectionManager`'s pattern rather than inventing a new one.
- **`NewsProvider`** (`apps/api/src/integrations/news/news-provider.ts`) — a
  vendor-agnostic contract (`isConfigured`, `getCompanyNews`,
  `getMarketNews`). Swapping vendors means writing a new class implementing
  this interface; nothing above it changes.
- **`FinnhubNewsProvider`** / **`FinnhubHttpClient`** — the only files that
  know about Finnhub's actual endpoint shapes and auth header.
- **`categorizer.ts`** / **`normalizer.ts`** / **`dedup.ts`** — pure,
  deterministic functions (§6, §8) with no I/O, straightforward to unit test
  in isolation (see `apps/api/src/integrations/news/*.test.ts`).

## 4. Data model

Reuses and extends the Phase 1 schema rather than duplicating it:

- **`NewsArticle`** — one row per distinct article. Key fields:
  `relatedSymbols: String[]` (every ticker this article concerns — chosen
  over a join table as a deliberate, pragmatic simplification appropriate
  to this app's scale; a personal portfolio's article volume never
  approaches where that would matter), `provider` + `externalId` (unique
  together — the idempotency key for re-fetches, §8), `publishedAt` vs.
  `retrievedAt` (tracked separately — see §5), `relevance`
  (`RelevanceLevel`: `LOW`/`MEDIUM`/`HIGH`), `status`
  (`NewsArticleStatus`: `ACTIVE`/`DUPLICATE`) and `duplicateOfId` (§8).
- **`NewsEvent`** — one row per category an article was classified into
  (an article can match more than one category); `eventType` uses the
  existing `NewsEventType` enum, extended this phase with
  `PRODUCT, CAPITAL_ALLOCATION, BUYBACK, DIVIDEND, FINANCING, SUPPLY_CHAIN,
  CUSTOMER, PARTNERSHIP, ANALYST_ACTION, PRICE_MOVEMENT` (the categories
  `earnings`, `guidance`, `merger_acquisition`, `regulation`, `litigation`,
  `management_change`, `macro`, `contract`, and `other` already existed
  from the Phase 1 schema).

No new top-level model was needed — `Catalyst` and `Instrument` are
untouched this phase.

## 5. Portfolio-aware news and recency

`NewsIntegrationDataSource.getPortfolioNews(userId)` calls
`PortfolioDataSource.getPositions(userId)` to get the real, currently-held
symbol list; if IBKR isn't connected or has no visible positions, it
reports `unavailable` with the same honest reason IBKR itself gives —
**it never fabricates a symbol list**, including on a page or tool that
only needs a *count*, not the holdings themselves (`getPortfolioNewsSummary`
takes the same path).

Every `NewsArticle` tracks two independent timestamps: `publishedAt` (when
the article was actually published, from the provider) and `retrievedAt`
(when this system last confirmed it via the provider — updated on every
re-fetch, even one that turns up no new articles). Endpoints support a
`since` window (`hour`, `today`, `24h`, `7d`, `latest`) filtered against
`publishedAt`, applied after the (already cached/normalized) fetch — see
`apps/api/src/routes/news.ts`.

## 6. Materiality / relevance classification

Fully deterministic, keyword-based — no AI or ML involved in this phase,
by design (the task spec is explicit that the AI must not be the thing
deciding what's material). `classifyNewsText()`
(`apps/api/src/integrations/news/categorizer.ts`) matches the headline +
summary against a fixed keyword table per category
(`CATEGORY_KEYWORDS`), then derives a relevance tier from which categories
matched:

- **High**: `earnings`, `guidance`, `merger_acquisition`, `regulation`,
  `litigation`, `management_change`, `analyst_action`, `price_movement`.
- **Medium**: `product`, `capital_allocation`, `buyback`, `dividend`,
  `financing`, `supply_chain`, `customer`, `partnership`, `contract`.
- **Low**: no category matched (`other`) — or, in principle, a future
  category added below the medium tier.

An article can match multiple categories; relevance is the *highest* tier
among its matches. This is an information-relevance signal ("worth
surfacing"), explicitly not an investment recommendation — "high" doesn't
mean "buy" or "sell", and nothing in this phase produces a numeric
"investment score". Every rule is in one table
(`categorizer.ts`), tested in `categorizer.test.ts`.

## 7. Endpoints and AI tools

All under `/api/v1`, all requiring auth (`apps/api/src/routes/news.ts`):

| Method | Path | Purpose |
|---|---|---|
| GET | `/news` | General list; optional `category`, `since`, `limit` filters. |
| GET | `/news/recent` | Convenience shorthand for the latest market news, unfiltered. `limit`. |
| GET | `/news/portfolio` | News for the user's currently held symbols. `since`, `limit`. |
| GET | `/news/portfolio/summary` | Per-symbol medium/high-relevance update counts — backs the portfolio news view. |
| GET | `/news/symbol/:symbol` | News for one symbol, held or not. `since`, `limit`. |
| GET | `/news/:id` | A single article by id. 404 if it doesn't exist (never a fabricated one). |

Every list endpoint returns the shared `LiveData<NewsItem[]>` envelope
(`{data, meta: {source, timestamp, status, reason?}}`) — reused from
Phase 1/2, not reinvented — so the frontend and AI tools render the same
live/cached/unavailable states every other integration already uses.

Portfolio AI tools (`apps/api/src/integrations/openai/tool-definitions.ts`
+ `tool-executor.ts`), following the Phase 3 pattern exactly — each calls
`NewsDataSource`, never `NewsService` or the provider directly:

| Tool | Backs onto |
|---|---|
| `getRecentNews(limit?)` | `NewsDataSource.getRecentNews` |
| `getPortfolioNews(limit?)` | `NewsDataSource.getPortfolioNews` |
| `getNewsForSymbol(symbol, limit?)` | `NewsDataSource.getNewsForSymbol` |
| `getMaterialPortfolioUpdates()` | `NewsDataSource.getMaterialPortfolioUpdates` (medium/high-relevance slice of portfolio news) |

## 8. Caching and deduplication

**Caching**: `RECENT_CACHE_TTL_MS` = 10 minutes
(`apps/api/src/integrations/news/news-service.ts`) — news doesn't move
second-to-second like a quote, so a shorter TTL (like IBKR's 15s account
cache) would just burn rate limit for no real freshness gain; 10 minutes
comfortably fits Finnhub's free-tier per-minute limit even with several
held symbols refreshed together. On a refresh failure past the TTL, the
last successfully ingested data is served with `status: "cached"` and the
real error as `reason` — never silently stale-as-live, and never replaced
with nothing. A cold instance with no in-memory fetch timestamp but
existing DB rows (e.g. right after a restart) also serves `cached`, not
`unavailable` — real prior data is still real data.

**Deduplication**, two layers (`apps/api/src/integrations/news/dedup.ts`):

1. **Exact re-fetch**: `NewsArticle` has a unique `(provider, externalId)`
   constraint. Re-fetching the same article just updates `retrievedAt` on
   the existing row (`NewsService.ingest`) — enforced at the DB layer, not
   application logic.
2. **Cross-query duplicates**: the same real-world story can arrive under a
   *different* `externalId` — returned by both a symbol query and the
   general market query, or re-syndicated by a different source. Detected
   by normalized-URL match (`normalizeUrlForDedup` — strips `utm_*`/`ref`/
   `src`/`cmpid` tracking params and a trailing slash) **or** headline
   similarity (Jaccard token overlap ≥ 0.8) within a 24-hour window and a
   shared related symbol (`isLikelyDuplicate`). A match marks the newer row
   `status: DUPLICATE` pointing at the original via `duplicateOfId` — both
   rows are kept (so source attribution for either is never lost), but
   every query filters to `status: ACTIVE`, so only the original surfaces.
   Deliberately conservative: a missed duplicate just shows two cards for
   one event; a false-positive duplicate would hide a real, distinct story,
   which is the worse failure mode for a system that must never look like
   it's hiding information.

## 9. Live testing

`FINNHUB_API_KEY` is not set anywhere in this environment (`.env`, shell,
or otherwise) — confirmed before writing this document. **No real Finnhub
API call has been made**; the endpoint shapes in §2 are unverified against
a live response from here.

To verify for real:

1. Get a free API key at [finnhub.io](https://finnhub.io) and set
   `FINNHUB_API_KEY` in `.env` (repo root).
2. Restart the backend.
3. Open News → Latest, or call `GET /api/v1/news/recent`.
4. Check Settings → Connections / System Health — `checkNews` only reports
   `operational` after a real fetch actually succeeds
   (`apps/api/src/domain/health/health-checks.ts`), the same honesty rule
   Phase 2/3 established for IBKR and OpenAI.
5. If Finnhub's actual field names differ from `FinnhubNewsArticle`
   (`apps/api/src/integrations/news/types.ts`) in a way that breaks
   `normalizeFinnhubArticle`, that's the one place to fix — it's isolated
   from everything above it.

## 10. Security

- `FINNHUB_API_KEY` is read once from env in `config.ts`, passed only to
  `FinnhubNewsProvider`'s constructor, never returned by any route, never
  logged, and never written to Postgres.
- Every news route requires an authenticated session
  (`apps/api/src/auth/middleware.ts`, unchanged from Phase 1).
- `getPortfolioNews`/`getPortfolioNewsSummary` are scoped to
  `request.user.id` via `PortfolioDataSource.getPositions(userId)` — one
  user's held symbols are never used to answer another user's request.
- Article content stored in Postgres (`NewsArticle`) is exactly what the
  provider returned (headline/summary/url/source), nothing more — no
  scraping of the linked article's full text.

## 11. Known limitations

- Single provider (Finnhub) — the `NewsProvider` interface supports adding
  a second one, but no failover/merge-across-providers logic exists yet.
- `relatedSymbols` is a plain string array, not a join table — fine at this
  app's scale (§4), would need revisiting at much higher volume.
- No push/webhook ingestion — everything is pull-based, triggered by a
  request landing within the cache-stale window. No scheduled background
  refresh job exists yet (explicitly out of scope this phase per the task
  spec's "no automated alerts" constraint).
- Deep AI interpretation of news content (beyond the four read tools in
  §7) is not part of this phase.
