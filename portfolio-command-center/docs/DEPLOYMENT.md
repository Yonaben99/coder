# Deployment — Portfolio Command Center

Phase 7 scope: make the application deployable, secure, persistent, and
reachable over HTTPS — **before** IBKR, OpenAI, or Finnhub credentials are
connected. Every section below assumes those three stay unset at first
deploy; the app is designed to run correctly that way (see "External
integrations" at the end).

Not in scope here: trading/order execution (Phase 7 of the original plan,
explicitly deferred), and anything that requires credentials this sandbox
doesn't have (a real hosting account, a real domain, a real Postgres
instance reachable from here). Where that's the blocker, this document
gives exact commands instead of a "deployment succeeded" claim nobody could
verify.

## 1. Architecture

```
Browser / iPhone Safari
        │  HTTPS
        ▼
apps/web (Next.js, standalone output)  ── persistent process
        │  HTTPS, fetch() with credentials: "include"
        ▼
apps/api (Fastify)                     ── persistent process
        │                                  hosts the Phase 6 Scheduler;
        │                                  later, the IBKR Client Portal
        │                                  Gateway session lives alongside
        │                                  or reachable from this process
        ▼
PostgreSQL (managed or self-hosted)
        │
        ▼
IBKR Client Portal Gateway / Finnhub / OpenAI  (configured later)
```

Both apps/api and apps/web are **persistent long-running server processes**,
not serverless functions. This is a hard requirement, not a preference:

- apps/api hosts the Phase 6 `Scheduler`, which self-reschedules jobs with
  `setTimeout` inside the running process (`apps/api/src/integrations/scheduler/scheduler.ts`).
  A serverless platform that spins the process down between requests would
  silently stop all scheduled jobs (news/market/portfolio refresh, alert
  evaluation) — there is no external cron calling back in.
- The (not-yet-connected) IBKR Client Portal Gateway needs a long-lived,
  cookie-based browser session per `docs/IBKR_INTEGRATION.md` — that only
  works next to a process that stays up.

Any hosting choice below is rejected if it can't guarantee that.

## 2. Hosting provider evaluation

Evaluated against: persistent-process support, managed Postgres, secrets
management, automatic HTTPS, a simple deploy workflow, visible logs,
predictable restart behavior, backups, and cost. Not evaluated: raw
performance — this is a single-user (or small-N-user) personal app.

| Provider                                                        | Persistent process                                                                                                                  | Managed Postgres                                      | Secrets                                                                 | HTTPS                                                    | Deploy                                                                                  | Backups                                                                                                  | Est. cost/mo                                                   |
|-----------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------|-------------------------------------------------------------------------|----------------------------------------------------------|-----------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------|----------------------------------------------------------------|
| **Railway** (recommended)                                       | Yes — containers stay running, no cold-start sleep on paid usage                                                                    | Yes, one click, own volume                            | Env var UI, per-service                                                 | Automatic on `*.up.railway.app`, custom domain supported | `git push` or Dockerfile build from this repo                                           | Automatic daily snapshots on the Postgres plugin (see their docs for retention)                          | ~$5-10 (usage-based Hobby) + a few $ for Postgres storage      |
| **Fly.io**                                                      | Yes — Fly Machines are real persistent VMs; best fit if the IBKR gateway is later colocated as a second process/machine             | Yes (Fly Postgres) or bring your own (Neon, Supabase) | `fly secrets set`, per-app                                              | Automatic via Fly's edge proxy                           | `fly deploy` from the Dockerfiles in this repo                                          | Fly Postgres supports scheduled volume snapshots; manual `pg_dump` also easy since you have shell access | ~$5-15 (smallest shared-cpu machine + a small Postgres volume) |
| **Render**                                                      | Yes for a paid Web Service; the *free* tier sleeps after inactivity, which breaks the scheduler — do not use free tier for apps/api | Yes, managed                                          | Env var UI, per-service                                                 | Automatic                                                | Connects to this GitHub repo, builds from `apps/api/Dockerfile` / `apps/web/Dockerfile` | Managed Postgres includes automated daily backups on paid plans                                          | ~$7 (Starter Web Service) × 2 services + ~$7 (Postgres) ≈ $21  |
| Self-hosted VPS + `docker-compose.prod.yml` (this repo has one) | Yes — you control it entirely                                                                                                       | You run Postgres yourself (the compose file included) | A `.env.production` file on the box, or the VPS provider's secret store | Manual — put Caddy or nginx+certbot in front             | `docker compose up -d --build` over SSH                                                 | Entirely your responsibility — cron a `pg_dump` (see §7)                                                 | ~$5-6 (smallest Hetzner/DigitalOcean droplet)                  |

**Recommendation: Railway** for the first deploy. It's the least
operational overhead for a persistent Fastify + Postgres + Next.js stack,
has no free-tier sleep problem to trip over, and its pricing is
usage-based so an idle personal app costs close to the low end of that
range. **Fly.io** is the documented fallback if/when the IBKR Client
Portal Gateway needs to run as a genuinely long-lived colocated process
with more infrastructure control than Railway exposes. The
`docker-compose.prod.yml` in this repo works unmodified on either a VPS or
as a local reproduction of the production topology — it is not tied to
one provider.

This sandbox has no credentials for any of these providers (confirmed: no
Railway/Fly/Render tokens in the environment — only proxy-injected AWS
placeholders unrelated to this app). Nothing above was actually deployed
from here; §11 below gives the exact commands to run instead.

## 3. Environment separation

Three environments, never sharing secrets:

- **development** — `apps/api/.env` (gitignored), local Postgres, `NODE_ENV=development`. Relaxed config validation (see §4).
- **test** — `NODE_ENV=test`, same local Postgres (tests use unique emails/symbols per run, not a separate DB — see `.claude/docs/TESTING.md`-equivalent pattern already established in every Phase 1-6 test file).
- **production** — `NODE_ENV=production`, a real managed Postgres, real secrets from the hosting provider's secret store. **Never** the dev `.env` values, ever, even temporarily.

`.env.production.example` in the repo root documents every variable
production needs, with instructions, not values. Copy it, fill it with
real generated secrets, and hand those to your hosting provider's
env/secrets UI — never commit the filled-in file (`.gitignore` already
excludes `.env*` except the two `.example` files).

### Config validation is environment-aware

`apps/api/src/config.ts`'s zod schema enforces two rules **only** when
`NODE_ENV=production` (added in Phase 7, covered by `apps/api/src/config.test.ts`):

- `SESSION_SECRET` must be at least 32 characters (dev/test only require 16, for low-friction local setup).
- `APP_BASE_URL` must start with `https://` (cookies are `Secure`-flagged and silently won't be sent over plain HTTP otherwise).

The app refuses to start in production with either violated — a fast,
loud failure at boot instead of a subtle runtime bug.

## 4. Secrets

- All secrets are server-side environment variables, read once in
  `apps/api/src/config.ts`. `apps/web` has exactly one env var,
  `NEXT_PUBLIC_API_BASE_URL`, and it is **not** a secret — it's the
  backend's own public URL, baked into the client bundle at build time
  (see §9).
- `git grep` across the repo (done as part of this phase's audit) found no
  committed `.env`, no hardcoded API keys, and no fake financial data
  outside test fixtures — see SECURITY.md §1 for the full secrets policy.
- Generate `SESSION_SECRET` with `openssl rand -base64 48`. Generate a
  distinct one per environment — never reuse the dev value in production.
- `OPENAI_API_KEY` and `FINNHUB_API_KEY` are deliberately left **unset**
  for the initial production deploy — see "External integrations" below.

## 5. Authentication (production review)

Reviewed as part of this phase, no changes needed to what Phase 1 already
built correctly:

- Argon2id password hashing (`@node-rs/argon2`), per-user salt.
- Sessions: random opaque ID, stored server-side (`Session` table), issued
  as an `httpOnly`, `Secure` (production only), `SameSite=Strict`, signed
  cookie with a 7-day expiry (`apps/api/src/auth/session.ts`).
- `SameSite=Strict` + a single-origin CORS allowlist (`APP_BASE_URL`,
  `credentials: true`) is this app's CSRF defense — verified in
  `docker`-free production-mode testing (§11) that these headers are
  actually present on real responses, not just configured in source.
- Every route re-derives `request.user` from the session cookie via
  `requireAuth`; nothing trusts a client-supplied user ID. Confirmed with a
  dedicated cross-user test suite added this phase (§6 below).
- Logout clears the cookie and deletes the server-side session row.

**Fixed this phase**: login/signup had no rate limiting — SECURITY.md
previously documented this as an intended rule with no code behind it yet.
`@fastify/rate-limit` is now registered globally (300 req/min per IP,
platform health checks exempted) with a stricter 10 req/min-per-IP limit
specifically on `/auth/login` and `/auth/signup`
(`apps/api/src/routes/auth.ts`) — verified with a real request against the
production bundle returning `x-ratelimit-limit: 10` (§11).

## 6. User data isolation

Re-verified explicitly this phase with a new test file,
`apps/api/test/user-isolation.test.ts`, run against a real Postgres
instance (not mocks):

- A sweep of 22 protected GET routes across every resource area
  (portfolio, connections, IBKR, AI, news, analysts, earnings, catalysts,
  risk, alerts, alert-rules, monitoring, system-health) confirming every
  one rejects an unauthenticated request with 401.
- Two real signed-up users, confirming `/alerts/active`, `/alerts/recent`,
  and `/alerts/history` never leak one user's `Alert` rows to the other.
- The same for `/ai/conversations` listing.
- A direct service-level check that historical risk metrics
  (`computeHistoricalRiskMetrics`) only ever read the requesting user's own
  `PortfolioSnapshot` rows — a second user with no snapshots of their own
  gets an honest "unavailable", never another user's numbers.

This is in addition to the isolation tests each feature already carried
from Phases 4-6 (`test/alerts.test.ts`, `test/ai-conversations.test.ts`,
`src/integrations/alerts/alert-service.test.ts`). Every route handler
threads `request.user!.id` into its service call, and every service method
that mutates or reads a specific row does an ownership check
(`findFirst({ id, userId })`) before acting — verified by source review of
every route file, not just the tests above.

## 7. Database

### Migrations

Production uses `prisma migrate deploy` (non-interactive, applies pending
migrations, never generates new ones and never prompts) — **not**
`prisma migrate dev`, which is dev-only and can reset data:

```bash
# From a machine/container with DATABASE_URL pointing at production:
pnpm --filter @pcc/db prisma:migrate:deploy
```

Run this once after provisioning the database and again after every
deploy that includes a new migration under `prisma/migrations/`. It does
not touch existing data outside the migration's own DDL.

### Connections, indexes, constraints

Already in place from Phases 1-6, reviewed (not changed) this phase:

- Every per-user table (`Session`, `IBKRConnection`, `PortfolioSnapshot`,
  `AlertRule`, `Alert`, `AIConversation`, `OrderSnapshot`, `AuditLog`) has
  a `userId` foreign key with `onDelete: Cascade` and an index on
  `userId` (often composite, e.g. `[userId, status]`) — see
  `prisma/schema.prisma`.
- Prisma's connection pool is managed per-process; a single `apps/api`
  instance is the intended topology (the Scheduler assumes it's the only
  writer running jobs — running multiple API replicas would double-run
  scheduled jobs, since there's no distributed lock. Stick to one instance
  unless that's built out first).
- Transactional work stays on the transaction handle (`prisma.$transaction`
  call sites) rather than mixing in a second client — unchanged from
  Phase 1's guardrail.

### Backups and restore

This phase documents the strategy; it does not claim backups are already
running anywhere, because no production database exists yet.

- **On Railway/Render/a managed Fly Postgres**: enable the provider's
  built-in automated daily backup (each has one on paid plans — see the
  provider's own dashboard, "Backups" tab). Verify the retention window
  matches your risk tolerance (typically 7 days on the smallest plans);
  upgrade if you need longer.
- **Self-hosted** (VPS + `docker-compose.prod.yml`): cron a nightly
  `pg_dump` to off-box storage:
  ```bash
  docker compose -f docker-compose.prod.yml exec -T db \
    pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "pcc-$(date +%F).sql.gz"
  # then copy pcc-*.sql.gz off the host (rsync/rclone/S3) — a backup that
  # lives only on the same disk as the database it backs up isn't one.
  ```
- **Restore**:
  ```bash
  gunzip -c pcc-2026-01-01.sql.gz | \
    docker compose -f docker-compose.prod.yml exec -T db \
    psql -U "$POSTGRES_USER" "$POSTGRES_DB"
  ```
  Test this at least once against a scratch database before you need it
  for real — an untested backup is a hope, not a plan.

## 8. HTTPS / domain

- **Railway / Render / Fly**: HTTPS is automatic on the provider's
  generated subdomain (`*.up.railway.app`, `*.onrender.com`,
  `*.fly.dev`) — no certificate management needed for the first deploy.
  Attach a custom domain later through the provider's dashboard (DNS CNAME
  + they issue a cert automatically); nothing in this app's code depends
  on which domain it's on — only `APP_BASE_URL`/`NEXT_PUBLIC_API_BASE_URL`
  need updating.
- **Self-hosted VPS**: put Caddy in front of the two containers — it gets
  you automatic Let's Encrypt certificates with a ~10-line Caddyfile
  (`your-domain.example.com { reverse_proxy localhost:3000 }` and the
  equivalent for the API subdomain). Not included in this repo since it's
  provider-specific; document it in your own infra repo if you take this
  path.
- The app itself never transmits the session cookie over plain HTTP in
  production — it's `Secure`-flagged (§5), and `APP_BASE_URL` is required
  to be `https://` by the config validation in §3.

Do not block the first deploy on buying a domain — use the provider's
generated URL. Nothing about the app changes when you attach a real domain
later beyond those two env vars and a redeploy.

## 9. Frontend production build

`apps/web/next.config.ts` sets `output: "standalone"` (self-contained
server, no `node_modules` install needed at runtime) plus security headers
(`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, a restrictive
`Permissions-Policy`) applied to every route.

**Bug found and fixed this phase**: Next's file tracer roots itself at the
`apps/web` directory by default; in this monorepo, workspace dependencies
one level up (`packages/shared`) were silently excluded from the traced
`standalone` output — confirmed by building it and finding no trace of
`@pcc/shared` anywhere in the output tree. Fixed by setting
`outputFileTracingRoot` to the monorepo root (`next.config.ts`). As it
happens, every `@pcc/shared` import in `apps/web/src` today is
`import type` (erased at compile time, zero runtime footprint), so this
specific app was not actually broken by it yet — but the fix is real and
prevents a silent break the first time a page imports an actual value
(not just a type) from `@pcc/shared`.

`NEXT_PUBLIC_API_BASE_URL` is compiled into the client JS bundle at
**build time** — set it correctly before running `next build` for a real
deploy (the Dockerfile takes it as a build arg; see §11). Changing it
requires a rebuild, not just a restart.

Verified directly (§11 has the full transcript): production build +
`node .next/standalone/apps/web/server.js` serves `/`, `/login`,
`/manifest.webmanifest`, and the code-generated `/icon` correctly, with
the configured security headers present on real responses.

All 19 routes from the spec (Home, Portfolio, Position Detail, News,
Analysts, Catalysts, Risk, Targets, Updates, AI, Scan, Review, Settings,
Connections, IBKR, System Health, Login, Signup) render — confirmed by
`next build`'s route manifest and the Phase 4-6 Playwright smoke tests,
re-run this phase (see the final report's "Browser smoke test" section).
No page depends on fake data — confirmed by the repo-wide audit in §1 of
the final report.

### Listening on a platform-assigned PORT (Railway et al.)

Next's standalone `server.js` reads `process.env.PORT` at container
start (Next's own documented behavior) — this already works correctly
against whatever `PORT` a platform like Railway injects into the running
container, with no code change needed; `ENV PORT=3000` in the Dockerfile
is only the fallback default for self-hosted/local runs where nothing
injects one.

**Bug found and fixed**: the Docker `HEALTHCHECK` instruction had `3000`
hardcoded as a literal in its JS string, baked at *build* time — unlike
`process.env.PORT`, that literal doesn't adapt to whatever port the
platform actually assigns at runtime. If a platform assigns a container
any port other than 3000, Docker's own healthcheck would keep probing
the wrong port and could report the container unhealthy regardless of
whether the app itself is working fine. Fixed by having the healthcheck
script read `process.env.PORT` itself, falling back to 3000 only when
unset. Verified directly: built the image, ran it with `-e PORT=4501`
(simulating a Railway-style non-default assigned port), and confirmed
both that Next itself logs `"Local: http://localhost:4501"` (already
correct beforehand) and that `docker inspect`'s health status reports
`"healthy"` (previously would have kept probing the wrong, hardcoded
port).

## 10. Backend production build

**Bug found and fixed this phase**: `@pcc/config`, `@pcc/shared`, and
`@pcc/db` (the `prisma/` workspace package) all declare
`"main": "src/index.ts"` in their `package.json` — deliberately, so `tsx`
(dev) and `vitest` (tests) resolve straight to live TypeScript source with
no build step in between. `apps/api`'s old `build` script (`tsc -p
tsconfig.json`) compiled `apps/api/src` fine, but the emitted
`dist/index.js` still contained a bare `import ... from "@pcc/config"`,
and at runtime plain Node resolves that through `node_modules` back to
`main: "src/index.ts"` — a `.ts` file Node cannot execute. This only
surfaces when you actually run `node dist/index.js`, which no dev or test
workflow ever does (`tsx` and `vitest` both resolve differently). Running
`NODE_ENV=production node dist/index.js` directly for the first time, as
part of this phase's production-readiness validation, reproduced it
immediately: `Cannot find module '.../packages/config/src/env.js'`.

Fixed by replacing the `tsc`-only build with an esbuild bundle
(`apps/api/build.mjs`, run via `pnpm --filter @pcc/api build`) that
inlines `apps/api/src` together with the three internal `@pcc/*`
packages' source into one `dist/index.js`, while leaving every real npm
dependency (`fastify`, `@prisma/client`, `openai`, `pino`, `zod`, etc.)
external and resolved normally from `node_modules` at runtime. This
doesn't touch `tsx`/`vitest` resolution at all — dev and tests are
unaffected; only the production build path changed. `@prisma/client` was
also added as a **direct** dependency of `apps/api` (it was previously
only a transitive dependency via `@pcc/db`), because pnpm's strict,
non-hoisted `node_modules` doesn't link a phantom dependency — since the
bundle now imports it directly, it has to be declared directly.

Verified end-to-end (transcript in the final report): built the bundle,
ran `NODE_ENV=production node dist/index.js` with a real `DATABASE_URL`
against the local Postgres, and confirmed `/health` (200), `/ready` (200,
real `SELECT 1`), `/api/v1/health` (honest `not_configured` for
IBKR/OpenAI/News/Analyst), and `POST /api/v1/auth/signup` (201, correct
`Secure`/`HttpOnly`/`SameSite=Strict` cookie, correct Helmet security
headers, correct `x-ratelimit-*` headers) all work against the actual
production artifact, not just `tsc --noEmit`.

### Graceful startup / shutdown

`apps/api/src/index.ts` listens on `0.0.0.0:$PORT` and installs
`SIGINT`/`SIGTERM` handlers that call `app.close()` (drains in-flight
requests, runs every plugin's `onClose` hook — including
`IbkrConnectionManager.stop()` and `Scheduler.stop()`, so no job fires
mid-shutdown) before `prisma.$disconnect()` and a clean `process.exit(0)`.
Confirmed in the container smoke test: sending `SIGTERM` produced a
`"shutting down"` log line and a clean exit, not a hang or a crash.

### Health and readiness

Two separate endpoints, both unauthenticated and exempt from rate
limiting (`config: { rateLimit: false }`) so platform health probes are
never throttled:

- **`GET /health`** — liveness. Returns 200 the instant the process is up.
  Never touches the database or any integration — a slow/unreachable DB
  must not make an orchestrator kill and restart an otherwise-fine
  process.
- **`GET /ready`** — readiness (new this phase). Runs a real
  `SELECT 1` against Postgres; 200 `{"status":"ready"}` on success, 503
  `{"status":"not_ready","reason":"database_unreachable"}` on failure. A
  load balancer should stop routing traffic here (not restart the
  process) while this fails.
- **`GET /api/v1/health`** — the existing detailed, per-integration status
  the System Health UI page reads (IBKR, OpenAI, Market Data, News,
  Analyst & Earnings, Database, Scheduled Jobs), each with a real
  `operational` / `degraded` / `failed` / `not_configured` state, never
  hardcoded.

Point your hosting provider's health check at `/health` for
restart-on-failure and at `/ready` if it supports a separate
traffic-gating probe (Railway/Render/Fly all just use one; point it at
`/health` there, since `/ready` failing only means "DB is briefly down",
which restarting the API process would not fix).

## 11. Build context — this app lives in a subdirectory of the real repo

This matters more than it sounds like it should, and it was the cause of
a real deploy failure, so it gets its own section rather than a footnote.

`portfolio-command-center/` is a **subdirectory** of the actual GitHub
repository (`github.com/Yonaben99/coder`) — it is not the repository root.
Railway (and most CI Docker builders) set the Docker **build context** to
the real repository root regardless of where the Dockerfile itself lives;
pointing a platform at a "Dockerfile path" like
`portfolio-command-center/apps/api/Dockerfile` does not, by itself, change
the build context to that subdirectory.

**What broke, concretely:** an earlier version of both Dockerfiles wrote
every `COPY` source path relative to `portfolio-command-center/` (e.g.
`COPY prisma/schema.prisma prisma/schema.prisma`), on the assumption the
build context already started there. On Railway, with the context
actually rooted at the outer repo, that resolved to
`<repo-root>/prisma/schema.prisma` — which doesn't exist (the real file is
at `<repo-root>/portfolio-command-center/prisma/schema.prisma`) — and the
build failed with `"/prisma/schema.prisma": not found`. Every other
unprefixed `COPY` path had the same latent bug.

**The fix**, now in both Dockerfiles: every `COPY` source path is prefixed
with `portfolio-command-center/`, and the source tree copy is
`COPY portfolio-command-center/ .` instead of `COPY . .`. Destination
paths inside the image are unchanged, so nothing downstream (the esbuild
bundle, `prisma generate`, the Next.js standalone copy) needed to change.

There's a second problem this also has to route around: the outer repo
already has its own root `.dockerignore`, and it's a **deny-all
allowlist** (`**` then `!dogfood/**` only) tuned for that repo's own image
builds — completely unrelated to this app, and not something to edit or
depend on. If the build context is the repo root, that file would exclude
`portfolio-command-center/` entirely regardless of path prefixing. Fixed
with a **Dockerfile-specific ignore file** — `apps/api/Dockerfile.dockerignore`
and `apps/web/Dockerfile.dockerignore`, one next to each Dockerfile. Per
BuildKit's own convention, a file named `<dockerfile-name>.dockerignore`
in the same directory as the Dockerfile takes priority over the
context-root `.dockerignore`, with no changes to that shared file. Each
one denies everything, re-allows `portfolio-command-center/**`, then
re-denies that app's own build artifacts (`node_modules`, `.next`,
`dist`, etc.) so the context stays small.

**Build commands now assume the repository root as context:**

```bash
# from the OUTER repo root (one level up from portfolio-command-center/)
docker build -f portfolio-command-center/apps/api/Dockerfile -t pcc-api .
docker build -f portfolio-command-center/apps/web/Dockerfile -t pcc-web .
```

### Verified in this sandbox

No hosting-provider credentials exist here (checked: no Railway/Fly/Render
tokens in the environment). What **was** verified directly, with real
output, using this sandbox's own Docker daemon:

1. `docker build -f portfolio-command-center/apps/api/Dockerfile -t pcc-api .`
   run from the outer repo root — build context transferred at **1.04MB**
   (confirms `Dockerfile.dockerignore` correctly scopes the context to
   just this app, not the whole outer monorepo), and **every `COPY` step
   succeeded**, including the exact one that previously failed:
   `COPY portfolio-command-center/prisma/schema.prisma prisma/schema.prisma` → `DONE 0.0s`.
   The build then hit `apt-get update` against `deb.debian.org`, which
   this sandbox's egress proxy returns `403 Forbidden` for (confirmed with
   a direct `curl` to the same host, both `http://` and `https://` — not
   specific to Docker). That is a sandbox-only network policy; Railway's
   real build infrastructure has normal internet access.
2. To verify past that sandbox-specific wall, a scratch copy of the same
   Dockerfile with only the `apt-get` line removed (never committed) was
   built the same way: **all 8 `COPY` layers succeeded** for both
   `apps/api/Dockerfile` and `apps/web/Dockerfile`, then both hit a
   *second*, different sandbox-only wall — `pnpm install` triggers
   corepack to fetch pnpm from `registry.npmjs.org`, which fails here with
   `SELF_SIGNED_CERT_IN_CHAIN` (this sandbox's egress proxy TLS-intercepts
   and its CA isn't trusted inside the build container). Again, not a
   Railway concern — this is purely about this local sandbox's proxy
   setup, and it occurred identically for both Dockerfiles, immediately
   after every `COPY` layer had already succeeded.
3. Separately, `pnpm --filter @pcc/api build` (esbuild bundle) and
   `pnpm --filter @pcc/web build` (Next.js standalone) were run directly
   (outside Docker) and their outputs started cleanly and served real
   traffic — `curl http://localhost:4009/health` → `{"status":"ok",...}`,
   `/ready` → `{"status":"ready"}`, `POST /api/v1/auth/signup` → `201`
   with correct `Secure`/`HttpOnly`/`SameSite=Strict` cookie and Helmet
   headers; the web standalone server served `/`, `/login`,
   `/manifest.webmanifest`, `/icon` all `200`. These are the exact same
   commands each Dockerfile's `build` stage runs.

Combined, this covers every step each Dockerfile executes except the
final `apt-get`/registry fetch, both of which are blocked by this
sandbox's own network policy rather than anything in the Dockerfile —
Railway's build servers have ordinary outbound internet access to
`deb.debian.org` and `registry.npmjs.org`.

### To actually deploy (Railway — exact steps)

1. Create a Railway project, add a Postgres plugin (gives you a
   `DATABASE_URL` automatically).
2. Add a service from this GitHub repo. In its settings, set **Dockerfile
   Path** to `portfolio-command-center/apps/api/Dockerfile` and leave
   **Root Directory** unset (default = repository root) — the Dockerfile
   is written to expect the repository root as build context; do **not**
   set Root Directory to `portfolio-command-center`, which would make the
   `portfolio-command-center/`-prefixed `COPY` paths resolve one level too
   deep.
3. Set env vars on that service from `.env.production.example`:
   `NODE_ENV=production`, `SESSION_SECRET` (generate fresh), `APP_BASE_URL`
   (fill in after step 5 gives you the web service's URL), leave
   `OPENAI_API_KEY`/`FINNHUB_API_KEY`/`IBKR_GATEWAY_BASE_URL` empty.
   `DATABASE_URL` — link Railway's Postgres plugin variable directly.
4. After first deploy, run the migration once:
   `railway run --service api pnpm --filter @pcc/db prisma:migrate:deploy`
   (or open a shell in the deployed container and run it there).
5. Add a second service from the same repo: **Dockerfile Path** =
   `portfolio-command-center/apps/web/Dockerfile`, Root Directory again
   left unset, with build arg
   `NEXT_PUBLIC_API_BASE_URL=<the api service's Railway URL>`.
6. Go back to step 3's `api` service and set `APP_BASE_URL` to the `web`
   service's Railway URL; redeploy `api` so CORS/cookies match.
7. Visit the web service's URL, sign up, confirm System Health shows
   `database: operational`, `scheduled_jobs: operational`, and
   `ibkr`/`openai`/`news`/`analyst` all honestly `not_configured`.

### To deploy self-hosted

Run from the **outer repository root** (one level up from
`portfolio-command-center/`), matching the same build-context convention:

```bash
cp portfolio-command-center/.env.production.example portfolio-command-center/.env.production   # fill in real values
docker compose -f portfolio-command-center/docker-compose.prod.yml \
  --env-file portfolio-command-center/.env.production up -d --build
docker compose -f portfolio-command-center/docker-compose.prod.yml exec api \
  pnpm --filter @pcc/db prisma:migrate:deploy
```

`docker-compose.prod.yml`'s `build.context` is set to `..` (this same
repo-root convention) precisely so this works — see the Dockerfiles'
comments for why the context can't be `portfolio-command-center/` itself.

Put a reverse proxy with a real TLS certificate (Caddy/nginx+certbot) in
front of ports 3000 (web) and 4000 (api) — the compose file itself
publishes them on plain HTTP for simplicity; do not expose those ports
directly to the internet without TLS termination in front.

### Second deploy failure: container built and deployed, then crashed at startup

After the build-context fix above, Railway's build and deploy both
succeeded, but the `api` container crashed immediately with:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@prisma/client' imported from /app/dist/index.js
    code: 'ERR_MODULE_NOT_FOUND'
```

**Root cause:** pnpm's workspace install does not hoist a workspace
package's own direct dependencies to the workspace-root `node_modules/`.
It stores each package's actual content once, in a shared
`node_modules/.pnpm/` store at the workspace root, but the *resolvable
entry-point symlink* Node's module resolution actually looks up
(`node_modules/@prisma/client`, `node_modules/fastify`, `node_modules/zod`,
etc.) is created only inside **that package's own** `node_modules/` —
here, `apps/api/node_modules/`. Confirmed directly: the workspace root
`node_modules/@prisma` doesn't exist at all; `apps/api/node_modules/@prisma/client`
does, as a relative symlink two directories deeper into the shared store
(`apps/api/node_modules/@prisma/client -> ../../../node_modules/.pnpm/@prisma+client@.../node_modules/@prisma/client`).
The runtime stage's `COPY --from=build /repo/node_modules ./node_modules`
copied only the workspace root — which holds the shared `.pnpm` store
plus only the *root* `package.json`'s own (dev) dependencies — and never
copied `apps/api/node_modules`, so every one of `apps/api`'s actual
runtime dependencies (`@prisma/client`, `fastify`, the `@fastify/*`
plugins, `@node-rs/argon2`, `openai`, `pino`, `zod`) had no resolvable
entry point in the image at all. `@prisma/client` was simply the first
one imported in the bundle's module graph, so it was the first to fail.

This went undetected by every earlier verification in this document
because those all ran `node dist/index.js` directly from a full checkout
on disk (`apps/api/node_modules` was present there, just never copied
into the *Docker image*) — the bug only exists in what the Docker COPY
instructions actually include, which is why it needed an actual container
run, not just a local `node` run, to surface.

**Fix:** the runtime stage now also copies `apps/api/node_modules`,
preserving the same relative depth it had in the build stage
(`/repo/apps/api` → `/app/apps/api`, alongside `/repo/node_modules` →
`/app/node_modules`) so every relative symlink still resolves to the
correct place — nothing was flattened, nothing needed re-pointing.

**Verified:** rebuilt and ran the fixed image in this sandbox (using the
same apt-get-and-corepack-CA workaround described above, purely to get
past this sandbox's own network restrictions). The
`ERR_MODULE_NOT_FOUND` error is gone entirely — the log now shows
`"Server listening at http://127.0.0.1:4011"` and the process proceeds all
the way into Prisma's own native query-engine load step, which is a
*different, later* stage of startup than the one that was crashing. It
then hits `libssl.so.1.1: cannot open shared object file` — expected and
harmless: that specific scratch verification build had its `apt-get
install openssl` line deliberately removed to route around this
sandbox's blocked `deb.debian.org` mirror (see above); the real, committed
Dockerfile still installs `openssl`/`ca-certificates`, and Railway's build
servers have normal internet access to install them.

### Re-verified after a second identical report, plus a build-time guarantee

The exact same `ERR_MODULE_NOT_FOUND` was reported a second time after
this fix was already live on the branch. Re-investigated from scratch
rather than assuming the fix was wrong: a **fresh, `--no-cache` Docker
build** of the exact currently-committed `apps/api/Dockerfile` (not a
modified copy) was built and run again, using the same sandbox-only
apt/CA workaround described above. Result: identical to the first
verification — `ERR_MODULE_NOT_FOUND` does not occur; the server starts
and logs `"Server listening..."`, then proceeds into Prisma's own native
engine load (a later, different stage), which only fails here on the
sandbox-specific missing `libssl`. This is strong evidence the committed
fix is correct; the most likely explanation for seeing the identical error
a second time is a deploy that predates this fix reaching the branch, or
a stale/cached Railway build — **trigger a clean (no build cache) redeploy
and confirm the deployed commit is at or after the "copy
apps/api/node_modules into the runtime image" fix** before assuming the
code is still broken.

Also considered switching the runtime stage to pnpm's own
`pnpm deploy --legacy` (a built-in command for producing a self-contained,
non-symlinked dependency tree for one workspace package — the more
"pnpm-native" way to solve exactly this class of problem). Tested it
directly: it does produce a fully self-contained `node_modules` with no
cross-directory relative-symlink dependence, but it does **not** carry
over the already-generated Prisma Client artifact (`node_modules/.prisma/client`,
including the query-engine binary) — `prisma generate` writes that
directly into the existing install rather than it being a tracked
dependency, so `pnpm deploy` silently drops it, which would require a
second `prisma generate` run inside the deployed directory to fix. That's
a strictly bigger, riskier change than the dual-`node_modules`-copy
already in place and already proven correct, so it was not adopted.

Instead, added a genuine **build-time guarantee** rather than relying only
on documentation: the runtime stage now runs
`node -e "require.resolve('@prisma/client'); ..."` (checking every real
runtime dependency the bundle imports) immediately after the `node_modules`
copies, before the image is finalized. Verified both directions —
rebuilt with the fix present (the check passes,
`"All runtime dependencies resolve correctly."`), then rebuilt with the
`apps/api/node_modules` copy instruction deliberately removed again (the
**build itself now fails**, with a clear `MODULE_NOT_FOUND` pointing at
the exact missing package, at build time, before any deploy or container
start). This converts "the image builds and deploys fine, then crashes
the container" into "the build fails immediately, in the Railway build
log, with a clear stack trace" — the failure mode this whole incident was
about no longer has a way to reach a running container silently.

## 12. Scheduler in production

Documented behavior (see `docs/ALERTS_AND_MONITORING.md` for the full
detail — this is the production-relevant summary):

- `Scheduler.start()` is called once, in `contextPlugin`'s registration,
  and `Scheduler.stop()` runs on the Fastify `onClose` hook — so a
  container restart (deploy, crash-restart, host reboot) cleanly stops and
  restarts every job; there is no persisted "job was mid-run" state to
  corrupt, since each job run is a single bounded async function, not a
  resumable saga.
- Each of the 5 jobs (`refreshNews`, `refreshMarketData`,
  `refreshPortfolioState`, `refreshAnalystData`/`refreshEarnings`,
  `evaluateAlerts`) self-reschedules via `setTimeout`, with capped
  exponential backoff (up to 4x the base interval) on failure — a failing
  job never takes down the process or blocks the other jobs, and recovers
  its normal cadence on the next success.
- With no IBKR/Finnhub/OpenAI configured, every job safely no-ops (there
  are no authenticated users with connected providers to refresh yet) —
  confirmed by `apps/api/src/integrations/scheduler/jobs.test.ts`. This is
  not "the scheduler is broken"; it's the honest behavior the spec
  requires.
- Run exactly **one** instance of `apps/api` — the scheduler has no
  distributed lock, so a second replica would double-fire every job.

## 13. Security headers, CORS, rate limiting (what's actually enforced)

Verified against real HTTP responses in §11, not just read from source:

- **Helmet** (`@fastify/helmet`) — CSP, `Strict-Transport-Security`,
  `X-Content-Type-Options: nosniff`, `X-Frame-Options`,
  `Referrer-Policy: no-referrer`, `X-DNS-Prefetch-Control: off`, and more,
  on every API response.
- **CORS** — single-origin allowlist (`APP_BASE_URL`), `credentials: true`
  so the session cookie is sent; no wildcard origin anywhere.
- **Rate limiting** (`@fastify/rate-limit`, added this phase) — 300
  req/min/IP globally, 10 req/min/IP on `/auth/login` and
  `/auth/signup`; `/health` and `/ready` are explicitly exempt so platform
  probes are never throttled.
- **Request body size** — explicit 1 MiB `bodyLimit` on the Fastify
  instance (was implicit before; now documented and enforced).
- **`trustProxy`** — enabled only in production, since a real deploy sits
  behind the hosting provider's load balancer; rate limiting keys on the
  real client IP via `X-Forwarded-For`, not the proxy's.
- **SQL injection** — audited this phase: every database query in
  `apps/api/src` goes through Prisma's query builder or a parameterized
  tagged-template `$queryRaw`/`` `SELECT 1` ``; zero uses of
  `$queryRawUnsafe`/`$executeRawUnsafe` or string-concatenated SQL
  anywhere in the codebase.
- **XSS** — React escapes all rendered content by default; no
  `dangerouslySetInnerHTML` usage in `apps/web/src`.
- **Error disclosure** — the global error handler
  (`apps/api/src/plugins/error-handler.ts`) never leaks an internal error
  message on a 5xx response, only on 4xx (client's own bad request) —
  unchanged from Phase 1, re-verified this phase.

Nothing above is aspirational — each bullet is either a real header/status
observed in §11's transcript, or a specific file and line reviewed this
phase.

## 14. Observability

- Structured JSON logs (pino) in production, secret-redacting at the
  logger level (not left to call sites) — `apps/api/src/logger.ts`.
- `SystemEvent` rows (Phase 6) record job started/completed/failed,
  provider-unavailable, alert-generated, and alert-suppressed-by-cooldown
  events — durable, queryable, never containing a secret value.
- `SENTRY_DSN` is wired into config as an optional variable but no Sentry
  SDK integration is implemented yet — left for a real follow-up once
  there's a Sentry account to point it at; the app runs correctly without
  it (structured logs are the primary production debugging tool for now).

## 15. Image size (documented follow-up, not done this phase)

Both Dockerfiles copy the full pnpm workspace `node_modules` (including
other workspace packages' dependencies, since a single `pnpm install` at
the repo root doesn't distinguish which node_modules entries belong to
which app) into their runtime stage rather than a pruned,
per-app-only install. This is correct but not minimal — a real follow-up
would use `pnpm deploy` (pnpm's built-in workspace-package extraction
command) or a manual prune step to cut runtime image size. Not attempted
this phase because Docker Hub pulls failed in this sandbox (§11), so there
was no way to verify a prune step didn't break the image without ever
successfully building one — better to ship a correct-but-larger image than
a guessed-at-smaller one.

## 16. External integrations — intentionally not configured

`IBKR_GATEWAY_BASE_URL`, `OPENAI_API_KEY`, and `FINNHUB_API_KEY` are left
unset in `.env.production.example` on purpose. With all three unset:

- IBKR: System Health shows `not_configured`; Portfolio/Positions/Risk
  pages show an honest "not connected" state, never fabricated numbers.
- OpenAI: AI Chat reports "not connected" per message attempt; every AI
  tool returns its `unavailable` envelope rather than failing to start.
- Finnhub: News, Analysts, Catalysts, and Earnings all show
  `not_configured` states.

To connect them later, once you're ready:

1. **Finnhub** — get a free-tier key at finnhub.io, set `FINNHUB_API_KEY`
   in your hosting provider's env vars, redeploy `api`. See
   `docs/NEWS_INTEGRATION.md` §2 and `docs/RISK_AND_CATALYSTS.md` §1.
2. **OpenAI** — get an API key, set `OPENAI_API_KEY` (and optionally
   `OPENAI_MODEL` if you want a different model than the default),
   redeploy `api`. See `docs/OPENAI_INTEGRATION.md`.
3. **IBKR** — run the Client Portal Gateway somewhere the `api` service
   can reach it (same host, or a private network address), set
   `IBKR_GATEWAY_BASE_URL` to that address, redeploy `api`. The gateway
   itself still requires the user's own browser-based login (username,
   password, 2FA) — see `docs/IBKR_INTEGRATION.md` and SECURITY.md §2 for
   why that can't be automated away without a real security tradeoff
   decision.

None of these require a code change — only an environment variable and a
redeploy, by design.

## 17. Cost estimate (Railway, recommended path)

| Item                                                               | Estimate                                                                            |
|--------------------------------------------------------------------|-------------------------------------------------------------------------------------|
| Railway Hobby usage (api + web services, low personal-app traffic) | ~$5-8/mo                                                                            |
| Railway Postgres plugin (small volume)                             | ~$2-5/mo                                                                            |
| Domain (optional, not required for first deploy)                   | ~$10-15/year if you attach one                                                      |
| OpenAI API usage                                                   | **$0 until you add `OPENAI_API_KEY`** — not counted, since it's intentionally unset |
| Finnhub                                                            | **$0** — free tier covers this app's usage; not counted for the same reason         |
| **Total to get a working, honestly-`not_configured` deployment**   | **≈ $7-13/mo**                                                                      |

## Troubleshooting

- **`/ready` returns 503**: `DATABASE_URL` is wrong, Postgres isn't up
  yet, or a migration hasn't been applied (a missing table shows up as a
  connection-shaped error from Prisma too — check the migration ran).
- **App won't start, error mentions `SESSION_SECRET` or `APP_BASE_URL`**:
  you're in `NODE_ENV=production` and one of §3's two production-only
  validations failed — read the error message, it names which one.
- **Login/signup returns 429**: you've hit the 10/min rate limit (§5/§13)
  — expected behavior under repeated attempts, not a bug; wait a minute.
- **CORS errors in the browser console**: `APP_BASE_URL` on the api
  service doesn't exactly match the web service's real URL (protocol +
  host, including `www.` if present) — they must match exactly, the CORS
  config is a single-origin allowlist, not a wildcard.
- **Frontend shows API calls failing / wrong host**: `NEXT_PUBLIC_API_BASE_URL`
  was wrong at *build* time — this requires a rebuild, not just an env var
  change at runtime (see §9).
