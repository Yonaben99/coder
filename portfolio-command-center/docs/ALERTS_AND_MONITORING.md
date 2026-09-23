# Alerts & Monitoring — Phase 6

Status: implemented. **No live IBKR/Finnhub credentials exist in this
environment**, so every job registered below runs for real on its real
schedule but currently has zero authenticated users and zero configured
providers to act on — see [§6](#6-what-actually-runs-in-this-sandbox) for
exactly what that means.

## 1. What this is — and isn't

The system observes, classifies, and notifies. **It does not place,
modify, or cancel orders, and nothing in this phase moves toward that** —
see `AlertEngine`/detectors for confirmation that no code path calls an
IBKR order endpoint. Detection is entirely deterministic; an LLM is never
called as part of detecting or raising an alert (§7).

## 2. Architecture

```
Scheduler (persistent-process, self-rescheduling per job)
   ↓
Job (refreshNews / refreshAnalystData / refreshEarnings /
     refreshPortfolioState / evaluateAlerts)
   ↓
AlertEngine.evaluateForUser(userId)
   ↓
Detector (one per AlertCategory) — reads NewsDataSource / AnalystDataSource /
   EarningsDataSource / CatalystDataSource / RiskDataSource / IbkrConnectionManager
   — never a vendor directly
   ↓
raise() — cooldown/dedup against existing Alert rows (§4)
   ↓
Alert (Postgres) ──→ NotificationProvider.notify() (§6.8-equivalent, in-app)
   ↓
AlertService (read/write API for routes + AI tools)
```

- **`Scheduler`** (`apps/api/src/integrations/scheduler/scheduler.ts`) — a
  persistent-process scheduler (this app is a long-running Node process,
  not serverless, per `ARCHITECTURE.md` §2), not `setInterval`: each job
  self-reschedules via `setTimeout` after it finishes, so a failing job's
  own interval can back off (§5) without affecting any other job's
  schedule. Every run is logged via `SystemEventLogger` (§9) and wrapped
  in try/catch — one job's failure never stops the others.
- **`buildJobs()`** (`jobs.ts`) — the five jobs (§3), each a thin wrapper
  around existing Phase 2-5 services. None of them talk to a vendor
  directly; they call `NewsService`/`AnalystService`/`EarningsService`
  (which already own their own caching) or write `PortfolioSnapshot` rows
  via the existing `IbkrPortfolioDataSource`.
- **`AlertEngine`** (`alerts/alert-engine.ts`) — deterministic detection
  only. Always-on detectors (`DATA_CONNECTION_FAILURE`,
  `IBKR_CONNECTION_STATUS`) run for every user every cycle; the other 12
  categories are rule-gated — they only run when the user has created an
  enabled `AlertRule` for that category (§4).
- **`AlertService`** (`alerts/alert-service.ts`) — the read/write side:
  queries (`getActiveAlerts`/`getRecentAlerts`/`getAlertHistory`),
  read-state mutation, and `AlertRule` CRUD. Never runs a detector itself.
- **`NotificationProvider`** (§8).

## 3. Jobs and refresh intervals

| Job | Interval | What it does |
|---|---|---|
| `refreshPortfolioState` | 15 min | For every user with an `AUTHENTICATED` IBKR connection, fetches positions + account summary and writes a `PortfolioSnapshot`/`PositionSnapshot` row (`source: "scheduler"`). This is what eventually makes `exposure_change_7d`/`concentration_change_7d` (`docs/RISK_AND_CATALYSTS.md` §3) computable. |
| `refreshNews` | 10 min | Refreshes general market news once, plus company news for the union of every authenticated user's held symbols (batched — one call per symbol, not per user, per §11's "batch where possible"). |
| `refreshAnalystData` | 60 min | Refreshes analyst estimate + revisions for the same held-symbol union. |
| `refreshEarnings` | 360 min (6h) | Refreshes the earnings calendar for the same held-symbol union. |
| `evaluateAlerts` | 15 min | Runs `AlertEngine.evaluateForUser` for every authenticated user. |

Intervals were chosen conservatively (§11's "not unnecessarily
aggressive"): they're longer than or equal to each underlying service's
own cache TTL (`NewsService` 10 min, `AnalystService`/`EarningsService` 60
min/6h — `docs/NEWS_INTEGRATION.md` §8,
`docs/RISK_AND_CATALYSTS.md` §1), so a scheduled refresh essentially never
finds a still-warm cache and wastes a vendor call. All five intervals are
plain constants in `jobs.ts` — changing one is a one-line edit, not a
config system this app's scale needs yet.

## 4. Alert types, cooldown, and deduplication

14 categories (`AlertCategory`, `packages/shared/src/alerts.ts` /
`prisma/schema.prisma`), each backed by a detector in
`apps/api/src/integrations/alerts/detectors.ts`:

| Category | Detector logic |
|---|---|
| `PRICE_MOVEMENT` | `abs(position.dailyChangePercent) >= threshold` (default 5%) |
| `PNL_CHANGE` | `abs(dailyPnl / netLiquidation * 100) >= threshold` (default 3%) |
| `HIGH_RELEVANCE_NEWS` | A medium/high-relevance portfolio news item published in the last 24h |
| `EARNINGS_APPROACHING` | An unreported earnings date within `threshold` days (default 3) |
| `EARNINGS_RELEASED` | An earnings entry that became `actual` within the last 2 days |
| `ANALYST_TARGET_REVISION` | Any analyst revision in the last 24h |
| `ANALYST_RATING_CHANGE` | Same, filtered to `action` = up/down (an actual tier change, not a reiterate) |
| `MAJOR_CATALYST` | A high-relevance portfolio catalyst (`docs/RISK_AND_CATALYSTS.md` §2) |
| `CONCENTRATION_CHANGE` / `EXPOSURE_CHANGE` | `abs(concentration_change_7d / exposure_change_7d)` risk metric `>= threshold` (default 10pp) — silently skipped if that metric is unavailable (insufficient snapshot history), never treated as zero |
| `MARGIN_LIQUIDITY_THRESHOLD` | `margin_utilization risk metric >= threshold` (default 50%) |
| `STALE_DATA` | Portfolio news `LiveData` status is `cached` and older than `threshold` minutes (default 60) |
| `DATA_CONNECTION_FAILURE` | IBKR gateway configured but unreachable (always-on) |
| `IBKR_CONNECTION_STATUS` | IBKR gateway reachable but not authenticated (always-on) |

**Cooldown/dedup** lives entirely in `AlertEngine`'s private `raise()`
method, one mechanism for every category:

- Every raised alert carries a `dedupeKey` — either `"{CATEGORY}:{symbol
  or portfolio}"` for threshold-style conditions (e.g.
  `PRICE_MOVEMENT:WDC`) or `"{CATEGORY}:{entityId}"` for event-style ones
  (e.g. `HIGH_RELEVANCE_NEWS:<articleId>`), so a specific news
  article/earnings entry/revision can never double-alert by construction.
- On each detection, `raise()` looks up an existing `Alert` with the same
  `(userId, dedupeKey)`.
  - None found → creates a new row (`firstDetectedAt = lastDetectedAt =
    now`, `readState: NEW`) and notifies.
  - Found, within the rule's `cooldownMinutes` → updates only
    `lastDetectedAt`; **does not** create a row or notify again (a
    `SystemEvent` logs the suppression, §9).
  - Found, cooldown expired → updates the existing row in place
    (`lastDetectedAt = now`, `readState` reset to `NEW`) and notifies
    again — a genuine re-trigger, not spam.

`alert-engine.test.ts` exercises all three branches directly against a
real Postgres instance.

## 5. User configuration

`AlertRule` (Prisma model) — `category`, optional `symbol` (null =
portfolio-wide), `enabled`, `threshold`, `severity`, `cooldownMinutes`,
`notifyInApp`. Defaults are conservative: `cooldownMinutes` defaults to 60
(1440 for event-style categories, since a specific news article/earnings
date/revision should essentially never re-fire), and every threshold has a
sane fallback (§4's table) so an enabled rule with no explicit threshold
still behaves reasonably. CRUD is exposed at `/api/v1/alert-rules` (§10)
and is entirely user-owned — see `alert-service.test.ts` for the
cross-user isolation guarantee (one user can never read, edit, or delete
another user's rule).

The two always-on categories (`DATA_CONNECTION_FAILURE`,
`IBKR_CONNECTION_STATUS`) don't require a rule at all — they're core
connectivity signals every user gets by default, consistent with "Defaults
should be conservative" while still surfacing what actually matters
without setup.

## 6. What actually runs in this sandbox

This environment has no IBKR gateway, no `FINNHUB_API_KEY`, no OpenAI key.
Every job above still runs on its real schedule (the scheduler starts
unconditionally in `plugins/context.ts`), but:

- `authenticatedUserIds()` (`jobs.ts`) queries for `IBKRConnection.status
  = AUTHENTICATED` rows — there are none, so `refreshPortfolioState` and
  `evaluateAlerts` iterate zero users and make zero calls.
- `refreshNews`/`refreshAnalystData`/`refreshEarnings` still call their
  respective services once (for general market news) or over an empty
  symbol set — the underlying `*Service.getStatus()` honestly reports
  `not_configured` (no key), so no HTTP request is actually made.

This is the same honesty pattern every prior phase used for "the
architecture is real, the credential isn't" — never simulate a background
refresh happening, never fabricate an alert. `jobs.test.ts` verifies the
zero-authenticated-users no-op path directly.

## 7. Alert engine vs. AI

Detection is 100% deterministic — no LLM call exists anywhere in
`AlertEngine` or its detectors (§7's own requirement: "no LLM call for
every polling cycle"). Portfolio AI can *read* what the engine already
decided (§10's tools) and explain it in conversation, but it cannot create
an alert, and (per the system prompt) it's explicitly told it cannot
create, edit, or delete an `AlertRule` either — no tool exists for that,
so this isn't just a prompt instruction, it's architecturally impossible
for the model to do.

## 8. Notification architecture

```
NotificationProvider (interface)
      ↓
InAppNotificationProvider  (implemented)
      future Email/PushNotificationProvider (not built)
```

The `Alert` row `raise()` writes is itself the in-app notification — the
Updates page and `getActiveAlerts`/`getRecentAlerts` read it directly, no
separate "inbox" table. `InAppNotificationProvider.notify()`
(`alerts/in-app-notification-provider.ts`) therefore has a real,
verifiable side effect (a `SystemEvent` audit entry) rather than being a
decorative no-op — it's the hook a future channel (email, push) would
extend from, not a placeholder pretending to "send" something today.
**No email or push channel is implemented** — do not represent this app as
capable of external notifications.

## 9. Observability

Every scheduler and alert-engine action writes a `SystemEvent`
(`component`, `level`, `message`, `metadata` — reusing the Phase 1 schema,
previously unused) via `SystemEventLogger`:

- `scheduler`: `job started: <name>`, `job completed: <name>`, `job
  failed: <name>` (with the error message in `metadata`).
- `alerts`: `alert generated: <dedupeKey>`, `alert re-triggered:
  <dedupeKey>`, `alert suppressed by cooldown: <dedupeKey>`, and (from
  `InAppNotificationProvider`) `alert delivered in-app: <title>`.

No secret ever appears in a `SystemEvent` — only structured, non-sensitive
metadata (job name, error message text, alert id/category/severity).

## 10. API endpoints and AI tools

All under `/api/v1`, all requiring auth
(`apps/api/src/routes/{alerts,monitoring}.ts`):

| Method | Path | Purpose |
|---|---|---|
| GET | `/alerts/active` | Currently `TRIGGERED` alerts. |
| GET | `/alerts/recent` | Most recently detected/updated alerts, any state. |
| GET | `/alerts/history` | Full alert history. |
| PATCH | `/alerts/:id` | Set `readState` to `read` or `acknowledged` (the latter also dismisses it). |
| GET/POST | `/alert-rules` | List / create the user's rules. |
| PATCH/DELETE | `/alert-rules/:id` | Update / delete one rule (owner-only, 404 otherwise). |
| GET | `/monitoring/status` | The scheduler's real state — see §12. |

AI tools (`getActiveAlerts`, `getRecentAlerts`, `getAlertHistory`,
`getMonitoringStatus`) call `AlertService`/`Scheduler` directly, following
the same pattern as every other Phase 3-5 tool.

## 11. Security

Same pattern as every prior phase: every route requires an authenticated
session, and every alert/rule query and mutation is scoped to
`request.user.id` — `alert-service.test.ts` and `test/alerts.test.ts`
verify cross-user isolation directly (a PATCH/DELETE on another user's
rule/alert 404s rather than leaking existence). No secret is ever written
into an `Alert`'s `condition`/`explanation` field — those hold only
threshold/actual-value pairs and human-readable text derived from
already-public application data.

## 12. Monitoring status honesty

`GET /monitoring/status` / `getMonitoringStatus` return exactly what the
scheduler has actually done — `schedulerRunning`, and per job:
`intervalMinutes`, `lastRunAt`, `lastSuccessAt`, `lastError`. There is no
"monitoring: active" flag independent of this real state; §6 documents
what these fields actually read as when no credentials are configured.

## 13. Known limitations

- No email/push notification channel (§8).
- No per-rule notification-frequency digest (e.g. "daily summary") — every
  triggered alert is delivered (subject to cooldown) as it happens.
- `CONCENTRATION_CHANGE`/`EXPOSURE_CHANGE` detectors depend on
  `refreshPortfolioState` having accumulated ~1 week of snapshots; in a
  fresh deployment they simply don't fire until then (§4, §6 of
  `docs/RISK_AND_CATALYSTS.md`).
- The scheduler is single-process, in-memory (job status/backoff state
  isn't persisted across a restart) — acceptable at this app's scale
  (`SystemEvent` still gives a durable audit trail); a multi-instance
  deployment would need a distributed lock, which is Phase 7 territory
  (production hardening), not this phase's.
- No manual "run this job now" endpoint exists yet — `Scheduler.runAllOnce()`
  exists and is used by tests, but isn't wired to a route.
