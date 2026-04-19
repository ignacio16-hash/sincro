import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPin, setSessionCookie, ensureDefaultAdmin } from "@/lib/auth";

// POST /api/auth/login — { username, pin } → sets session cookie
export async function POST(req: NextRequest) {
  await ensureDefaultAdmin();

  let body: { username?: string; pin?: string } = {};
  try { body = await req.json(); } catch {}
  const username = String(body.username || "").trim().toLowerCase();
  const pin = String(body.pin || "");

  if (!username || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: "Usuario o PIN inválido" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !verifyPin(pin, user.pinHash)) {
    // Uniform error to avoid user enumeration
    return NextResponse.json({ error: "Credenciales incorrectas" }, { status: 401 });
  }

  await setSessionCookie({ uid: user.id, username: user.username, role: user.role as "admin" | "vendedor" });

  return NextResponse.json({
    ok: true,
    user: { username: user.username, role: user.role },
    redirect: user.role === "admin" ? "/dashboard" : "/stock",
  });
}
