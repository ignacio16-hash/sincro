import { NextRequest, NextResponse } from "next/server";
import { handleMarketplaceOrder } from "@/lib/sync";

// Falabella order webhook payload:
// {
//   "OrderId": "123456",
//   "OrderItems": [
//     {
//       "OrderItemId": "789",
//       "SellerSku": "YOUR-SKU-123",   ← use this field
//       "Quantity": "1",               ← string, parse to int
//       "Status": "pending"
//     }
//   ]
// }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const orderId = body.OrderId || body.orderId || body.order_id || "unknown";
    const items = body.OrderItems || body.orderItems || body.items || [];

    if (!items.length) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    for (const item of items) {
      const sku = item.SellerSku || item.seller_sku || item.sku;
      const quantity = parseInt(item.Quantity || item.quantity || "1", 10);
      if (!sku || !quantity) continue;
      await handleMarketplaceOrder("falabella", sku, quantity, orderId);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Webhook Falabella]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
