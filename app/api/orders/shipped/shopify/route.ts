// Marca local de "enviado" para pedidos de Shopify. No se empuja a Shopify;
// solo vive en nuestra DB para que admin y vendedor sepan qué ya despacharon.
//
//   POST   ?orderId=...  → marca como enviado (admin + vendedor)
//   DELETE ?orderId=...  → quita la marca    (admin + vendedor)
//
// Una sola fila por (platform, orderId). Upsert en POST (si ya estaba marcado,
// refresca shippedBy/shippedAt). DELETE es idempotente.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const PLATFORM = "shopify";

function getOrderId(req: NextRequest): string | null {
  const id = req.nextUrl.searchParams.get("orderId");
  return id && id.trim() ? id.trim() : null;
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const orderId = getOrderId(req);
  if (!orderId) return NextResponse.json({ error: "orderId requerido" }, { status: 400 });

  const saved = await prisma.orderShipment.upsert({
    where: { platform_orderId: { platform: PLATFORM, orderId } },
    update: { shippedBy: user.username, shippedAt: new Date() },
    create: { platform: PLATFORM, orderId, shippedBy: user.username },
    select: { shippedAt: true, shippedBy: true },
  });

  return NextResponse.json({
    ok: true,
    isShipped: true,
    shippedAt: saved.shippedAt.toISOString(),
    shippedBy: saved.shippedBy,
  });
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const orderId = getOrderId(req);
  if (!orderId) return NextResponse.json({ error: "orderId requerido" }, { status: 400 });

  try {
    await prisma.orderShipment.delete({
      where: { platform_orderId: { platform: PLATFORM, orderId } },
    });
  } catch {
    // No existía — idempotente.
  }
  return NextResponse.json({ ok: true, isShipped: false });
}
