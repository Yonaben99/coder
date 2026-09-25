import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@pcc/shared"],
  // Produces a self-contained .next/standalone server (node_modules pruned
  // to only what's actually needed at runtime) — see apps/web/Dockerfile
  // and docs/DEPLOYMENT.md. No effect on `next dev`.
  output: "standalone",
  // Next's file-tracer roots itself at this project directory by default,
  // so a monorepo dependency living outside it (../../packages/shared)
  // silently gets left out of .next/standalone — confirmed by building
  // standalone output and finding no @pcc/shared anywhere under it. Widen
  // the trace root to the monorepo root so the workspace package is
  // actually included. See the Next.js "output" config docs, "Caveats".
  outputFileTracingRoot: path.join(__dirname, "../../"),
  async headers() {
    return [
      {
        // Applies to every route. This app has no auth-bypass surface that
        // relies on framing, and it holds financial data, so deny framing
        // outright rather than relying on CSP frame-ancestors alone.
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
