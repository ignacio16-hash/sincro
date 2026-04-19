import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getFalabellaOrderItemsForDiscount } from "@/lib/falabella";
import { handleMarketplaceOrder } from "@/lib/sync";

// Falabella webhook receiver — descuenta stock de Bsale al instante cuando
// llega un pedido nuevo.
// Docs: https://developers.falabella.com/v500.0.0/reference/createwebhook
//
// Payload típico (Lazada/SellerCenter):
//   { seller_id, event: "order_created", data: { order_id: "123" } }
// A veces el payload incluye OrderItems directamente; si no, fetcheamos
// via GetOrderItems para saber qué SKUs + cantidades descontar.
export async function POST(req: NextRequest) {
  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  console.log("[Webhook Falabella]", JSON.stringify(payload).slice(0, 500));

  try {
    const event = String(payload.event || payload.Event || "").toLowerCase();
    const data = (payload.data || payload.Data || payload) as Record<string, unknown>;
    const orderId = String(
      data.order_id ?? data.OrderId ?? data.orderId ?? payload.order_id ?? payload.OrderId ?? ""
    );

    // Si el payload trae OrderItems inline, usar esos (ahorramos 1 request).
    const inlineItemsRaw = payload.OrderItems || payload.orderItems || payload.items ||
      (data as Record<string, unknown>).OrderItems;
    const inlineItems = Array.isArray(inlineItemsRaw) ? inlineItemsRaw : [];

    // Si no hay event name específico pero trae items, procesar igual
    const isNewOrder =
      /order[_-]?(created|pending|new)|new[_-]?order/.test(event) || inlineItems.length > 0;

    if (!isNewOrder || !orderId) {
      return NextResponse.json({ ok: true, ignored: true, event, orderId });
    }

    let items: { sku: string; quantity: number }[] = [];

    if (inlineItems.length > 0) {
      const agg = new Map<string, number>();
      for (const it of inlineItems) {
        const item = it as Record<string, unknown>;
        const sku = String(item.SellerSku || item.seller_sku || item.sku || item.Sku || "");
        const qty = parseInt(String(item.Quantity || item.quantity || "1"), 10) || 1;
        if (sku) agg.set(sku, (agg.get(sku) || 0) + qty);
      }
      items = [...agg.entries()].map(([sku, quantity]) => ({ sku, quantity }));
    } else {
      const cred = await prisma.apiCredential.findUnique({ where: { platform: "falabella" } });
      const conf = cred?.config as Record<string, string> | undefined;
      if (!conf?.apiKey || !conf?.userId) {
        return NextResponse.json({ ok: true, error: "Falabella no configurado" });
      }
      items = await getFalabellaOrderItemsForDiscount(
        conf.apiKey, conf.userId, orderId, conf.country || "CL"
      );
    }

    // Descontar — dedup por (orderId, sku, source) para evitar doble descuento
    let discounted = 0;
    for (const item of items) {
      const exists = await prisma.syncEvent.findFirst({
        where: { orderId, sku: item.sku, source: "falabella" },
      });
      if (exists) continue;
      try {
        await handleMarketplaceOrder("falabella", item.sku, item.quantity, orderId);
        discounted++;
      } catch (e) {
        console.error(`[Webhook Falabella] Error descontando ${item.sku}:`, (e as Error).message);
      }
    }

    return NextResponse.json({ ok: true, orderId, skus: items.length, discounted });
  } catch (err) {
    console.error("[Webhook Falabella] Error:", (err as Error).message);
    // Siempre 200 — ya loggeamos; no queremos reintentos infinitos.
    return NextResponse.json({ ok: true, error: (err as Error).message });
  }
}
