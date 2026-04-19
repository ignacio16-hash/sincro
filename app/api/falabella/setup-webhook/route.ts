import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  getFalabellaWebhookEntities,
  getFalabellaWebhooks,
  createFalabellaWebhook,
} from "@/lib/falabella";

// GET → lista eventos disponibles + webhooks registrados (para diagnóstico).
// POST → registra un webhook que apunta a /api/webhooks/falabella.
//   Body opcional: { events: ["order_created"], callbackUrl?: "...", baseUrl?: "..." }
//   Si no se pasan, usa eventos detectados automáticamente y la URL pública
//   deducida del request.
export async function GET(req: NextRequest) {
  const cred = await prisma.apiCredential.findUnique({ where: { platform: "falabella" } });
  const conf = cred?.config as Record<string, string> | undefined;
  if (!conf?.apiKey || !conf?.userId) {
    return NextResponse.json({ error: "Falabella no configurado" }, { status: 400 });
  }
  const country = conf.country || "CL";

  // ?register=1 → registra el webhook directamente (sin POST).
  //   También acepta ?events=onOrderCreated,onOrderItemsStatusChanged
  if (req.nextUrl.searchParams.get("register") === "1") {
    const eventsParam = req.nextUrl.searchParams.get("events");
    const events = eventsParam ? eventsParam.split(",").map((s) => s.trim()).filter(Boolean) : ["onOrderCreated"];
    const callbackUrl = `${req.nextUrl.origin}/api/webhooks/falabella`;
    try {
      const result = await createFalabellaWebhook(conf.apiKey, conf.userId, callbackUrl, events, country);
      return NextResponse.json({ ok: true, callbackUrl, events, result });
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message, callbackUrl, events }, { status: 500 });
    }
  }

  try {
    const [entities, hooks] = await Promise.all([
      getFalabellaWebhookEntities(conf.apiKey, conf.userId, country),
      getFalabellaWebhooks(conf.apiKey, conf.userId, country),
    ]);
    return NextResponse.json({ entities, hooks });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const cred = await prisma.apiCredential.findUnique({ where: { platform: "falabella" } });
  const conf = cred?.config as Record<string, string> | undefined;
  if (!conf?.apiKey || !conf?.userId) {
    return NextResponse.json({ error: "Falabella no configurado" }, { status: 400 });
  }
  const country = conf.country || "CL";

  let body: { events?: string[]; callbackUrl?: string } = {};
  try {
    body = await req.json();
  } catch {}

  // Deducir callback URL a partir del request si no se pasa explícito
  const origin = req.nextUrl.origin;
  const callbackUrl = body.callbackUrl || `${origin}/api/webhooks/falabella`;

  // Si no se pasan eventos, intentar auto-descubrir uno de orden
  let events = body.events;
  if (!events || events.length === 0) {
    try {
      const entities = await getFalabellaWebhookEntities(conf.apiKey, conf.userId, country) as Record<string, unknown>;
      // Navegar la respuesta para extraer nombres que parezcan "order_*"
      const found = extractOrderEventNames(entities);
      events = found.length > 0 ? found : ["order_created"]; // fallback convencional
    } catch {
      events = ["order_created"];
    }
  }

  try {
    const result = await createFalabellaWebhook(conf.apiKey, conf.userId, callbackUrl, events, country);
    return NextResponse.json({ ok: true, callbackUrl, events, result });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message, callbackUrl, events }, { status: 500 });
  }
}

function extractOrderEventNames(obj: unknown): string[] {
  const results: string[] = [];
  function walk(node: unknown) {
    if (!node) return;
    if (typeof node === "string") {
      if (/order[_-]?(created|pending|new)|new[_-]?order/i.test(node)) results.push(node);
      return;
    }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node === "object") { Object.values(node as Record<string, unknown>).forEach(walk); }
  }
  walk(obj);
  return [...new Set(results)];
}
