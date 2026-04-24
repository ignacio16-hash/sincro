import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRipleyOrders } from "@/lib/ripley";
import { getFalabellaOrdersList } from "@/lib/falabella";
import { getShopifyOrders, type ShopifyOrder } from "@/lib/shopify";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [falabellaCred, ripleyCred, shopifyCred] = await Promise.all([
      prisma.apiCredential.findUnique({ where: { platform: "falabella" } }),
      prisma.apiCredential.findUnique({ where: { platform: "ripley" } }),
      prisma.apiCredential.findUnique({ where: { platform: "shopify" } }),
    ]);

    const falabellaConf = falabellaCred?.config as Record<string, string> | undefined;
    const ripleyConf = ripleyCred?.config as Record<string, string> | undefined;
    const shopifyConf = shopifyCred?.config as Record<string, string> | undefined;

    // Fetch from configured marketplaces in parallel
    const [falabellaOrders, ripleyOrders, shopifyOrders] = await Promise.all([
      falabellaConf?.apiKey && falabellaConf?.userId
        ? getFalabellaOrdersList(falabellaConf.apiKey, falabellaConf.userId, falabellaConf.country || "CL")
            .catch((e) => { console.error("[Orders] Falabella:", e.message); return []; })
        : Promise.resolve([]),

      ripleyConf?.apiKey && ripleyConf?.instanceUrl
        ? getRipleyOrders(ripleyConf.apiKey, ripleyConf.instanceUrl, undefined, 50)
            .catch((e) => { console.error("[Orders] Ripley:", e.message); return []; })
        : Promise.resolve([]),

      shopifyConf?.shopDomain && shopifyConf?.accessToken
        ? getShopifyOrders(shopifyConf.shopDomain, shopifyConf.accessToken, 50, shopifyConf.apiVersion || undefined)
            .catch((e) => { console.error("[Orders] Shopify:", e.message); return [] as ShopifyOrder[]; })
        : Promise.resolve([] as ShopifyOrder[]),
    ]);

    // Anotar los pedidos de Shopify con hasLabel (si ya subieron etiqueta).
    // Una sola query al DB con los orderIds actuales.
    const shopifyOrderIds = shopifyOrders.map((o) => o.orderId);
    let labelsByOrder = new Set<string>();
    if (shopifyOrderIds.length > 0) {
      const existing = await prisma.shippingLabel.findMany({
        where: { platform: "shopify", orderId: { in: shopifyOrderIds } },
        select: { orderId: true },
      });
      labelsByOrder = new Set(existing.map((l) => l.orderId));
    }
    const shopifyWithLabels = shopifyOrders.map((o) => ({
      ...o,
      hasLabel: labelsByOrder.has(o.orderId),
    }));

    return NextResponse.json({
      falabella: falabellaOrders,
      ripley: ripleyOrders,
      shopify: shopifyWithLabels,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
