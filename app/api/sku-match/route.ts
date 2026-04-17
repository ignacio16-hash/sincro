import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAllBsaleSkus } from "@/lib/bsale";
import { getAllFalabellaSkus } from "@/lib/falabella";

export async function GET() {
  try {
    const [bsaleCred, falabellaCred] = await Promise.all([
      prisma.apiCredential.findUnique({ where: { platform: "bsale" } }),
      prisma.apiCredential.findUnique({ where: { platform: "falabella" } }),
    ]);

    if (!bsaleCred?.config) {
      return NextResponse.json({ error: "Bsale no configurado" }, { status: 400 });
    }
    if (!falabellaCred?.config) {
      return NextResponse.json({ error: "Falabella no configurado" }, { status: 400 });
    }

    const bsaleConf = bsaleCred.config as Record<string, string>;
    const falabellaConf = falabellaCred.config as Record<string, string>;

    if (!bsaleConf.accessToken) {
      return NextResponse.json({ error: "Falta Access Token de Bsale" }, { status: 400 });
    }
    if (!falabellaConf.apiKey || !falabellaConf.userId) {
      return NextResponse.json({ error: "Faltan credenciales de Falabella" }, { status: 400 });
    }

    const officeId = bsaleConf.officeId ? parseInt(bsaleConf.officeId) : undefined;

    const [bsaleSkus, falabellaSkus] = await Promise.all([
      getAllBsaleSkus(bsaleConf.accessToken, officeId),
      getAllFalabellaSkus(falabellaConf.apiKey, falabellaConf.userId, falabellaConf.country || "CL"),
    ]);

    const bsaleMap = new Map(bsaleSkus.map((s) => [s.sku, s]));
    const falabellaMap = new Map(falabellaSkus.map((s) => [s.sku, s]));

    const matched = falabellaSkus
      .filter((f) => bsaleMap.has(f.sku))
      .map((f) => ({
        sku: f.sku,
        name: f.name || bsaleMap.get(f.sku)!.name,
        bsaleStock: bsaleMap.get(f.sku)!.stock,
        falabellaStock: f.quantity,
      }));

    const onlyFalabella = falabellaSkus
      .filter((f) => !bsaleMap.has(f.sku))
      .map((f) => ({ sku: f.sku, name: f.name, falabellaStock: f.quantity }));

    const onlyBsale = bsaleSkus
      .filter((b) => !falabellaMap.has(b.sku))
      .map((b) => ({ sku: b.sku, name: b.name, bsaleStock: b.stock }));

    return NextResponse.json({
      summary: {
        bsaleTotal: bsaleSkus.length,
        falabellaTotal: falabellaSkus.length,
        matched: matched.length,
        onlyFalabella: onlyFalabella.length,
        onlyBsale: onlyBsale.length,
      },
      matched,
      onlyFalabella,
      onlyBsale,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
