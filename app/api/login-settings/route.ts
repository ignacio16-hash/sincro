import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// GET  /api/login-settings — public (login page reads it)
// POST /api/login-settings — admin only, { logoText?, imageUrl? }
//
// Uses a single row id="default" (singleton pattern).

const DEFAULT_ROW = {
  id: "default",
  logoText: "PARROT",
  imageUrl:
    "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=80",
};

async function getOrCreate() {
  let row = await prisma.loginSettings.findUnique({ where: { id: "default" } });
  if (!row) {
    row = await prisma.loginSettings.create({ data: DEFAULT_ROW });
  }
  return row;
}

export async function GET() {
  try {
    const row = await getOrCreate();
    return NextResponse.json({
      logoText: row.logoText,
      imageUrl: row.imageUrl,
    });
  } catch {
    // Table may not exist yet — return defaults so /login still renders.
    return NextResponse.json({ logoText: DEFAULT_ROW.logoText, imageUrl: DEFAULT_ROW.imageUrl });
  }
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Solo admin" }, { status: 403 });

  let body: { logoText?: string; imageUrl?: string } = {};
  try { body = await req.json(); } catch {}

  const data: { logoText?: string; imageUrl?: string } = {};
  if (typeof body.logoText === "string") {
    const t = body.logoText.trim();
    if (t.length > 0 && t.length <= 40) data.logoText = t;
  }
  if (typeof body.imageUrl === "string") {
    const u = body.imageUrl.trim();
    if (u.length === 0 || /^https?:\/\//.test(u)) data.imageUrl = u || DEFAULT_ROW.imageUrl;
  }

  const row = await prisma.loginSettings.upsert({
    where: { id: "default" },
    create: { ...DEFAULT_ROW, ...data },
    update: data,
  });

  return NextResponse.json({
    ok: true,
    logoText: row.logoText,
    imageUrl: row.imageUrl,
  });
}
