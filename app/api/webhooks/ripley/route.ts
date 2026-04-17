import { NextRequest, NextResponse } from "next/server";
import { handleMarketplaceOrder } from "@/lib/sync";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Ripley / Mirakl order webhook
    // Mirakl sends orders with order_lines
    const orderId = body.order_id || body.orderId || "unknown";
    const orderLines =
      body.order_lines ||
      body.orderLines ||
      body.items ||
      [];

    if (!orderLines.length) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    for (const line of orderLines) {
      const sku = line.offer_sku || line.sku;
      const quantity = line.quantity || line.qty || 1;
      if (!sku) continue;
      await handleMarketplaceOrder("ripley", sku, quantity, orderId);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Webhook Ripley]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
