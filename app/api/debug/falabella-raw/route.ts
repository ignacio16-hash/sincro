import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import crypto from "crypto";
import { prisma } from "@/lib/db";

// Debug endpoint: hace un GetStock crudo a Falabella con los primeros SKUs
// guardados en StockItem y devuelve el JSON tal cual lo entregó la API.
// Uso: GET /api/debug/falabella-raw?skus=SKU1,SKU2,SKU3
export async function GET(req: NextRequest) {
  try {
    const cred = await prisma.apiCredential.findUnique({ where: { platform: "falabella" } });
    if (!cred?.config) return NextResponse.json({ error: "Falabella no configurado" }, { status: 400 });
    const conf = cred.config as Record<string, string>;
    if (!conf.apiKey || !conf.userId) return NextResponse.json({ error: "Falta apiKey/userId" }, { status: 400 });

    const { searchParams } = new URL(req.url);
    let skus = (searchParams.get("skus") || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (skus.length === 0) {
      const items = await prisma.stockItem.findMany({ take: 3, select: { sku: true } });
      skus = items.map((i) => i.sku);
    }
    if (skus.length === 0) return NextResponse.json({ error: "No hay SKUs para probar" }, { status: 400 });
    skus = skus.slice(0, 5);

    const timestamp = new Date().toISOString().replace(/\.\d+Z$/, "+00:00");
    const params: Record<string, string> = {
      Action: "GetStock",
      UserID: conf.userId.trim(),
      Version: "1.0",
      Timestamp: timestamp,
      Format: "JSON",
      SellerSku: JSON.stringify(skus),
      Limit: String(skus.length),
    };
    const sorted = Object.keys(params).sort();
    const toSign = sorted.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join("&");
    params.Signature = crypto.createHmac("sha256", conf.apiKey.trim()).update(toSign).digest("hex");
    const qs = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");

    const { data } = await axios.get(`https://sellercenter-api.falabella.com/?${qs}`, {
      headers: { "User-Agent": `SincroStock/${conf.userId.trim()}/Node.js/1.0` },
      timeout: 20000,
    });

    return NextResponse.json({ skusRequested: skus, raw: data });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
