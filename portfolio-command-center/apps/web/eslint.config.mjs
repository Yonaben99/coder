// @ts-check
import reactHooks from "eslint-plugin-react-hooks";
import rootConfig from "../../eslint.config.mjs";

export default [
  ...rootConfig,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      // Only the long-established, correctness-critical rules. The rest of
      // v7's "recommended" set targets React Compiler compatibility (e.g.
      // set-state-in-effect, purity, immutability) and flags ordinary,
      // idiomatic data-fetching-hook patterns we intentionally use here.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
