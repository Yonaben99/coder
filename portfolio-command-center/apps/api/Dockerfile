# Portfolio Command Center — API (Fastify) production image.
#
# Build from the MONOREPO ROOT so the pnpm workspace resolves correctly:
#   docker build -f apps/api/Dockerfile -t pcc-api .
#
# This is a persistent long-running process (not serverless) by design —
# it hosts the Phase 6 Scheduler and, later, the IBKR Client Portal Gateway
# session. See docs/DEPLOYMENT.md.

FROM node:20-bookworm-slim AS base
# Prisma's query engine and @node-rs/argon2's native binding both need
# OpenSSL at runtime; bookworm-slim doesn't include it by default.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable

FROM base AS deps
WORKDIR /repo
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY prisma/package.json prisma/package.json
COPY prisma/schema.prisma prisma/schema.prisma
RUN pnpm install --frozen-lockfile

FROM deps AS build
WORKDIR /repo
COPY . .
RUN pnpm --filter @pcc/db prisma:generate
# Bundles apps/api/src together with @pcc/config, @pcc/shared, and @pcc/db's
# source into one dist/index.js (see apps/api/build.mjs for why: those
# packages resolve to their TypeScript source by design, which a plain
# `node dist/index.js` can't execute). Real npm dependencies (fastify,
# @prisma/client, etc.) stay external, resolved from node_modules below.
RUN pnpm --filter @pcc/api build

# --- Runtime image ---
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Only node_modules (for the external runtime deps the bundle still
# imports — fastify, @prisma/client + its generated query engine, etc.)
# and the bundle itself. No packages/, no prisma/ source, no apps/web —
# everything internal is already inlined into dist/index.js.
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/api/package.json ./package.json
COPY --from=build /repo/apps/api/dist ./dist

RUN groupadd --system --gid 1001 pcc && useradd --system --uid 1001 --gid pcc pcc
USER pcc

EXPOSE 4000

# Liveness probe the platform can use directly (see docs/DEPLOYMENT.md
# "Health and readiness") — falls back gracefully if curl/wget aren't
# present by using Node itself, so this works on the slim base image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
