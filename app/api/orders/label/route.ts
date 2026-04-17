import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRipleyOrderDocuments, downloadRipleyOrderDocument } from "@/lib/ripley";
import { getFalabellaShippingLabel } from "@/lib/falabella";

export const dynamic = "force-dynamic";

// GET /api/orders/label?platform=ripley&orderId=X
// GET /api/orders/label?platform=falabella&orderItemIds=A,B,C
// Returns the label as application/pdf
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const platform = searchParams.get("platform");
  const orderId = searchParams.get("orderId") || "";
  const orderItemIds = searchParams.get("orderItemIds") || "";

  try {
    if (platform === "ripley") {
      if (!orderId) return NextResponse.json({ error: "orderId requerido" }, { status: 400 });
      const ripleyCred = await prisma.apiCredential.findUnique({ where: { platform: "ripley" } });
      const conf = ripleyCred?.config as Record<string, string> | undefined;
      if (!conf?.apiKey || !conf?.instanceUrl)
        return NextResponse.json({ error: "Ripley no configurado" }, { status: 400 });

      // OR72: list docs, find shipping label
      const docs = await getRipleyOrderDocuments(conf.apiKey, conf.instanceUrl, orderId);
      // Mirakl label types: SHIPPING_LABEL, SYSTEM_DELIVERY_BILL, or any doc if only one exists
      const labelDoc =
        docs.find((d) => d.type === "SHIPPING_LABEL") ||
        docs.find((d) => /label|etiqueta|guia|despacho/i.test(d.type)) ||
        docs[0];

      if (!labelDoc) {
        return NextResponse.json({ error: "No hay etiqueta disponible para esta orden" }, { status: 404 });
      }

      // OR73: download
      const buffer = await downloadRipleyOrderDocument(conf.apiKey, conf.instanceUrl, labelDoc.id);
      return new Response(buffer.buffer as ArrayBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="etiqueta-${orderId}.pdf"`,
        },
      });
    }

    if (platform === "falabella") {
      const ids = orderItemIds.split(",").filter(Boolean);
      if (!ids.length) return NextResponse.json({ error: "orderItemIds requerido" }, { status: 400 });
      const falabellaCred = await prisma.apiCredential.findUnique({ where: { platform: "falabella" } });
      const conf = falabellaCred?.config as Record<string, string> | undefined;
      if (!conf?.apiKey || !conf?.userId)
        return NextResponse.json({ error: "Falabella no configurado" }, { status: 400 });

      const base64 = await getFalabellaShippingLabel(conf.apiKey, conf.userId, ids, conf.country || "CL");
      const buffer = Buffer.from(base64, "base64");
      return new Response(buffer.buffer as ArrayBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="etiqueta-falabella.pdf"`,
        },
      });
    }

    return NextResponse.json({ error: "platform inválido (falabella|ripley)" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
