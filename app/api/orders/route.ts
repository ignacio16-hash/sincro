import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRipleyOrders } from "@/lib/ripley";
import { getFalabellaOrdersList } from "@/lib/falabella";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [falabellaCred, ripleyCred] = await Promise.all([
      prisma.apiCredential.findUnique({ where: { platform: "falabella" } }),
      prisma.apiCredential.findUnique({ where: { platform: "ripley" } }),
    ]);

    const falabellaConf = falabellaCred?.config as Record<string, string> | undefined;
    const ripleyConf = ripleyCred?.config as Record<string, string> | undefined;

    // Fetch from configured marketplaces in parallel
    const [falabellaOrders, ripleyOrders] = await Promise.all([
      falabellaConf?.apiKey && falabellaConf?.userId
        ? getFalabellaOrdersList(falabellaConf.apiKey, falabellaConf.userId, falabellaConf.country || "CL")
            .catch((e) => { console.error("[Orders] Falabella:", e.message); return []; })
        : Promise.resolve([]),

      ripleyConf?.apiKey && ripleyConf?.instanceUrl
        ? getRipleyOrders(ripleyConf.apiKey, ripleyConf.instanceUrl, undefined, 50)
            .catch((e) => { console.error("[Orders] Ripley:", e.message); return []; })
        : Promise.resolve([]),
    ]);

    return NextResponse.json({
      falabella: falabellaOrders,
      ripley: ripleyOrders,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
