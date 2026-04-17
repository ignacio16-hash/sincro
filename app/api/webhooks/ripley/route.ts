import { NextRequest, NextResponse } from "next/server";
import { handleMarketplaceOrder } from "@/lib/sync";

// Ripley / Mirakl order payload (OR12):
// {
//   "order_id": "ORDER-00014",
//   "order_state": "WAITING_ACCEPTANCE",
//   "order_lines": [
//     {
//       "offer_sku": "YOUR-SKU-123",   ← always use offer_sku (NOT product_sku)
//       "quantity": 2,
//       "order_line_state": "WAITING_ACCEPTANCE"
//     }
//   ]
// }
// NOTE: Mirakl typically doesn't push webhooks to sellers — sellers poll OR11.
// This endpoint handles cases where the instance IS configured to push notifications.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const orderId = body.order_id || body.orderId || "unknown";
    const orderLines = body.order_lines || body.orderLines || body.items || [];

    if (!orderLines.length) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    for (const line of orderLines) {
      // Use offer_sku (seller SKU), NOT product_sku (marketplace catalog SKU)
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
