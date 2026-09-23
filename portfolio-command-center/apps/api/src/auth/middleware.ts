import type { FastifyReply, FastifyRequest } from "fastify";
import type { User } from "@pcc/db";
import { getUserForSession, SESSION_COOKIE_NAME } from "./session.js";
import type { PrismaClient } from "@pcc/db";

declare module "fastify" {
  interface FastifyRequest {
    user?: User;
  }
}

export function buildRequireAuth(prisma: PrismaClient) {
  return async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const sessionId = request.cookies[SESSION_COOKIE_NAME];
    const user = sessionId ? await getUserForSession(prisma, request.unsignCookie(sessionId).value ?? sessionId) : null;

    if (!user) {
      await reply.code(401).send({ error: { code: "UNAUTHENTICATED", message: "Sign in required." } });
      return;
    }

    request.user = user;
  };
}
