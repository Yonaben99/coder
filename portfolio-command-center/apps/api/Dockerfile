# Portfolio Command Center — API (Fastify) production image.
#
# This app lives in a SUBDIRECTORY of the actual repository
# (github.com/Yonaben99/coder), at `portfolio-command-center/`. Railway
# (and most CI Docker builders) set the build context to the REPOSITORY
# ROOT even when the Dockerfile itself lives deeper in the tree — pointing
# a platform at a "Dockerfile path" does not by itself change the context
# to that subdirectory. Every COPY source path below is therefore prefixed
# with `portfolio-command-center/`, and Dockerfile.dockerignore (next to
# this file) keeps the build context scoped to just this app rather than
# the whole outer monorepo — see that file's own comment for why a plain
# root `.dockerignore` doesn't work here.
#
# Build from the REPOSITORY ROOT (the outer `coder` checkout):
#   docker build -f portfolio-command-center/apps/api/Dockerfile -t pcc-api .
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
COPY portfolio-command-center/pnpm-workspace.yaml portfolio-command-center/pnpm-lock.yaml portfolio-command-center/package.json ./
COPY portfolio-command-center/apps/api/package.json apps/api/package.json
COPY portfolio-command-center/apps/web/package.json apps/web/package.json
COPY portfolio-command-center/packages/config/package.json packages/config/package.json
COPY portfolio-command-center/packages/shared/package.json packages/shared/package.json
COPY portfolio-command-center/prisma/package.json prisma/package.json
COPY portfolio-command-center/prisma/schema.prisma prisma/schema.prisma
RUN pnpm install --frozen-lockfile

FROM deps AS build
WORKDIR /repo
COPY portfolio-command-center/ .
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

# Both node_modules directories, at the SAME relative depth they had in
# the build stage (/repo -> /app, /repo/apps/api -> /app/apps/api) — this
# is not optional. pnpm's workspace install does not hoist a package's own
# direct dependencies to the workspace-root node_modules; it only puts the
# real, resolvable entry-point symlinks (fastify, @prisma/client, zod,
# pino, @node-rs/argon2, the @fastify/* plugins, ...) in apps/api/node_modules,
# pointing relatively into the shared .pnpm store that lives under the
# root node_modules. An earlier version of this file copied only the root
# node_modules, which holds that shared store plus only the ROOT
# package.json's own (dev) dependencies — none of apps/api's actual
# runtime dependencies. The container built and deployed but crashed
# immediately with `ERR_MODULE_NOT_FOUND: Cannot find package
# '@prisma/client'`, because Node's resolution from dist/index.js could
# never find a node_modules/@prisma/client entry point at all. Copying
# apps/api/node_modules at its original relative depth keeps every one of
# its relative symlinks (e.g. `apps/api/node_modules/@prisma/client ->
# ../../../node_modules/.pnpm/@prisma+client@.../node_modules/@prisma/client`)
# resolving to the correct place. No packages/, no prisma/ source, no
# apps/web — everything internal is already inlined into dist/index.js.
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build /repo/apps/api/dist ./apps/api/dist

RUN groupadd --system --gid 1001 pcc && useradd --system --uid 1001 --gid pcc pcc
USER pcc

WORKDIR /app/apps/api
EXPOSE 4000

# Liveness probe the platform can use directly (see docs/DEPLOYMENT.md
# "Health and readiness") — falls back gracefully if curl/wget aren't
# present by using Node itself, so this works on the slim base image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
