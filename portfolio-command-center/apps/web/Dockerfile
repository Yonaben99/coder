# Portfolio Command Center — Web (Next.js) production image.
#
# Build from the MONOREPO ROOT so the pnpm workspace resolves correctly:
#   docker build -f apps/web/Dockerfile -t pcc-web .
#
# Uses Next.js's `output: "standalone"` trace (see next.config.ts) so the
# runtime image needs no node_modules install of its own.

FROM node:20-bookworm-slim AS base
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
# NEXT_PUBLIC_API_BASE_URL is baked into the client bundle at build time,
# not read at container start — pass it with --build-arg pointing at the
# backend's real public URL. See docs/DEPLOYMENT.md.
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
RUN pnpm --filter @pcc/shared build
RUN pnpm --filter @pcc/web build
# The standalone trace only copies static assets/public into
# .next/standalone when told to — do it explicitly (Next.js docs, "output").
RUN cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static
RUN if [ -d apps/web/public ]; then cp -r apps/web/public apps/web/.next/standalone/apps/web/public; fi

# --- Runtime image ---
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /repo/apps/web/.next/standalone ./

RUN groupadd --system --gid 1001 pcc && useradd --system --uid 1001 --gid pcc pcc
USER pcc

WORKDIR /app/apps/web
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
