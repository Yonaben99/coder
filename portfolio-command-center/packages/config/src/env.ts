import type { z, ZodTypeAny } from "zod";

export class EnvValidationError extends Error {
  constructor(issues: string[]) {
    super(`Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join("\n")}`);
    this.name = "EnvValidationError";
  }
}

/**
 * Parses and validates process.env against a schema, failing fast with a
 * readable error at startup instead of surfacing a confusing failure deep
 * inside a request handler later. The return type is derived from the same
 * schema instantiation (`z.infer<S>`) rather than a free type parameter, so
 * it matches a `z.infer<typeof schema>` alias declared at the call site
 * exactly — zod's default()/optional() handling otherwise produces two
 * structurally different-looking (but equivalent) inferred types.
 */
export function loadEnv<S extends ZodTypeAny>(schema: S, source: NodeJS.ProcessEnv = process.env): z.infer<S> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
    throw new EnvValidationError(issues);
  }
  return result.data;
}

/**
 * Field-name fragments treated as secret-shaped for log redaction. Matching
 * is case-insensitive substring matching against object keys.
 */
export const SECRET_FIELD_PATTERNS = ["password", "secret", "token", "apikey", "api_key", "authorization"] as const;

export function isSecretFieldName(fieldName: string): boolean {
  const lower = fieldName.toLowerCase();
  return SECRET_FIELD_PATTERNS.some((pattern) => lower.includes(pattern));
}
