import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleMarketplaceOrder } from "@/lib/sync";

// Paris/Cencosud webhook receiver.
//
// NOTA: La documentación pública (https://developers.ecomm.cencosud.com/docs
// → back-dev-portal.ecomm.cencosud.com/documentations) NO expone endpoints de
// suscripción a webhooks. La detección en tiempo real se hace via polling cada
// 2 min desde pollAndProcessOrders(). Este handler queda como fallback por si
// Cencosud agrega webhooks en el futuro o el vendedor configura uno custom.
//
// Aceptamos un payload flexible: { orderId | originOrderNumber, items | subOrders }.
// Cada item debe traer sku (sellerSku) + quantity.
export async function POST(req: NextRequest) {
  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  console.log("[Webhook Paris]", JSON.stringify(payload).slice(0, 500));

  try {
    const orderId = String(
      payload.originOrderNumber ?? payload.orderId ?? payload.order_id ?? payload.id ?? ""
    );
    if (!orderId) return NextResponse.json({ ok: true, ignored: "no orderId" });

    // Aplanar items: pueden venir en `items`, `orderItems`, o dentro de `subOrders[].items`.
    const raw: Record<string, unknown>[] = [];
    const direct = payload.items || payload.orderItems;
    if (Array.isArray(direct)) raw.push(...(direct as Record<string, unknown>[]));
    const subOrders = payload.subOrders;
    if (Array.isArray(subOrders)) {
      for (const so of subOrders as Record<string, unknown>[]) {
        const soItems = so.items;
        if (Array.isArray(soItems)) raw.push(...(soItems as Record<string, unknown>[]));
      }
    }

    const agg = new Map<string, number>();
    for (const item of raw) {
      const sku = String(item.sellerSku ?? item.seller_sku ?? item.sku ?? "");
      const qty = parseInt(String(item.quantity ?? 1), 10) || 1;
      if (sku) agg.set(sku, (agg.get(sku) || 0) + qty);
    }
    const items = [...agg.entries()].map(([sku, quantity]) => ({ sku, quantity }));

    if (items.length === 0) return NextResponse.json({ ok: true, skipped: "no items" });

    let discounted = 0;
    for (const item of items) {
      const exists = await prisma.syncEvent.findFirst({
        where: { orderId, sku: item.sku, source: "paris" },
      });
      if (exists) continue;
      try {
        await handleMarketplaceOrder("paris", item.sku, item.quantity, orderId);
        discounted++;
      } catch (e) {
        console.error(`[Webhook Paris] Error descontando ${item.sku}:`, (e as Error).message);
      }
    }

    return NextResponse.json({ ok: true, orderId, skus: items.length, discounted });
  } catch (err) {
    console.error("[Webhook Paris] Error:", (err as Error).message);
    return NextResponse.json({ ok: true, error: (err as Error).message });
  }
}
