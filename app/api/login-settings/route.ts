import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// GET  /api/login-settings — public (login page reads it)
// POST /api/login-settings — admin only,
//   { logoText?, logoSvg?, imageUrl?, appLogoDataUrl? }
//
// Uses a single row id="default" (singleton pattern).

const DEFAULT_ROW = {
  id: "default",
  logoText: "PARROT",
  logoSvg: null as string | null,
  imageUrl:
    "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=80",
  appLogoDataUrl: null as string | null,
};

const MAX_SVG_BYTES = 64 * 1024; // 64 KB cap
// Cap del logo de la app: 512 KB en data URL ≈ 384 KB binario. Suficiente
// para PNGs razonables y para cualquier SVG sano.
const MAX_APP_LOGO_BYTES = 512 * 1024;

// Acepta solo data URLs de PNG o SVG. Devuelve la URL normalizada o null si
// el formato no califica.
function validateAppLogoDataUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (s.length > MAX_APP_LOGO_BYTES) return null;
  // Formatos permitidos: image/png, image/svg+xml. Base64 obligatorio (más
  // compacto y predecible que percent-encoded).
  const m = s.match(/^data:(image\/png|image\/svg\+xml);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return null;
  // Validación extra para SVG: decodificar y exigir <svg> + sanitizar payload.
  if (m[1] === "image/svg+xml") {
    let decoded = "";
    try { decoded = Buffer.from(m[2], "base64").toString("utf-8"); } catch { return null; }
    const cleaned = sanitizeSvg(decoded);
    if (!cleaned) return null;
    return `data:image/svg+xml;base64,${Buffer.from(cleaned, "utf-8").toString("base64")}`;
  }
  return s;
}

/**
 * Strip dangerous bits from admin-supplied SVG so we can safely render it
 * with dangerouslySetInnerHTML on /login. Admin-only input but still
 * sanitised to avoid pasting hostile SVG from third-party sources.
 */
function sanitizeSvg(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  if (s.length > MAX_SVG_BYTES) return null;
  // Must start with an <svg ...> tag (allow XML/DOCTYPE preambles).
  if (!/<svg[\s>]/i.test(s)) return null;
  // Drop XML declarations and DOCTYPEs (browsers ignore them inside HTML anyway).
  s = s.replace(/<\?xml[\s\S]*?\?>/gi, "");
  s = s.replace(/<!DOCTYPE[\s\S]*?>/gi, "");
  // Remove <script>…</script> blocks.
  s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
  // Remove on* event handler attributes:  onload="…"  onclick='…'  onfoo=bar
  s = s.replace(/\son[a-z]+\s*=\s*"(?:[^"\\]|\\.)*"/gi, "");
  s = s.replace(/\son[a-z]+\s*=\s*'(?:[^'\\]|\\.)*'/gi, "");
  s = s.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "");
  // Strip javascript: URIs in href / xlink:href.
  s = s.replace(/(href|xlink:href)\s*=\s*"\s*javascript:[^"]*"/gi, "");
  s = s.replace(/(href|xlink:href)\s*=\s*'\s*javascript:[^']*'/gi, "");
  // Drop <foreignObject> — can embed arbitrary HTML.
  s = s.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "");
  return s.trim() || null;
}

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
      logoSvg: row.logoSvg,
      imageUrl: row.imageUrl,
      appLogoDataUrl: row.appLogoDataUrl ?? null,
    });
  } catch {
    // Table may not exist yet — return defaults so /login still renders.
    return NextResponse.json({
      logoText: DEFAULT_ROW.logoText,
      logoSvg: null,
      imageUrl: DEFAULT_ROW.imageUrl,
      appLogoDataUrl: null,
    });
  }
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Solo admin" }, { status: 403 });

  let body: { logoText?: string; logoSvg?: string | null; imageUrl?: string; appLogoDataUrl?: string | null } = {};
  try { body = await req.json(); } catch {}

  const data: { logoText?: string; logoSvg?: string | null; imageUrl?: string; appLogoDataUrl?: string | null } = {};

  if (typeof body.logoText === "string") {
    const t = body.logoText.trim();
    if (t.length > 0 && t.length <= 40) data.logoText = t;
  }

  if (body.logoSvg === null || body.logoSvg === "") {
    data.logoSvg = null; // explicit clear
  } else if (typeof body.logoSvg === "string") {
    const cleaned = sanitizeSvg(body.logoSvg);
    if (cleaned === null && body.logoSvg.trim().length > 0) {
      return NextResponse.json(
        { error: "SVG inválido (debe empezar con <svg> y pesar < 64 KB)" },
        { status: 400 },
      );
    }
    data.logoSvg = cleaned;
  }

  if (typeof body.imageUrl === "string") {
    const u = body.imageUrl.trim();
    if (u.length === 0 || /^https?:\/\//.test(u)) data.imageUrl = u || DEFAULT_ROW.imageUrl;
  }

  if (body.appLogoDataUrl === null || body.appLogoDataUrl === "") {
    data.appLogoDataUrl = null; // explicit clear → vuelve a "Parrot"
  } else if (typeof body.appLogoDataUrl === "string") {
    const cleaned = validateAppLogoDataUrl(body.appLogoDataUrl);
    if (!cleaned) {
      return NextResponse.json(
        { error: "Logo inválido — debe ser PNG o SVG (máx. 512 KB)" },
        { status: 400 },
      );
    }
    data.appLogoDataUrl = cleaned;
  }

  const row = await prisma.loginSettings.upsert({
    where: { id: "default" },
    create: { ...DEFAULT_ROW, ...data },
    update: data,
  });

  return NextResponse.json({
    ok: true,
    logoText: row.logoText,
    logoSvg: row.logoSvg,
    imageUrl: row.imageUrl,
    appLogoDataUrl: row.appLogoDataUrl ?? null,
  });
}
