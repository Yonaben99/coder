import { config } from "dotenv";
import { resolve } from "node:path";

// Load local dev environment variables for tests (never committed — see .gitignore).
config({ path: resolve(import.meta.dirname, "../../../.env") });

process.env.NODE_ENV = "test";
process.env.SESSION_SECRET ??= "test-session-secret-please-override-in-dot-env";
process.env.APP_BASE_URL ??= "http://localhost:3000";
