import { NextRequest, NextResponse } from "next/server";
import { handleMarketplaceOrder } from "@/lib/sync";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Falabella order webhook
    const orderId = body.orderId || body.order_id || "unknown";
    const items =
      body.items ||
      body.order_items ||
      body.orderItems ||
      [];

    if (!items.length) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    for (const item of items) {
      const sku = item.sku || item.seller_sku;
      const quantity = item.quantity || item.qty || 1;
      if (!sku) continue;
      await handleMarketplaceOrder("falabella", sku, quantity, orderId);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Webhook Falabella]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
