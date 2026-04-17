import { NextRequest, NextResponse } from "next/server";
import { handleMarketplaceOrder } from "@/lib/sync";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Paris/Cencosud order webhook
    const orderId = body.orderId || body.order_id || "unknown";
    const items: { sku: string; quantity: number }[] = body.items || body.orderItems || [];

    if (!items.length) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    for (const item of items) {
      if (!item.sku || !item.quantity) continue;
      await handleMarketplaceOrder("paris", item.sku, item.quantity, orderId);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Webhook Paris]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
