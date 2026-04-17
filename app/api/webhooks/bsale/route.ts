import { NextRequest, NextResponse } from "next/server";
import { handleBsaleStockChange } from "@/lib/sync";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Bsale webhook payload for stock changes
    // https://docs.bsale.dev/webhooks
    if (body.topic !== "stocks") {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const resource = body.resource || {};
    const sku = resource.barCode || resource.sku;
    const variantId = resource.id;
    const newQty = resource.quantity ?? 0;

    if (!sku || !variantId) {
      return NextResponse.json({ error: "Missing sku or variantId" }, { status: 400 });
    }

    await handleBsaleStockChange(sku, parseInt(variantId), parseInt(newQty));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Webhook Bsale]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
