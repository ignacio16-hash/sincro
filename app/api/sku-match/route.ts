import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAllBsaleSkus } from "@/lib/bsale";
import { getAllFalabellaSkus, getFalabellaStockForSkus } from "@/lib/falabella";
import { getAllRipleySkus } from "@/lib/ripley";

export async function GET() {
  try {
    const [bsaleCred, falabellaCred, ripleyCred] = await Promise.all([
      prisma.apiCredential.findUnique({ where: { platform: "bsale" } }),
      prisma.apiCredential.findUnique({ where: { platform: "falabella" } }),
      prisma.apiCredential.findUnique({ where: { platform: "ripley" } }),
    ]);

    if (!bsaleCred?.config) {
      return NextResponse.json({ error: "Bsale no configurado" }, { status: 400 });
    }

    const bsaleConf = bsaleCred.config as Record<string, string>;
    if (!bsaleConf.accessToken) {
      return NextResponse.json({ error: "Falta Access Token de Bsale" }, { status: 400 });
    }

    const officeId = bsaleConf.officeId ? parseInt(bsaleConf.officeId) : undefined;
    const falabellaConf = falabellaCred?.config as Record<string, string> | undefined;
    const ripleyConf = ripleyCred?.config as Record<string, string> | undefined;

    // Fetch Bsale first — su lista de SKUs alimenta la consulta a Falabella/GetStock
    // cuando GetProducts/FetchStock devuelven E009.
    const bsaleSkus = await getAllBsaleSkus(bsaleConf.accessToken, officeId);

    const [falabellaSkus, ripleySkus] = await Promise.all([
      (async () => {
        if (!falabellaConf?.apiKey || !falabellaConf?.userId) return [];
        const country = falabellaConf.country || "CL";
        try {
          return await getAllFalabellaSkus(falabellaConf.apiKey, falabellaConf.userId, country);
        } catch (e) {
          const msg = (e as Error).message;
          // E009 en GetProducts y FetchStock: fallback a GetStock con la lista de Bsale
          if (/E009|error 9:/i.test(msg) && bsaleSkus.length > 0) {
            console.warn("[Falabella] GetProducts y FetchStock denegados, usando GetStock con SKUs de Bsale");
            return getFalabellaStockForSkus(
              falabellaConf.apiKey,
              falabellaConf.userId,
              bsaleSkus.map((s) => s.sku),
              country
            );
          }
          throw e;
        }
      })(),
      ripleyConf?.apiKey && ripleyConf?.instanceUrl
        ? getAllRipleySkus(ripleyConf.apiKey, ripleyConf.instanceUrl)
        : Promise.resolve([]),
    ]);

    const bsaleMap = new Map(bsaleSkus.map((s) => [s.sku, s]));
    const falabellaMap = new Map(falabellaSkus.map((s) => [s.sku, s]));
    const ripleyMap = new Map(ripleySkus.map((s) => [s.sku, s]));

    function buildMatch<T extends { sku: string; name: string }>(
      marketSkus: T[],
      getExtra: (s: T) => Record<string, unknown>
    ) {
      const matched = marketSkus
        .filter((s) => bsaleMap.has(s.sku))
        .map((s) => ({ sku: s.sku, name: s.name || bsaleMap.get(s.sku)!.name, bsaleStock: bsaleMap.get(s.sku)!.stock, ...getExtra(s) }));
      const onlyMarket = marketSkus.filter((s) => !bsaleMap.has(s.sku));
      return { matched, onlyMarket };
    }

    const falabella = buildMatch(falabellaSkus, (s) => ({ falabellaStock: s.quantity }));
    const ripley = buildMatch(ripleySkus, (s) => ({ ripleyStock: (s as typeof s & { quantity: number }).quantity }));

    const allMarketSkus = new Set([...falabellaSkus.map((s) => s.sku), ...ripleySkus.map((s) => s.sku)]);
    const onlyBsale = bsaleSkus.filter((b) => !allMarketSkus.has(b.sku));

    return NextResponse.json({
      summary: {
        bsaleTotal: bsaleSkus.length,
        falabellaTotal: falabellaSkus.length,
        ripleyTotal: ripleySkus.length,
        falabellaMatched: falabella.matched.length,
        ripleyMatched: ripley.matched.length,
        onlyBsale: onlyBsale.length,
      },
      falabella: { matched: falabella.matched, onlyMarket: falabella.onlyMarket },
      ripley: { matched: ripley.matched, onlyMarket: ripley.onlyMarket },
      onlyBsale: onlyBsale.map((b) => ({ sku: b.sku, name: b.name, bsaleStock: b.stock })),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
