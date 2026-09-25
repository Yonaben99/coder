import { build } from "esbuild";

// Production build: bundles this app together with the internal @pcc/*
// workspace packages into one dist/index.js.
//
// Why bundling (not plain `tsc`, which only type-checks/transpiles one
// file at a time): every @pcc/* package.json declares `main`/`types` as
// its TypeScript *source* (src/index.ts), by design, so tsx (dev) and
// vitest (tests) resolve straight to live source with no build step.
// `tsc -p tsconfig.json` compiles apps/api's own source fine, but the
// compiled dist/index.js still `import`s the bare specifier "@pcc/config"
// etc., and at runtime plain Node resolves that through node_modules back
// to `main: "src/index.ts"` — a .ts file Node cannot execute. That only
// surfaces when you actually run `node dist/index.js` in production
// (discovered during Phase 7 production-readiness validation — dev/test
// never exercise this path). Bundling in the @pcc/* packages' source
// (while leaving every real npm dependency external, resolved normally
// from node_modules at runtime) sidesteps the whole problem without
// touching how dev or tests resolve those packages.
await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: true,
  logLevel: "info",
  // Real npm dependencies stay external — resolved from node_modules at
  // runtime as normal. Only @pcc/config, @pcc/shared, and @pcc/db (the
  // "prisma" workspace package) are left unmarked so esbuild bundles their
  // source directly into dist/index.js. @prisma/client is external despite
  // being a transitive (not direct) dependency here: it ships generated,
  // platform-specific native query-engine binaries that must not be
  // bundled.
  external: [
    "fastify",
    "fastify-plugin",
    "@fastify/cookie",
    "@fastify/cors",
    "@fastify/helmet",
    "@fastify/rate-limit",
    "@node-rs/argon2",
    "openai",
    "pino",
    "pino-pretty",
    "zod",
    "@prisma/client",
  ],
});
