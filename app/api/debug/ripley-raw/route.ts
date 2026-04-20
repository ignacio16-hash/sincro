import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { prisma } from "@/lib/db";

// Debug: dump raw OR11 (lista) y OR15 (detalle) para inspeccionar product_medias.
//
// Uso:
//   GET /api/debug/ripley-raw                  → trae OR11 + OR15 de la 1ra orden
//   GET /api/debug/ripley-raw?orderId=XYZ      → trae OR15 de esa orden puntual
//
// Devuelve también una vista resumida de qué líneas tienen / no tienen imagen.
export async function GET(req: NextRequest) {
  try {
    const cred = await prisma.apiCredential.findUnique({ where: { platform: "ripley" } });
    if (!cred?.config) return NextResponse.json({ error: "Ripley no configurado" }, { status: 400 });
    const conf = cred.config as Record<string, string>;
    if (!conf.apiKey || !conf.instanceUrl)
      return NextResponse.json({ error: "Falta apiKey/instanceUrl" }, { status: 400 });

    const client = axios.create({
      baseURL: conf.instanceUrl,
      headers: { Authorization: conf.apiKey },
      timeout: 20000,
    });

    const { searchParams } = new URL(req.url);
    let orderId = searchParams.get("orderId") || "";

    // OR11: lista las últimas 5 órdenes
    const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: list } = await client.get("/api/orders", {
      params: { max: 5, start_date: startDate },
    });
    const orders = list?.orders || [];
    if (!orderId && orders.length > 0) orderId = String(orders[0].order_id || "");

    // OR15: detalle de una orden
    let or15: unknown = null;
    let or15Error: string | null = null;
    if (orderId) {
      try {
        const { data } = await client.get(`/api/orders/${encodeURIComponent(orderId)}`);
        or15 = data;
      } catch (e) {
        or15Error = (e as Error).message;
      }
    }

    // Resumen: por orden, cuántas líneas tienen product_medias y cuántas no
    type Summary = {
      orderId: string;
      lineCount: number;
      withMedia: number;
      withoutMedia: number;
      sampleMedias: Record<string, string>[];
    };
    const summary: Summary[] = orders.map((o: Record<string, unknown>) => {
      const lines = (o.order_lines as Record<string, unknown>[]) || [];
      let withMedia = 0;
      let sample: Record<string, string>[] = [];
      for (const l of lines) {
        const m = (l.product_medias as Record<string, string>[]) || [];
        if (m.length > 0) {
          withMedia++;
          if (sample.length === 0) sample = m;
        }
      }
      return {
        orderId: String(o.order_id || ""),
        lineCount: lines.length,
        withMedia,
        withoutMedia: lines.length - withMedia,
        sampleMedias: sample,
      };
    });

    return NextResponse.json({
      or11Summary: summary,
      or15OrderId: orderId,
      or15Error,
      or15Keys: or15 && typeof or15 === "object" ? Object.keys(or15 as object) : null,
      or15Raw: or15,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
