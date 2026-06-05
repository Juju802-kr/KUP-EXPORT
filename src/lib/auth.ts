import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes } from "crypto";
import { cache } from "react";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const sessionCookieName = "shipping_agent_session";

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function makeToken() {
  return randomBytes(32).toString("hex");
}

export async function createSession(userId: string, remember = false) {
  const token = makeToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * (remember ? 30 : 1));
  await prisma.session.create({ data: { token, userId, expiresAt } });
  const jar = await cookies();
  jar.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    ...(remember ? { expires: expiresAt } : {})
  });
}

export const getCurrentUser = cache(async function getCurrentUser() {
  const jar = await cookies();
  const token = jar.get(sessionCookieName)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true }
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(sessionCookieName)?.value;
  if (token) await prisma.session.deleteMany({ where: { token } });
  jar.delete(sessionCookieName);
}
