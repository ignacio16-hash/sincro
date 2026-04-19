import axios from "axios";
import crypto from "crypto";

// Falabella Seller Center API
// Docs: https://developers.falabella.com/v500.0.0/reference
// Auth: HMAC-SHA256 signed query params (NOT Authorization header)
// Base URL: https://sellercenter-api.falabella.com/ (linio.cl deprecated)

const BASE_URLS: Record<string, string> = {
  CL: "https://sellercenter-api.falabella.com/",
  PE: "https://sellercenter-api.falabella.com/",
  CO: "https://sellercenter-api.falabella.com/",
  MX: "https://sellercenter-api.falabella.com/",
};

// Lazada/Falabella Seller Center signature (official PHP SDK algorithm):
//   1. Sort params alphabetically by key
//   2. rawurlencode each key AND value
//   3. Join with "&"
//   4. HMAC-SHA256 with API key → lowercase hex
// Ref: https://sellercenter-api.falabella.com/ uses the Lazada Seller Center spec.
function buildSignature(
  params: Record<string, string>,
  apiKey: string
): string {
  const sorted = Object.keys(params).sort();
  const toSign = sorted
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join("&");
  return crypto.createHmac("sha256", apiKey.trim()).update(toSign).digest("hex");
}

function buildSignedUrl(
  baseUrl: string,
  action: string,
  userId: string,
  apiKey: string,
  extra: Record<string, string> = {}
): string {
  // RFC 3339 with colon in timezone: 2026-04-18T12:00:00+00:00
  const timestamp = new Date().toISOString().replace(/\.\d+Z$/, "+00:00");
  const params: Record<string, string> = {
    Action: action,
    UserID: userId.trim(),
    Version: "1.0",
    Timestamp: timestamp,
    Format: "JSON",
    ...extra,
  };
  params.Signature = buildSignature(params, apiKey);
  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return `${baseUrl}?${qs}`;
}

// GET client: no Content-Type (matches test-connection behaviour).
// Sending Content-Type: application/x-www-form-urlencoded on a GET request
// can cause Falabella's server to compute a different signature → E007.
function getClient(userId: string) {
  return axios.create({
    headers: { "User-Agent": `SincroStock/${userId.trim()}/Node.js/1.0` },
    timeout: 20000,
  });
}

// ─── Stock ───────────────────────────────────────────────────────────────────

// Update stock via UpdateStock XML feed.
// Docs: https://developers.falabella.com/v500.0.0/reference/updatestock
// Action=UpdateStock (no ProductUpdate). Fields: SellerSKU, Quantity.
export async function updateFalabellaStock(
  apiKey: string,
  userId: string,
  sku: string,
  quantity: number,
  country = "CL"
): Promise<string> {
  const baseUrl = BASE_URLS[country] || BASE_URLS.CL;
  const url = buildSignedUrl(baseUrl, "UpdateStock", userId, apiKey);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Request>
  <Product>
    <SellerSKU>${xmlEscape(sku)}</SellerSKU>
    <Quantity>${quantity}</Quantity>
  </Product>
</Request>`;
  const client = getClient(userId);
  const { data } = await client.post(url, `payload=${encodeURIComponent(xml)}`, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return data?.FeedID || data?.Body?.FeedID || "";
}

export async function getFalabellaStock(
  apiKey: string,
  userId: string,
  sku: string,
  country = "CL"
): Promise<number> {
  const baseUrl = BASE_URLS[country] || BASE_URLS.CL;
  // GetProducts usa SkuSellerList (array JSON), no SellerSku.
  const url = buildSignedUrl(baseUrl, "GetProducts", userId, apiKey, {
    SkuSellerList: JSON.stringify([sku]),
  });
  const client = getClient(userId);
  const { data } = await client.get(url);
  const products = data?.SuccessResponse?.Body?.Products?.Product || [];
  const product = Array.isArray(products) ? products[0] : products;
  return parseInt(product?.Quantity || "0", 10);
}

// GetProducts para una lista de SKUs → retorna imagen + nombre + stock.
// Docs: https://developers.falabella.com/v500.0.0/reference/getproducts
// Param: SkuSellerList (array JSON). Response: Products.Product[] con Images.Image[].
export async function getFalabellaProductsInfo(
  apiKey: string,
  userId: string,
  skus: string[],
  country = "CL"
): Promise<Map<string, { name: string; imageUrl: string | null; quantity: number }>> {
  const result = new Map<string, { name: string; imageUrl: string | null; quantity: number }>();
  if (skus.length === 0) return result;
  const baseUrl = BASE_URLS[country] || BASE_URLS.CL;
  const client = getClient(userId);
  const BATCH = 50;

  for (let i = 0; i < skus.length; i += BATCH) {
    const chunk = skus.slice(i, i + BATCH);
    const url = buildSignedUrl(baseUrl, "GetProducts", userId, apiKey, {
      SkuSellerList: JSON.stringify(chunk),
      Limit: "1000",
    });
    try {
      const { data } = await client.get(url);
      const errorCode = data?.Head?.ErrorCode ?? data?.ErrorResponse?.Head?.ErrorCode;
      if (errorCode) continue; // silencioso — endpoint puede no estar habilitado
      const raw =
        data?.SuccessResponse?.Body?.Products?.Product ??
        data?.Body?.Products?.Product;
      const products: Record<string, unknown>[] = Array.isArray(raw)
        ? raw : raw && typeof raw === "object" ? [raw as Record<string, unknown>] : [];

      for (const p of products) {
        const sku = String(p.SellerSku || "");
        if (!sku) continue;
        // Images puede venir como {Image: [...]} o {Image: "url"} o array directo
        const imagesContainer = p.Images as Record<string, unknown> | undefined;
        let imageUrl: string | null = null;
        if (imagesContainer) {
          const imgNode = imagesContainer.Image;
          if (Array.isArray(imgNode)) imageUrl = String(imgNode[0] || "") || null;
          else if (typeof imgNode === "string") imageUrl = imgNode;
          else if (imgNode && typeof imgNode === "object") imageUrl = String((imgNode as Record<string, unknown>).Url || "") || null;
        }
        result.set(sku, {
          name: String(p.Name || ""),
          imageUrl,
          quantity: parseInt(String(p.Quantity ?? "0"), 10),
        });
      }
    } catch {
      // continúa con el siguiente batch
    }
  }

  return result;
}

// GetStock — consulta stock de una lista específica de SellerSkus.
// Docs: https://developers.falabella.com/v500.0.0/reference/getstock
// LÍMITE OFICIAL: máximo 5 SKUs por request (param SellerSku = array JSON).
// Uso: cuando GetProducts/FetchStock retornan E009 (permisos), pero GetStock sí funciona.
export async function getFalabellaStockForSkus(
  apiKey: string,
  userId: string,
  skus: string[],
  country = "CL",
  facilityId?: string
): Promise<{ sku: string; name: string; quantity: number }[]> {
  if (skus.length === 0) return [];
  const baseUrl = BASE_URLS[country] || BASE_URLS.CL;
  const client = getClient(userId);
  const results: { sku: string; name: string; quantity: number }[] = [];
  const BATCH = 5; // Falabella limit: GetStock acepta max 5 SellerSkus por request

  // Acumulador para sumar stock de múltiples facilities por SKU (sin FacilityId,
  // Falabella devuelve una entry por facility para cada SKU).
  const agg = new Map<string, { name: string; quantity: number }>();

  for (let i = 0; i < skus.length; i += BATCH) {
    const chunk = skus.slice(i, i + BATCH);
    const extra: Record<string, string> = {
      SellerSku: JSON.stringify(chunk),
      Limit: String(chunk.length),
    };
    if (facilityId) extra.FacilityId = facilityId;
    const url = buildSignedUrl(baseUrl, "GetStock", userId, apiKey, extra);
    const { data } = await client.get(url);

    const errorCode = data?.Head?.ErrorCode ?? data?.ErrorResponse?.Head?.ErrorCode;
    if (errorCode) {
      const msg = data?.Head?.ErrorMessage ?? data?.ErrorResponse?.Head?.ErrorMessage ?? JSON.stringify(data);
      throw new Error(`Falabella GetStock error ${errorCode}: ${msg}`);
    }

    // Shape real (confirmado): SuccessResponse.Body.Stocks.SellerWarehouses[]
    // Cada entry: { Sku, Quantity (string), FacilityID, SellerWarehouseId }
    const raw =
      data?.SuccessResponse?.Body?.Stocks?.SellerWarehouses ??
      data?.Body?.Stocks?.SellerWarehouses;

    if (raw == null && i === 0) {
      console.warn("[Falabella GetStock] shape inesperada:", JSON.stringify(data).slice(0, 500));
    }
    const items: Record<string, unknown>[] = Array.isArray(raw)
      ? raw : raw && typeof raw === "object" ? [raw as Record<string, unknown>] : [];

    for (const item of items) {
      const sku = String(item.Sku || item.SellerSku || item.ShopSku || "");
      if (!sku) continue;
      const qty = parseInt(String(item.Quantity ?? item.SellableStock ?? item.Available ?? "0"), 10) || 0;
      const prev = agg.get(sku);
      if (prev) prev.quantity += qty;
      else agg.set(sku, { name: String(item.Name || ""), quantity: qty });
    }
  }

  for (const [sku, { name, quantity }] of agg) results.push({ sku, name, quantity });
  return results;
}

// Fetch SKUs via FetchStock — bulk endpoint, NO pagination params (per docs sample).
// Returns all SellerSku + Available in one call.
async function getFalabellaSkusViaFetchStock(
  apiKey: string,
  userId: string,
  country: string
): Promise<{ sku: string; name: string; quantity: number }[]> {
  const baseUrl = BASE_URLS[country] || BASE_URLS.CL;
  const client = getClient(userId);

  // FetchStock: ONLY base params (Action, UserID, Version, Timestamp, Format) + Signature.
  // Any extra param (Limit, Offset, Filter) causes E009/signature issues in this endpoint.
  const url = buildSignedUrl(baseUrl, "FetchStock", userId, apiKey);
  const { data } = await client.get(url);

  const errorCode = data?.Head?.ErrorCode ?? data?.ErrorResponse?.Head?.ErrorCode;
  if (errorCode) {
    const msg = data?.Head?.ErrorMessage ?? data?.ErrorResponse?.Head?.ErrorMessage ?? JSON.stringify(data);
    throw new Error(`Falabella FetchStock error ${errorCode}: ${msg}`);
  }

  // Response shapes seen: Body.Skus.Sku[], Body.Products.Product[], Body.Stock.Sku[]
  const raw =
    data?.SuccessResponse?.Body?.Skus?.Sku ??
    data?.Body?.Skus?.Sku ??
    data?.SuccessResponse?.Body?.Stock?.Sku ??
    data?.Body?.Stock?.Sku ??
    data?.SuccessResponse?.Body?.Products?.Product ??
    data?.Body?.Products?.Product;
  if (raw == null) return [];

  const items: Record<string, unknown>[] = Array.isArray(raw)
    ? raw
    : typeof raw === "object" ? [raw as Record<string, unknown>] : [];

  const results: { sku: string; name: string; quantity: number }[] = [];
  for (const item of items) {
    const sku = String(item.SellerSku || item.ShopSku || "");
    if (sku) {
      results.push({
        sku,
        name: String(item.Name || ""),
        quantity: parseInt(String(item.Available ?? item.Quantity ?? "0"), 10),
      });
    }
  }
  return results;
}

// GetProducts paginado (Limit max 1000 oficial) → lista de SKUs + nombres.
// NOTA: el campo Quantity de GetProducts NO refleja el stock sellable real
// — usar GetStock separado para el stock verdadero.
async function getFalabellaProductsListOnly(
  apiKey: string,
  userId: string,
  country: string
): Promise<{ sku: string; name: string }[]> {
  const baseUrl = BASE_URLS[country] || BASE_URLS.CL;
  const results: { sku: string; name: string }[] = [];
  let offset = 0;
  const limit = 1000; // máximo oficial por respuesta

  while (true) {
    const extra: Record<string, string> = { Filter: "all", Limit: String(limit) };
    if (offset > 0) extra.Offset = String(offset);
    const url = buildSignedUrl(baseUrl, "GetProducts", userId, apiKey, extra);
    const client = getClient(userId);
    const { data } = await client.get(url);

    const errorCode = data?.Head?.ErrorCode ?? data?.ErrorResponse?.Head?.ErrorCode;
    if (errorCode) {
      const msg = data?.Head?.ErrorMessage ?? data?.ErrorResponse?.Head?.ErrorMessage ?? JSON.stringify(data);
      throw new Error(`Falabella GetProducts error ${errorCode}: ${msg}`);
    }

    const raw =
      data?.SuccessResponse?.Body?.Products?.Product ??
      data?.Body?.Products?.Product;
    if (raw == null) {
      throw new Error(`Falabella GetProducts: estructura inesperada: ${JSON.stringify(data).slice(0, 300)}`);
    }
    const products: Record<string, unknown>[] = Array.isArray(raw)
      ? raw : typeof raw === "object" ? [raw as Record<string, unknown>] : [];

    for (const p of products) {
      const sku = String(p.SellerSku || "");
      if (sku) results.push({ sku, name: String(p.Name || "") });
    }

    if (products.length < limit) break;
    offset += limit;
  }

  return results;
}

// getAllFalabellaSkus = GetProducts (lista de SKUs) + GetStock (stock real por lote).
// Si GetProducts devuelve E009, cae a FetchStock (stock-read permission only).
export async function getAllFalabellaSkus(
  apiKey: string,
  userId: string,
  country = "CL"
): Promise<{ sku: string; name: string; quantity: number }[]> {
  let skuList: { sku: string; name: string }[] = [];
  try {
    skuList = await getFalabellaProductsListOnly(apiKey, userId, country);
  } catch (e) {
    const msg = (e as Error).message;
    if (/E009|error 9:/i.test(msg)) {
      console.warn("[Falabella] GetProducts denied (E009), fallback a FetchStock");
      return getFalabellaSkusViaFetchStock(apiKey, userId, country);
    }
    throw e;
  }

  if (skuList.length === 0) return [];

  // GetStock (batch 5) para el stock real
  const stocks = await getFalabellaStockForSkus(
    apiKey,
    userId,
    skuList.map((s) => s.sku),
    country
  );
  const stockMap = new Map(stocks.map((s) => [s.sku, s.quantity]));

  return skuList.map((s) => ({
    sku: s.sku,
    name: s.name,
    quantity: stockMap.get(s.sku) ?? 0,
  }));
}

// Escape XML special chars to evitar romper el payload con SKUs que contengan &, <, >, etc.
function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// UpdateStock acepta múltiples <Product> en un solo payload → 1 request en vez de N.
// Docs: https://developers.falabella.com/v500.0.0/reference/updatestock
// Dividimos en batches de 500 para evitar payloads demasiado grandes.
export async function batchUpdateFalabellaStock(
  apiKey: string,
  userId: string,
  items: { sku: string; quantity: number }[],
  country = "CL"
): Promise<{ success: string[]; failed: string[] }> {
  if (items.length === 0) return { success: [], failed: [] };
  const baseUrl = BASE_URLS[country] || BASE_URLS.CL;
  const client = getClient(userId);
  const success: string[] = [];
  const failed: string[] = [];
  const BATCH = 500;

  for (let i = 0; i < items.length; i += BATCH) {
    const chunk = items.slice(i, i + BATCH);
    const products = chunk
      .map((it) => `<Product><SellerSKU>${xmlEscape(it.sku)}</SellerSKU><Quantity>${it.quantity}</Quantity></Product>`)
      .join("");
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Request>${products}</Request>`;
    const url = buildSignedUrl(baseUrl, "UpdateStock", userId, apiKey);
    try {
      const { data } = await client.post(url, `payload=${encodeURIComponent(xml)}`, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      const errorCode = data?.Head?.ErrorCode ?? data?.ErrorResponse?.Head?.ErrorCode;
      if (errorCode) {
        failed.push(...chunk.map((it) => it.sku));
      } else {
        success.push(...chunk.map((it) => it.sku));
      }
    } catch {
      failed.push(...chunk.map((it) => it.sku));
    }
  }

  return { success, failed };
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export interface FalabellaOrderItem {
  orderItemId: string;
  sku: string;
  shopSku: string;
  name: string;
  quantity: number;
  price: number;
  status: string;
  imageUrl: string | null;
}

export interface FalabellaOrder {
  orderId: string;       // internal numeric ID (used for API calls)
  orderNumber: string;   // human-readable number shown in Falabella Seller Center UI
  status: string;
  createdAt: string;
  items: FalabellaOrderItem[];
}

// GetOrders → GetOrderItems (per order) — returns full order list with items
export async function getFalabellaOrdersList(
  apiKey: string,
  userId: string,
  country = "CL"
): Promise<FalabellaOrder[]> {
  const baseUrl = BASE_URLS[country] || BASE_URLS.CL;
  // Fetch last 20 orders across all statuses, sorted by created date descending
  const extra: Record<string, string> = { Limit: "20", SortBy: "created_at", SortDirection: "DESC" };
  const url = buildSignedUrl(baseUrl, "GetOrders", userId, apiKey, extra);
  const client = getClient(userId);
  const { data } = await client.get(url);

  const errorCode = data?.Head?.ErrorCode ?? data?.ErrorResponse?.Head?.ErrorCode;
  if (errorCode) {
    const msg = data?.Head?.ErrorMessage ?? data?.ErrorResponse?.Head?.ErrorMessage ?? JSON.stringify(data);
    throw new Error(`Falabella GetOrders error ${errorCode}: ${msg}`);
  }

  const raw =
    data?.SuccessResponse?.Body?.Orders?.Order ??
    data?.Body?.Orders?.Order;
  if (raw == null) return [];

  const orders: Record<string, unknown>[] = Array.isArray(raw)
    ? raw : typeof raw === "object" ? [raw as Record<string, unknown>] : [];

  const results: FalabellaOrder[] = [];
  for (const order of orders) {
    const orderId = String(order.OrderId || "");
    if (!orderId) continue;

    let items: FalabellaOrderItem[] = [];
    try {
      items = await getFalabellaOrderItems(apiKey, userId, orderId, country);
    } catch { /* items stay empty if fetch fails */ }

    results.push({
      orderId,
      orderNumber: String(order.OrderNumber || orderId),
      status: String(order.Status || order.OrderStatus || "unknown"),
      createdAt: String(order.CreatedAt || order.CreatedDate || ""),
      items,
    });
  }

  // Enriquecer items con imágenes/nombres desde GetProducts (batch único).
  const allSkus = [...new Set(results.flatMap((o) => o.items.map((i) => i.sku).filter(Boolean)))];
  if (allSkus.length > 0) {
    try {
      const info = await getFalabellaProductsInfo(apiKey, userId, allSkus, country);
      for (const ord of results) {
        for (const item of ord.items) {
          const found = info.get(item.sku);
          if (found) {
            if (found.imageUrl) item.imageUrl = found.imageUrl;
            if (!item.name && found.name) item.name = found.name;
          }
        }
      }
    } catch (e) {
      console.warn("[Falabella] GetProducts enrichment falló:", (e as Error).message);
    }
  }

  // Ensure newest-first sort
  results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return results;
}

// GetOrderItems — item details (SKU, name, quantity) for a specific order
export async function getFalabellaOrderItems(
  apiKey: string,
  userId: string,
  orderId: string,
  country = "CL"
): Promise<FalabellaOrderItem[]> {
  const baseUrl = BASE_URLS[country] || BASE_URLS.CL;
  const url = buildSignedUrl(baseUrl, "GetOrderItems", userId, apiKey, { OrderId: orderId });
  const client = getClient(userId);
  const { data } = await client.get(url);

  const errorCode = data?.Head?.ErrorCode ?? data?.SuccessResponse?.Head?.ErrorCode;
  if (errorCode) {
    const msg = data?.Head?.ErrorMessage ?? data?.SuccessResponse?.Head?.ErrorMessage ?? JSON.stringify(data);
    throw new Error(`Falabella GetOrderItems error ${errorCode}: ${msg}`);
  }

  const raw =
    data?.SuccessResponse?.Body?.OrderItems?.OrderItem ??
    data?.Body?.OrderItems?.OrderItem;
  if (raw == null) return [];

  const items: Record<string, unknown>[] = Array.isArray(raw)
    ? raw : typeof raw === "object" ? [raw as Record<string, unknown>] : [];

  return items.map((item) => {
    const sellerSku = String(item.SellerSku || item.Sku || "");
    const shopSku = String(item.ShopSku || "");
    return {
      orderItemId: String(item.OrderItemId || ""),
      sku: sellerSku || shopSku,
      shopSku,
      name: String(item.Name || item.ProductName || ""),
      quantity: parseInt(String(item.Quantity || "1"), 10),
      price: parseFloat(String(item.PaidPrice || item.UnitPrice || "0")) || 0,
      status: String(item.Status || ""),
      // La imagen se rellena después con GetProducts (via getFalabellaProductsInfo)
      imageUrl: null,
    };
  });
}

// GetDocument (DocumentType=shippingLabel) → base64-encoded PDF
// Returns the raw base64 string; caller can decode and serve as PDF.
export async function getFalabellaShippingLabel(
  apiKey: string,
  userId: string,
  orderItemIds: string[], // one or more OrderItemId values
  country = "CL"
): Promise<string> {
  const baseUrl = BASE_URLS[country] || BASE_URLS.CL;
  const extra: Record<string, string> = {
    DocumentType: "shippingLabel",
    OrderItemIds: orderItemIds.join(","),
  };
  const url = buildSignedUrl(baseUrl, "GetDocument", userId, apiKey, extra);
  const client = getClient(userId);
  const { data } = await client.get(url);

  const errorCode = data?.Head?.ErrorCode ?? data?.SuccessResponse?.Head?.ErrorCode;
  if (errorCode) {
    const msg = data?.Head?.ErrorMessage ?? data?.SuccessResponse?.Head?.ErrorMessage ?? JSON.stringify(data);
    throw new Error(`Falabella GetDocument error ${errorCode}: ${msg}`);
  }

  // Response may be Documents[].File (base64) or a direct base64 string
  const docs =
    data?.SuccessResponse?.Body?.Documents?.Document ??
    data?.Body?.Documents?.Document;
  const doc = Array.isArray(docs) ? docs[0] : docs;
  const base64 = doc?.File ?? doc?.Content ?? data?.File ?? "";
  if (!base64) throw new Error("Falabella GetDocument: etiqueta no disponible aún");
  return String(base64);
}

// ─── Webhooks ────────────────────────────────────────────────────────────────
// Docs: https://developers.falabella.com/v500.0.0/reference/createwebhook
//       https://developers.falabella.com/v500.0.0/reference/getwebhooks
//       https://developers.falabella.com/v500.0.0/reference/getwebhookentities

// GetWebhookEntities — lista todos los eventos disponibles para webhooks.
export async function getFalabellaWebhookEntities(
  apiKey: string,
  userId: string,
  country = "CL"
): Promise<unknown> {
  const baseUrl = BASE_URLS[country] || BASE_URLS.CL;
  const url = buildSignedUrl(baseUrl, "GetWebhookEntities", userId, apiKey);
  const client = getClient(userId);
  const { data } = await client.get(url);
  const errorCode = data?.Head?.ErrorCode ?? data?.ErrorResponse?.Head?.ErrorCode;
  if (errorCode) {
    const msg = data?.Head?.ErrorMessage ?? data?.ErrorResponse?.Head?.ErrorMessage ?? JSON.stringify(data);
    throw new Error(`Falabella GetWebhookEntities error ${errorCode}: ${msg}`);
  }
  return data;
}

// GetWebhooks — lista webhooks registrados.
export async function getFalabellaWebhooks(
  apiKey: string,
  userId: string,
  country = "CL"
): Promise<unknown> {
  const baseUrl = BASE_URLS[country] || BASE_URLS.CL;
  const url = buildSignedUrl(baseUrl, "GetWebhooks", userId, apiKey);
  const client = getClient(userId);
  const { data } = await client.get(url);
  return data;
}

// CreateWebhook — registra un webhook.
// Body XML (form-urlencoded payload=<xml>):
//   <Request><Webhook><CallbackUrl>...</CallbackUrl>
//     <Events><Event>onOrderCreated</Event>...</Events></Webhook></Request>
export async function createFalabellaWebhook(
  apiKey: string,
  userId: string,
  callbackUrl: string,
  events: string[],
  country = "CL"
): Promise<unknown> {
  const baseUrl = BASE_URLS[country] || BASE_URLS.CL;
  const url = buildSignedUrl(baseUrl, "CreateWebhook", userId, apiKey);
  const client = getClient(userId);
  const eventEls = events.map((e) => `<Event>${xmlEscape(e)}</Event>`).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Request><Webhook><CallbackUrl>${xmlEscape(callbackUrl)}</CallbackUrl><Events>${eventEls}</Events></Webhook></Request>`;
  // Body XML crudo (NO form-urlencoded payload=... ese wrapper es solo para UpdateStock feeds).
  const { data } = await client.post(url, xml, {
    headers: { "Content-Type": "application/xml", Accept: "application/json" },
  });
  const errorCode = data?.Head?.ErrorCode ?? data?.ErrorResponse?.Head?.ErrorCode;
  if (errorCode) {
    const msg = data?.Head?.ErrorMessage ?? data?.ErrorResponse?.Head?.ErrorMessage ?? JSON.stringify(data);
    throw new Error(`Falabella CreateWebhook error ${errorCode}: ${msg}`);
  }
  return data;
}

// DeleteWebhook — elimina un webhook por ID.
export async function deleteFalabellaWebhook(
  apiKey: string,
  userId: string,
  webhookId: string,
  country = "CL"
): Promise<unknown> {
  const baseUrl = BASE_URLS[country] || BASE_URLS.CL;
  const url = buildSignedUrl(baseUrl, "DeleteWebhook", userId, apiKey, { WebhookId: webhookId });
  const client = getClient(userId);
  const { data } = await client.post(url);
  return data;
}

// GetOrderItems helper público — usado por el webhook receiver para saber
// qué SKUs/cantidades descontar cuando llega order_created.
export async function getFalabellaOrderItemsForDiscount(
  apiKey: string,
  userId: string,
  orderId: string,
  country = "CL"
): Promise<{ sku: string; quantity: number }[]> {
  const items = await getFalabellaOrderItems(apiKey, userId, orderId, country);
  // Agrupar por SKU y sumar cantidades (cada línea ya viene con quantity=1 o N)
  const map = new Map<string, number>();
  for (const it of items) {
    if (!it.sku) continue;
    map.set(it.sku, (map.get(it.sku) || 0) + (it.quantity || 1));
  }
  return [...map.entries()].map(([sku, quantity]) => ({ sku, quantity }));
}

// ─── Internal / polling ───────────────────────────────────────────────────────

// Poll for pending orders — used as backup to webhooks
export async function getFalabellaOrders(
  apiKey: string,
  userId: string,
  createdAfter?: string,
  country = "CL"
): Promise<{ orderId: string; sku: string; quantity: number }[]> {
  const baseUrl = BASE_URLS[country] || BASE_URLS.CL;
  const extra: Record<string, string> = { Limit: "50", Status: "pending" };
  if (createdAfter) extra.CreatedAfter = createdAfter;
  const url = buildSignedUrl(baseUrl, "GetOrders", userId, apiKey, extra);
  const client = getClient(userId);
  const { data } = await client.get(url);

  const errorCode = data?.Head?.ErrorCode ?? data?.SuccessResponse?.Head?.ErrorCode;
  if (errorCode) {
    const msg = data?.Head?.ErrorMessage ?? data?.SuccessResponse?.Head?.ErrorMessage ?? JSON.stringify(data);
    throw new Error(`Falabella GetOrders error ${errorCode}: ${msg}`);
  }

  const raw =
    data?.SuccessResponse?.Body?.Orders?.Order ??
    data?.Body?.Orders?.Order;
  if (raw == null) return [];

  const orders: Record<string, unknown>[] = Array.isArray(raw)
    ? raw : typeof raw === "object" ? [raw as Record<string, unknown>] : [];

  const results: { orderId: string; sku: string; quantity: number }[] = [];
  for (const order of orders) {
    const orderId = String(order.OrderId || "");
    if (!orderId) continue;
    const rawItems = (order as Record<string, Record<string, unknown>>).OrderItems?.OrderItem;
    if (!rawItems) continue;
    const items: Record<string, unknown>[] = Array.isArray(rawItems)
      ? rawItems : [rawItems as Record<string, unknown>];
    for (const item of items) {
      const sku = String(item.SellerSku || item.seller_sku || "");
      const qty = parseInt(String(item.Quantity || "1"), 10);
      if (sku) results.push({ orderId, sku, quantity: qty });
    }
  }
  return results;
}
