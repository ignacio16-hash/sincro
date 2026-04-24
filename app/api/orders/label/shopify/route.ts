// Etiquetas manuales de envío para pedidos de Shopify.
//
//   GET    ?orderId=... → descarga el PDF (admin y vendedor).
//   POST   ?orderId=... multipart/form-data con file=<PDF> → sube / reemplaza (admin only).
//   DELETE ?orderId=... → borra la etiqueta (admin only).
//
// Tope de 5MB por PDF. Solo mimeType application/pdf. Claves únicas por
// (platform, orderId) — por ahora platform = "shopify".
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const PLATFORM = "shopify";
const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME = "application/pdf";

function getOrderId(req: NextRequest): string | null {
  const id = req.nextUrl.searchParams.get("orderId");
  return id && id.trim() ? id.trim() : null;
}

// ─── GET: download ───────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const orderId = getOrderId(req);
  if (!orderId) return NextResponse.json({ error: "orderId requerido" }, { status: 400 });

  const label = await prisma.shippingLabel.findUnique({
    where: { platform_orderId: { platform: PLATFORM, orderId } },
  });
  if (!label) return NextResponse.json({ error: "No hay etiqueta cargada para este pedido" }, { status: 404 });

  const pdf = Buffer.from(label.pdf);
  return new Response(pdf.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": label.mimeType || ALLOWED_MIME,
      "Content-Disposition": `attachment; filename="${sanitizeFilename(label.filename || `etiqueta-${orderId}.pdf`)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

// ─── POST: upload / replace (admin only) ─────────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Solo admin puede subir etiquetas" }, { status: 403 });
  }

  const orderId = getOrderId(req);
  if (!orderId) return NextResponse.json({ error: "orderId requerido" }, { status: 400 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Esperaba multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Campo 'file' requerido" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "El archivo está vacío" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Máximo ${Math.floor(MAX_BYTES / 1024 / 1024)}MB por etiqueta` },
      { status: 413 }
    );
  }
  const mimeType = file.type || ALLOWED_MIME;
  if (mimeType !== ALLOWED_MIME) {
    return NextResponse.json({ error: "Solo se aceptan archivos PDF" }, { status: 415 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  // Sanity check del header PDF para evitar archivos renombrados como pdf.
  if (buf.slice(0, 4).toString("ascii") !== "%PDF") {
    return NextResponse.json({ error: "El archivo no parece un PDF válido" }, { status: 400 });
  }

  const filename = "name" in file && typeof (file as { name?: string }).name === "string"
    ? (file as { name: string }).name
    : `etiqueta-${orderId}.pdf`;

  const saved = await prisma.shippingLabel.upsert({
    where: { platform_orderId: { platform: PLATFORM, orderId } },
    update: {
      pdf: buf,
      mimeType,
      filename,
      sizeBytes: buf.length,
      uploadedBy: user.username,
      uploadedAt: new Date(),
    },
    create: {
      platform: PLATFORM,
      orderId,
      pdf: buf,
      mimeType,
      filename,
      sizeBytes: buf.length,
      uploadedBy: user.username,
    },
    select: { id: true, sizeBytes: true, uploadedAt: true, uploadedBy: true, filename: true },
  });

  return NextResponse.json({ ok: true, label: saved });
}

// ─── DELETE: remove (admin only) ─────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Solo admin puede borrar etiquetas" }, { status: 403 });
  }

  const orderId = getOrderId(req);
  if (!orderId) return NextResponse.json({ error: "orderId requerido" }, { status: 400 });

  try {
    await prisma.shippingLabel.delete({
      where: { platform_orderId: { platform: PLATFORM, orderId } },
    });
    return NextResponse.json({ ok: true });
  } catch {
    // No existía — idempotente, no es error.
    return NextResponse.json({ ok: true, alreadyMissing: true });
  }
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "etiqueta.pdf";
}
