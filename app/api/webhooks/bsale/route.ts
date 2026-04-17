import { NextRequest, NextResponse } from "next/server";
import { handleBsaleStockChange } from "@/lib/sync";
import { prisma } from "@/lib/db";

// Bsale webhook payload for stock changes:
// {
//   "cpnId": 2,
//   "resource": "/v2/stocks.json?variant=7079&office=1",
//   "resourceId": "7079",   ← variantId (NOT the SKU string)
//   "topic": "stock",
//   "action": "put",
//   "officeId": "1",
//   "send": 1503500856
// }
// IMPORTANT: Bsale does NOT send the new quantity in the webhook.
// We must fetch it by calling the Bsale API after receiving the notification.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.topic !== "stock") {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const variantId = parseInt(body.resourceId);
    const officeId = body.officeId ? parseInt(body.officeId) : 0;

    if (!variantId || isNaN(variantId)) {
      return NextResponse.json({ error: "Missing resourceId (variantId)" }, { status: 400 });
    }

    // Get the Bsale access token from DB to fetch current stock
    const cred = await prisma.apiCredential.findUnique({ where: { platform: "bsale" } });
    const accessToken = (cred?.config as Record<string, string>)?.accessToken;
    if (!accessToken) {
      return NextResponse.json({ error: "Bsale not configured" }, { status: 503 });
    }

    await handleBsaleStockChange(variantId, officeId, accessToken);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Webhook Bsale]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
