import axios from "axios";

// Paris / Cencosud Marketplace API (Eiffel)
// Docs: https://developers.ecomm.cencosud.com/docs
// OpenAPI: https://back-dev-portal.ecomm.cencosud.com/documentations
//
// Auth: POST /v1/auth/apiKey con header "Authorization: Bearer <API_KEY>"
//   → responde { accessToken, expiresIn (seg., típico 14400 = 4h) }.
// Todas las demás requests usan "Authorization: Bearer <accessToken>".
//
// Endpoints usados por esta integración:
//   · POST /v1/stock/sku-seller   → actualiza stock usando NUESTRO SKU
//   · GET  /v2/stock              → lee stock (paginado, para match de catálogo)
//   · GET  /v1/orders             → lista órdenes con items + sub-órdenes

// URLs confirmadas en los x-codeSamples (cURL/Python/PHP/Java) del OpenAPI
// público de Cencosud. `servers` del spec apunta a stg, pero las muestras de
// código de cada endpoint usan la URL productiva.
export const PARIS_PROD_BASE_URL = "https://api-developers.ecomm.cencosud.com";
export const PARIS_STG_BASE_URL = "https://api-developers.ecomm-stg.cencosud.com";
export const PARIS_DEFAULT_BASE_URL = PARIS_PROD_BASE_URL;

// ─── Auth ────────────────────────────────────────────────────────────────────

interface TokenCacheEntry {
  token: string;
  expiresAt: number; // epoch ms
}

// Cache in-memory por (apiKey + baseUrl). Evita pedir un accessToken nuevo
// cada request — la doc recomienda reutilizar por 4h.
const tokenCache = new Map<string, TokenCacheEntry>();

function cacheKey(apiKey: string, baseUrl: string): string {
  return `${baseUrl}::${apiKey}`;
}

export async function parisLogin(apiKey: string, baseUrl: string): Promise<string> {
  const key = cacheKey(apiKey, baseUrl);
  const cached = tokenCache.get(key);
  const now = Date.now();
  // Renovamos 5 min antes de la expiración para evitar races.
  if (cached && cached.expiresAt > now + 5 * 60 * 1000) return cached.token;

  const base = baseUrl.replace(/\/+$/, "");
  const { data } = await axios.post(
    `${base}/v1/auth/apiKey`,
    {},
    {
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    }
  );
  const token = String(data?.accessToken || "");
  const expiresIn = Number(data?.expiresIn || 14400);
  if (!token) throw new Error("Paris auth: respuesta sin accessToken");
  tokenCache.set(key, { token, expiresAt: now + expiresIn * 1000 });
  return token;
}

async function authedClient(apiKey: string, baseUrl: string) {
  const accessToken = await parisLogin(apiKey, baseUrl);
  return axios.create({
    baseURL: baseUrl.replace(/\/+$/, ""),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    timeout: 20000,
  });
}

// ─── Stock ───────────────────────────────────────────────────────────────────

// POST /v1/stock/sku-seller — body: { skus: [{ sku_seller, quantity }] }
// Doc: "Carga el stock de un producto nuevo o actualiza el stock de un producto
// existente a través del sku-seller."
// Dividimos en batches para no pasarnos con payloads gigantes. El endpoint no
// documenta límite explícito; 200 por batch es conservador.
export async function batchUpdateParisStock(
  apiKey: string,
  baseUrl: string,
  items: { sku: string; quantity: number }[]
): Promise<{ success: string[]; failed: string[]; errorMessages: string[] }> {
  const success: string[] = [];
  const failed: string[] = [];
  const errorMessages: string[] = [];
  if (items.length === 0) return { success, failed, errorMessages };

  const client = await authedClient(apiKey, baseUrl);
  const BATCH = 200;

  for (let i = 0; i < items.length; i += BATCH) {
    const chunk = items.slice(i, i + BATCH);
    const body = {
      skus: chunk.map((it) => ({ sku_seller: it.sku, quantity: it.quantity })),
    };
    try {
      await client.post("/v1/stock/sku-seller", body);
      success.push(...chunk.map((it) => it.sku));
    } catch (err) {
      const detail = axios.isAxiosError(err)
        ? JSON.stringify(err.response?.data ?? err.message).slice(0, 300)
        : (err as Error).message;
      console.warn(`[Paris UpdateStock] batch ${i}-${i + chunk.length} error:`, detail);
      errorMessages.push(`batch ${i}: ${detail}`);
      failed.push(...chunk.map((it) => it.sku));
    }
  }
  return { success, failed, errorMessages };
}

// GET /v2/stock — paginado. Devuelve stock real por sku-seller.
// Útil para el refresh de catálogo: sabemos qué SKUs nuestros están en Paris.
export async function getAllParisSkus(
  apiKey: string,
  baseUrl: string
): Promise<{ sku: string; quantity: number }[]> {
  const client = await authedClient(apiKey, baseUrl);
  const LIMIT = 100;
  let offset = 0;
  const out: { sku: string; quantity: number }[] = [];

  while (true) {
    const { data } = await client.get("/v2/stock", { params: { limit: LIMIT, offset } });
    const raw = data?.data ?? data?.items ?? data?.skus ?? [];
    const list: Record<string, unknown>[] = Array.isArray(raw) ? raw : [];
    for (const item of list) {
      // sku_seller es nuestro SKU; sku es el que asigna Paris. Usamos el nuestro
      // para el match con Bsale.
      const sku = String(item.sku_seller ?? item.skuSeller ?? item.sku ?? "");
      const qty = Number(item.quantity ?? item.stock ?? 0) || 0;
      if (sku) out.push({ sku, quantity: qty });
    }
    if (list.length < LIMIT) break;
    offset += LIMIT;
    // Safety: tope a 10k SKUs para evitar loops infinitos en respuestas mal formadas.
    if (offset > 10000) break;
  }
  return out;
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export interface ParisOrderItem {
  itemId: string;
  sku: string;          // seller SKU (nuestro)
  parisSku: string;     // SKU asignado por Paris
  name: string;
  quantity: number;
  price: number;
  status: string;       // nombre del estado del item
  imageUrl: string | null;
}

export interface ParisSubOrder {
  subOrderNumber: string;
  status: string;               // nombre del estado de la sub-orden
  statusId: number | null;
  carrier: string | null;
  trackingNumber: string | null;
  dispatchDate: string | null;  // fecha tope de despacho
  items: ParisOrderItem[];
}

export interface ParisOrder {
  orderId: string;             // originOrderNumber (el que ve el vendedor)
  orderNumber: string;         // internal UUID
  createdAt: string;
  customerName: string | null;
  subOrders: ParisSubOrder[];
}

// Estados que consideramos "ya enviado / cerrado" — los excluimos al contar
// pendientes en la pestaña del front. Nombres observados en la doc:
// "delivered", "shipped", "cancelled", "returned". El match es case-insensitive
// y solo por substring para tolerar variantes ("delivered_to_customer", etc.).
const CLOSED_STATES = ["delivered", "shipped", "cancelled", "canceled", "returned", "entregado", "enviado", "cancelado"];

export function isParisItemPending(statusName: string): boolean {
  const s = (statusName || "").toLowerCase();
  return !CLOSED_STATES.some((k) => s.includes(k));
}

function extractOrderItems(subOrder: Record<string, unknown>): ParisOrderItem[] {
  const raw = subOrder.items;
  const list: Record<string, unknown>[] = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
  return list.map((item) => {
    const status = item.status as Record<string, unknown> | undefined;
    return {
      itemId: String(item.id ?? ""),
      sku: String(item.sellerSku ?? item.seller_sku ?? ""),
      parisSku: String(item.sku ?? ""),
      name: String(item.name ?? ""),
      quantity: 1, // la API NO devuelve cantidad por item — cada línea es 1 unidad.
      price: Number(item.priceAfterDiscounts ?? item.grossPrice ?? item.basePrice ?? 0) || 0,
      status: String(status?.name ?? item.statusId ?? ""),
      imageUrl: (item.imagePath as string) || null,
    };
  });
}

// GET /v1/orders — órdenes con subOrders[].items[].
// Params: gteCreatedAt/lteCreatedAt para acotar ventana; orderByDispatchDate
// para ordenar. La doc NO expone ordenar por createdAt, así que ordenamos en
// memoria por createdAt desc.
export async function getParisOrdersList(
  apiKey: string,
  baseUrl: string,
  opts: { limit?: number; sinceDays?: number } = {}
): Promise<ParisOrder[]> {
  const client = await authedClient(apiKey, baseUrl);
  const limit = opts.limit ?? 50;
  const sinceDays = opts.sinceDays ?? 30;

  const gteCreatedAt = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10); // yyyy-mm-dd

  const { data } = await client.get("/v1/orders", {
    params: { gteCreatedAt, limit, offset: 0 },
  });

  const raw = data?.data ?? [];
  const orders: Record<string, unknown>[] = Array.isArray(raw) ? raw : [];

  const results: ParisOrder[] = orders.map((o) => {
    const customer = o.customer as Record<string, unknown> | undefined;
    const subOrdersRaw = o.subOrders;
    const subOrdersList: Record<string, unknown>[] = Array.isArray(subOrdersRaw)
      ? (subOrdersRaw as Record<string, unknown>[])
      : [];
    const subOrders: ParisSubOrder[] = subOrdersList.map((so) => {
      const status = so.status as Record<string, unknown> | undefined;
      return {
        subOrderNumber: String(so.subOrderNumber ?? ""),
        status: String(status?.name ?? ""),
        statusId: status?.id != null ? Number(status.id) : (so.statusId != null ? Number(so.statusId) : null),
        carrier: (so.carrier as string) || null,
        trackingNumber: (so.trackingNumber as string) || null,
        dispatchDate: (so.dispatchDate as string) || null,
        items: extractOrderItems(so),
      };
    });

    return {
      orderId: String(o.originOrderNumber ?? o.id ?? ""),
      orderNumber: String(o.id ?? ""),
      createdAt: String(o.createdAt ?? o.originOrderDate ?? ""),
      customerName: (customer?.name as string) || null,
      subOrders,
    };
  });

  results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return results;
}

// Para el polling de ventas: devuelve pares (orderId, sku, quantity) de todas
// las sub-órdenes cuyo estado NO está cerrado todavía. Agrupamos por (orderId,
// sku) sumando las líneas (la API devuelve una línea por unidad).
export async function getPendingParisOrders(
  apiKey: string,
  baseUrl: string
): Promise<{ orderId: string; sku: string; quantity: number }[]> {
  // Solo últimos 2 días para el polling — lo que sea más viejo ya debería
  // haberse procesado y la ventana de cancelación está cerrada.
  const orders = await getParisOrdersList(apiKey, baseUrl, { sinceDays: 2, limit: 100 });
  const agg = new Map<string, { orderId: string; sku: string; quantity: number }>();
  for (const ord of orders) {
    for (const so of ord.subOrders) {
      for (const it of so.items) {
        if (!it.sku) continue;
        if (!isParisItemPending(it.status)) continue;
        const key = `${ord.orderId}::${it.sku}`;
        const prev = agg.get(key);
        if (prev) prev.quantity += it.quantity;
        else agg.set(key, { orderId: ord.orderId, sku: it.sku, quantity: it.quantity });
      }
    }
  }
  return [...agg.values()];
}

// ─── Etiqueta de envío ───────────────────────────────────────────────────────
// Flujo confirmado en el OpenAPI:
//   1. GET /v2/shipments/{subOrderNumber} → array de ShipmentDetailResponseDto
//      con `labelUrl` (URL pública del PDF en GCS) y/o `labelId`.
//   2. Descargamos el PDF de esa URL y lo retornamos como buffer.
//
// Si `labelUrl` no viene pero sí `labelId`, caemos al endpoint
// GET /v1/sub-orders/{labelId}/print-label que retorna el mismo objeto con URL.
export async function getParisShippingLabel(
  apiKey: string,
  baseUrl: string,
  subOrderNumber: string
): Promise<{ buffer: Buffer; contentType: string }> {
  const client = await authedClient(apiKey, baseUrl);

  // 1. Pedimos el detalle de envío de la sub-orden.
  const { data: shipments } = await client.get(
    `/v2/shipments/${encodeURIComponent(subOrderNumber)}`
  );
  const list = Array.isArray(shipments) ? shipments : [];
  let url = "";
  let labelId = "";
  for (const sh of list as Record<string, unknown>[]) {
    const u = String(sh.labelUrl ?? "");
    const lid = String(sh.labelId ?? "");
    if (u) { url = u; break; }
    if (!labelId && lid) labelId = lid;
  }

  // 2. Fallback: si no hay labelUrl directo, usar /v1/sub-orders/{labelId}/print-label.
  if (!url && labelId) {
    const { data } = await client.get(
      `/v1/sub-orders/${encodeURIComponent(labelId)}/print-label`
    );
    const arr = Array.isArray(data?.data) ? data.data : [];
    for (const it of arr as Record<string, unknown>[]) {
      const u = String(it.url ?? it.labels ?? "");
      if (u) { url = u; break; }
    }
  }

  if (!url) {
    throw new Error("Paris no devolvió URL de etiqueta para esta sub-orden");
  }

  // 3. Descargar el PDF. Las URLs son de Google Cloud Storage / Envíame, públicas.
  const pdfRes = await axios.get<ArrayBuffer>(url, { responseType: "arraybuffer" });
  const ct = String(pdfRes.headers["content-type"] || "application/pdf");
  return { buffer: Buffer.from(pdfRes.data), contentType: ct };
}

// Ping ligero para el botón "Verificar conexión" — hace login y pide 1 orden.
export async function testParisConnection(
  apiKey: string,
  baseUrl: string
): Promise<{ ok: boolean; message: string }> {
  try {
    const client = await authedClient(apiKey, baseUrl);
    const { data } = await client.get("/v1/orders", { params: { limit: 1 } });
    const count = Number(data?.count ?? (Array.isArray(data?.data) ? data.data.length : 0));
    return { ok: true, message: `Conectado — ${count} orden(es) en la cuenta` };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const s = err.response?.status;
      if (s === 401 || s === 403) return { ok: false, message: "API Key inválida o sin permisos" };
      const body = err.response?.data;
      const msg = (body as Record<string, unknown>)?.message || err.message;
      return { ok: false, message: `Error ${s ?? "de red"}: ${String(msg).slice(0, 200)}` };
    }
    return { ok: false, message: (err as Error).message };
  }
}
