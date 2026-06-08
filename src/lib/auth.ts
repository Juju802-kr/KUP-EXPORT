import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac, timingSafeEqual } from "crypto";
import { cache } from "react";
import bcrypt from "bcryptjs";
import type { Team } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const sessionCookieName = "shipping_agent_session";
type SessionUser = { id: string; team: Team; name: string; email: string };
type SessionPayload = SessionUser & { exp: number };

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

function sessionSecret() {
  return process.env.AUTH_SECRET || process.env.DATABASE_URL || "shipping-agent-local-session-secret";
}

function sign(value: string) {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

function encodeSession(payload: SessionPayload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `v1.${encoded}.${sign(encoded)}`;
}

function decodeSession(value: string): SessionPayload | null {
  const [version, encoded, signature] = value.split(".");
  if (version !== "v1" || !encoded || !signature) return null;
  const expected = sign(encoded);
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length || !timingSafeEqual(receivedBuffer, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.id || !payload.email || !payload.name || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function createSession(user: SessionUser, remember = false) {
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * (remember ? 30 : 1));
  const jar = await cookies();
  jar.set(sessionCookieName, encodeSession({ ...user, exp: expiresAt.getTime() }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(remember ? { expires: expiresAt } : {})
  });
}

export const getCurrentUser = cache(async function getCurrentUser() {
  const jar = await cookies();
  const token = jar.get(sessionCookieName)?.value;
  if (!token) return null;
  const signedSession = decodeSession(token);
  if (signedSession) {
    const { exp: _exp, ...user } = signedSession;
    void _exp;
    return user;
  }
  // Legacy database-backed cookies remain valid until the user logs in again.
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
  jar.delete(sessionCookieName);
}
