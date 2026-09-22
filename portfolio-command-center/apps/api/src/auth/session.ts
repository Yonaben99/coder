import type { PrismaClient, User } from "@pcc/db";

export const SESSION_COOKIE_NAME = "pcc_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function createSession(prisma: PrismaClient, userId: string): Promise<{ id: string; expiresAt: Date }> {
  const session = await prisma.session.create({
    data: { userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });
  return { id: session.id, expiresAt: session.expiresAt };
}

export async function getUserForSession(prisma: PrismaClient, sessionId: string): Promise<User | null> {
  const session = await prisma.session.findUnique({ where: { id: sessionId }, include: { user: true } });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: sessionId } }).catch(() => undefined);
    return null;
  }
  return session.user;
}

export async function deleteSession(prisma: PrismaClient, sessionId: string): Promise<void> {
  await prisma.session.delete({ where: { id: sessionId } }).catch(() => undefined);
}
