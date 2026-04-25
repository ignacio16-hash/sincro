import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRipleySvcLabel } from "@/lib/ripley-svc";
import { getFalabellaShippingLabel } from "@/lib/falabella";
import { getParisShippingLabel } from "@/lib/paris";

export const dynamic = "force-dynamic";

// GET /api/orders/label?platform=ripley&orderId=X
// GET /api/orders/label?platform=falabella&orderItemIds=A,B,C
// GET /api/orders/label?platform=paris&subOrderNumber=X
// Returns the label as application/pdf
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const platform = searchParams.get("platform");
  const orderId = searchParams.get("orderId") || "";
  const orderItemIds = searchParams.get("orderItemIds") || "";
  const subOrderNumber = searchParams.get("subOrderNumber") || "";

  try {
    if (platform === "ripley") {
      if (!orderId) return NextResponse.json({ error: "orderId requerido" }, { status: 400 });
      // Ripley: las etiquetas están en SVC (sellercenter.ripleylabs.com), NO en Mirakl.
      const svcCred = await prisma.apiCredential.findUnique({ where: { platform: "ripley_svc" } });
      const svcConf = svcCred?.config as Record<string, string> | undefined;
      if (!svcConf?.username || !svcConf?.password) {
        return NextResponse.json(
          { error: "Ripley SVC no configurado — agrega usuario/contraseña en Configuración" },
          { status: 400 }
        );
      }

      const { data, contentType } = await getRipleySvcLabel(
        svcConf.username,
        svcConf.password,
        orderId,
        svcConf.baseUrl
      );

      // SVC devuelve text/plain con base64 del PDF. Detectar y decodificar.
      let pdfBuffer: Buffer = data;
      const rawText = data.toString("utf-8").trim();
      const isBase64 = /^[A-Za-z0-9+/=\s]+$/.test(rawText) && rawText.length > 100;
      if (contentType.includes("text/plain") && isBase64) {
        pdfBuffer = Buffer.from(rawText.replace(/\s/g, ""), "base64");
      }

      return new Response(pdfBuffer.buffer as ArrayBuffer, {
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

    if (platform === "paris") {
      if (!subOrderNumber) return NextResponse.json({ error: "subOrderNumber requerido" }, { status: 400 });
      const parisCred = await prisma.apiCredential.findUnique({ where: { platform: "paris" } });
      const conf = parisCred?.config as Record<string, string> | undefined;
      if (!conf?.apiKey || !conf?.baseUrl)
        return NextResponse.json({ error: "Paris no configurado" }, { status: 400 });

      const { buffer, contentType } = await getParisShippingLabel(conf.apiKey, conf.baseUrl, subOrderNumber);
      return new Response(buffer.buffer as ArrayBuffer, {
        headers: {
          "Content-Type": contentType.includes("pdf") ? "application/pdf" : contentType,
          "Content-Disposition": `attachment; filename="etiqueta-paris-${subOrderNumber}.pdf"`,
        },
      });
    }

    return NextResponse.json({ error: "platform inválido (falabella|ripley|paris)" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
