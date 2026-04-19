// Tiny auth layer: scrypt PIN hash + HMAC-signed session cookie.
// No third-party deps — Node crypto only.
//
// Session cookie format:  base64url(JSON(payload)) + "." + base64url(hmac)
//   payload = { uid, u, r, exp }   // userId, username, role, epoch-seconds expiry
//
// The signing secret comes from AUTH_SECRET env. In dev we fall back to a
// constant so the app boots — in production set AUTH_SECRET.
import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export type Role = "admin" | "vendedor";

export interface SessionUser {
  uid: string;
  username: string;
  role: Role;
}

interface CookiePayload {
  uid: string;
  u: string;
  r: Role;
  exp: number;
}

const COOKIE_NAME = "parrot_session";
const COOKIE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function secret(): Buffer {
  return Buffer.from(process.env.AUTH_SECRET || "parrot-dev-secret-change-me", "utf8");
}

function b64url(buf: Buffer | string): string {
  return (typeof buf === "string" ? Buffer.from(buf) : buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

// ─── PIN hashing ─────────────────────────────────────────────────────────────

export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(pin, salt, 64);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const derived = crypto.scryptSync(pin, salt, expected.length);
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

// ─── Session cookie ──────────────────────────────────────────────────────────

export function signSession(user: SessionUser, ttlSec = COOKIE_TTL_SECONDS): string {
  const payload: CookiePayload = {
    uid: user.uid,
    u: user.username,
    r: user.role,
    exp: Math.floor(Date.now() / 1000) + ttlSec,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac("sha256", secret()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifySession(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = b64url(crypto.createHmac("sha256", secret()).update(body).digest());
  // constant-time compare
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(b64urlDecode(body).toString("utf8")) as CookiePayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { uid: payload.uid, username: payload.u, role: payload.r };
  } catch {
    return null;
  }
}

// ─── Server helpers (Route Handlers / Server Components) ─────────────────────

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  return verifySession(token);
}

export async function setSessionCookie(user: SessionUser): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, signSession(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;

// ─── Bootstrap: ensure default admin exists ──────────────────────────────────
// Runs idempotently — called from instrumentation.ts on app boot and inside
// login POST as a belt-and-suspenders guard.
let bootstrapped = false;
export async function ensureDefaultAdmin(): Promise<void> {
  if (bootstrapped) return;
  try {
    const existing = await prisma.user.findUnique({ where: { username: "ignacio" } });
    if (!existing) {
      await prisma.user.create({
        data: { username: "ignacio", pinHash: hashPin("5659"), role: "admin" },
      });
      console.log("[Auth] Default admin 'ignacio' seeded");
    }
    bootstrapped = true;
  } catch (err) {
    // Table probably doesn't exist yet — db push hasn't run. Swallow.
    console.warn("[Auth] ensureDefaultAdmin skipped:", (err as Error).message);
  }
}
