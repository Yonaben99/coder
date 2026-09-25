import type { FastifyInstance } from "fastify";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { buildRequireAuth } from "../auth/middleware.js";
import { createSession, deleteSession, SESSION_COOKIE_NAME, SESSION_TTL_MS } from "../auth/session.js";

const credentialsSchema = {
  type: "object",
  required: ["email", "password"],
  properties: {
    email: { type: "string", format: "email" },
    password: { type: "string", minLength: 8, maxLength: 200 },
  },
  additionalProperties: false,
} as const;

interface CredentialsBody {
  email: string;
  password: string;
}

// Stricter than the app-wide default (see app.ts) — these are the two
// routes credential-stuffing/brute-force actually targets. Keyed by IP via
// the global rate-limit plugin's default keyGenerator. See SECURITY.md §3.
const AUTH_RATE_LIMIT = { max: 10, timeWindow: "1 minute" };

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: CredentialsBody }>(
    "/auth/signup",
    { schema: { body: credentialsSchema }, config: { rateLimit: AUTH_RATE_LIMIT } },
    async (request, reply) => {
      const { email, password } = request.body;

      const existing = await app.prisma.user.findUnique({ where: { email } });
      if (existing) {
        return reply.code(409).send({ error: { code: "EMAIL_TAKEN", message: "An account with that email already exists." } });
      }

      const passwordHash = await hashPassword(password);
      const user = await app.prisma.user.create({ data: { email, passwordHash } });
      const session = await createSession(app.prisma, user.id);

      reply.setCookie(SESSION_COOKIE_NAME, session.id, {
        httpOnly: true,
        secure: app.config.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        signed: true,
        maxAge: SESSION_TTL_MS / 1000,
      });

      return reply.code(201).send({ user: { id: user.id, email: user.email } });
    },
  );

  app.post<{ Body: CredentialsBody }>(
    "/auth/login",
    { schema: { body: credentialsSchema }, config: { rateLimit: AUTH_RATE_LIMIT } },
    async (request, reply) => {
      const { email, password } = request.body;

      const user = await app.prisma.user.findUnique({ where: { email } });
      const valid = user ? await verifyPassword(user.passwordHash, password) : false;

      if (!user || !valid) {
        return reply.code(401).send({ error: { code: "INVALID_CREDENTIALS", message: "Incorrect email or password." } });
      }

      const session = await createSession(app.prisma, user.id);
      reply.setCookie(SESSION_COOKIE_NAME, session.id, {
        httpOnly: true,
        secure: app.config.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        signed: true,
        maxAge: SESSION_TTL_MS / 1000,
      });

      return reply.send({ user: { id: user.id, email: user.email } });
    },
  );

  app.post("/auth/logout", async (request, reply) => {
    const raw = request.cookies[SESSION_COOKIE_NAME];
    if (raw) {
      const sessionId = request.unsignCookie(raw).value ?? raw;
      await deleteSession(app.prisma, sessionId);
    }
    reply.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    return reply.send({ ok: true });
  });

  app.get("/auth/me", { preHandler: buildRequireAuth(app.prisma) }, async (request) => {
    return { user: { id: request.user!.id, email: request.user!.email } };
  });
}
