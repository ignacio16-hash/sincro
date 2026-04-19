import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser, hashPin } from "@/lib/auth";

// Admin-only CRUD for app users.
//
// GET    /api/users            → list users (sin pinHash)
// POST   /api/users            → create user {username, pin, role}
// DELETE /api/users?id=...     → remove user (cannot remove self)

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user) return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  if (user.role !== "admin") return { error: NextResponse.json({ error: "Solo admin" }, { status: 403 }) };
  return { user };
}

export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, username: true, role: true, createdAt: true },
  });
  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;

  let body: { username?: string; pin?: string; role?: string } = {};
  try { body = await req.json(); } catch {}
  const username = String(body.username || "").trim().toLowerCase();
  const pin = String(body.pin || "");
  const role = body.role === "admin" ? "admin" : "vendedor";

  if (!username || !/^[a-z0-9._-]{3,30}$/.test(username)) {
    return NextResponse.json({ error: "Username inválido (3-30, minúsculas/números)" }, { status: 400 });
  }
  if (!/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: "El PIN debe ser de 4 dígitos" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return NextResponse.json({ error: "Usuario ya existe" }, { status: 409 });

  const user = await prisma.user.create({
    data: { username, pinHash: hashPin(pin), role },
    select: { id: true, username: true, role: true, createdAt: true },
  });
  return NextResponse.json({ ok: true, user });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  if (id === gate.user.uid) {
    return NextResponse.json({ error: "No puedes eliminarte a ti mismo" }, { status: 400 });
  }
  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
