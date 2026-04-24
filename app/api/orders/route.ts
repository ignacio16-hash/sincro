import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRipleyOrders } from "@/lib/ripley";
import { getFalabellaOrdersList } from "@/lib/falabella";
import { getShopifyOrders, type ShopifyOrder } from "@/lib/shopify";
import { getParisOrdersList, type ParisOrder } from "@/lib/paris";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [falabellaCred, ripleyCred, shopifyCred, parisCred] = await Promise.all([
      prisma.apiCredential.findUnique({ where: { platform: "falabella" } }),
      prisma.apiCredential.findUnique({ where: { platform: "ripley" } }),
      prisma.apiCredential.findUnique({ where: { platform: "shopify" } }),
      prisma.apiCredential.findUnique({ where: { platform: "paris" } }),
    ]);

    const falabellaConf = falabellaCred?.config as Record<string, string> | undefined;
    const ripleyConf = ripleyCred?.config as Record<string, string> | undefined;
    const shopifyConf = shopifyCred?.config as Record<string, string> | undefined;
    const parisConf = parisCred?.config as Record<string, string> | undefined;

    // Fetch from configured marketplaces in parallel
    const [falabellaOrders, ripleyOrders, shopifyOrders, parisOrders] = await Promise.all([
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

      parisConf?.apiKey && parisConf?.baseUrl
        ? getParisOrdersList(parisConf.apiKey, parisConf.baseUrl, { limit: 50, sinceDays: 30 })
            .catch((e) => { console.error("[Orders] Paris:", e.message); return [] as ParisOrder[]; })
        : Promise.resolve([] as ParisOrder[]),
    ]);

    // Anotar pedidos de Shopify con:
    //   · hasLabel    → ya subieron etiqueta PDF
    //   · isShipped   → marcado local como enviado
    //   · shippedAt/By → metadatos del envío (si aplica)
    // Dos queries paralelas al DB con los orderIds actuales.
    const shopifyOrderIds = shopifyOrders.map((o) => o.orderId);
    let labelsByOrder = new Set<string>();
    let shipmentsByOrder = new Map<string, { shippedAt: Date; shippedBy: string }>();
    if (shopifyOrderIds.length > 0) {
      const [labels, shipments] = await Promise.all([
        prisma.shippingLabel.findMany({
          where: { platform: "shopify", orderId: { in: shopifyOrderIds } },
          select: { orderId: true },
        }),
        prisma.orderShipment.findMany({
          where: { platform: "shopify", orderId: { in: shopifyOrderIds } },
          select: { orderId: true, shippedAt: true, shippedBy: true },
        }),
      ]);
      labelsByOrder = new Set(labels.map((l) => l.orderId));
      shipmentsByOrder = new Map(
        shipments.map((s) => [s.orderId, { shippedAt: s.shippedAt, shippedBy: s.shippedBy }])
      );
    }
    const shopifyWithMeta = shopifyOrders.map((o) => {
      const ship = shipmentsByOrder.get(o.orderId);
      return {
        ...o,
        hasLabel: labelsByOrder.has(o.orderId),
        isShipped: !!ship,
        shippedAt: ship?.shippedAt?.toISOString() ?? null,
        shippedBy: ship?.shippedBy ?? null,
      };
    });

    return NextResponse.json({
      falabella: falabellaOrders,
      ripley: ripleyOrders,
      shopify: shopifyWithMeta,
      paris: parisOrders,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
