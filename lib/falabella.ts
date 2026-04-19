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

// Update stock for a single SKU via ProductUpdate XML feed
export async function updateFalabellaStock(
  apiKey: string,
  userId: string,
  sku: string,
  quantity: number,
  country = "CL"
): Promise<string> {
  const baseUrl = BASE_URLS[country] || BASE_URLS.CL;
  const url = buildSignedUrl(baseUrl, "ProductUpdate", userId, apiKey);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Request>
  <Product>
    <SellerSku>${sku}</SellerSku>
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
  const url = buildSignedUrl(baseUrl, "GetProducts", userId, apiKey, { SellerSku: sku });
  const client = getClient(userId);
  const { data } = await client.get(url);
  const products = data?.SuccessResponse?.Body?.Products?.Product || [];
  const product = Array.isArray(products) ? products[0] : products;
  return parseInt(product?.Quantity || "0", 10);
}

// GetStock — consulta stock de una lista específica de SellerSkus.
// Requiere param SellerSku con un array JSON encoded. Acepta hasta ~100 por batch.
// Docs: https://developers.falabella.com/v500.0.0/reference/getstock
// Uso: cuando GetProducts/FetchStock retornan E009 (permisos), pero GetStock sí funciona.
export async function getFalabellaStockForSkus(
  apiKey: string,
  userId: string,
  skus: string[],
  country = "CL"
): Promise<{ sku: string; name: string; quantity: number }[]> {
  if (skus.length === 0) return [];
  const baseUrl = BASE_URLS[country] || BASE_URLS.CL;
  const client = getClient(userId);
  const results: { sku: string; name: string; quantity: number }[] = [];
  const BATCH = 50;

  for (let i = 0; i < skus.length; i += BATCH) {
    const chunk = skus.slice(i, i + BATCH);
    const extra: Record<string, string> = {
      FacilityId: "GSC-001",
      SellerSku: JSON.stringify(chunk),
      Limit: String(chunk.length),
    };
    const url = buildSignedUrl(baseUrl, "GetStock", userId, apiKey, extra);
    const { data } = await client.get(url);

    const errorCode = data?.Head?.ErrorCode ?? data?.ErrorResponse?.Head?.ErrorCode;
    if (errorCode) {
      const msg = data?.Head?.ErrorMessage ?? data?.ErrorResponse?.Head?.ErrorMessage ?? JSON.stringify(data);
      throw new Error(`Falabella GetStock error ${errorCode}: ${msg}`);
    }

    const raw =
      data?.SuccessResponse?.Body?.Skus?.Sku ??
      data?.Body?.Skus?.Sku ??
      data?.SuccessResponse?.Body?.Stock?.Sku ??
      data?.Body?.Stock?.Sku;
    const items: Record<string, unknown>[] = Array.isArray(raw)
      ? raw : raw && typeof raw === "object" ? [raw as Record<string, unknown>] : [];

    for (const item of items) {
      const sku = String(item.SellerSku || item.ShopSku || "");
      if (!sku) continue;
      results.push({
        sku,
        name: String(item.Name || ""),
        quantity: parseInt(String(item.Available ?? item.SellableStock ?? item.Quantity ?? "0"), 10),
      });
    }
  }

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

export async function getAllFalabellaSkus(
  apiKey: string,
  userId: string,
  country = "CL"
): Promise<{ sku: string; name: string; quantity: number }[]> {
  const baseUrl = BASE_URLS[country] || BASE_URLS.CL;
  const results: { sku: string; name: string; quantity: number }[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    // Filter is required by Falabella Seller Center GetProducts (per docs example URL).
    // "all" = all products regardless of status.
    const extra: Record<string, string> = { Filter: "all", Limit: String(limit) };
    if (offset > 0) extra.Offset = String(offset);
    const url = buildSignedUrl(baseUrl, "GetProducts", userId, apiKey, extra);
    const client = getClient(userId);
    const { data } = await client.get(url);

    const errorCode = data?.Head?.ErrorCode ?? data?.ErrorResponse?.Head?.ErrorCode;
    if (errorCode) {
      // E009 = Access Denied — API key lacks GetProducts permission.
      // Fall back to FetchStock which only needs stock-read permission.
      if (String(errorCode) === "9" || String(errorCode).toUpperCase() === "E009") {
        console.warn("[Falabella] GetProducts denied (E009), falling back to FetchStock");
        return getFalabellaSkusViaFetchStock(apiKey, userId, country);
      }
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
      ? raw
      : typeof raw === "object" ? [raw as Record<string, unknown>] : [];

    for (const p of products) {
      const sku = String(p.SellerSku || "");
      if (sku) {
        results.push({
          sku,
          name: String(p.Name || ""),
          quantity: parseInt(String(p.Quantity ?? "0"), 10),
        });
      }
    }

    if (products.length < limit) break;
    offset += limit;
  }

  return results;
}

export async function batchUpdateFalabellaStock(
  apiKey: string,
  userId: string,
  items: { sku: string; quantity: number }[],
  country = "CL"
): Promise<{ success: string[]; failed: string[] }> {
  const success: string[] = [];
  const failed: string[] = [];
  for (const item of items) {
    try {
      await updateFalabellaStock(apiKey, userId, item.sku, item.quantity, country);
      success.push(item.sku);
    } catch {
      failed.push(item.sku);
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
    // Falabella CDN pattern — reusable for many products. Si no existe, el <img>
    // tiene onError que oculta la imagen.
    const imageUrl = sellerSku
      ? `https://falabella.scene7.com/is/image/FalabellaCL/${encodeURIComponent(sellerSku)}?wid=200&hei=200`
      : null;
    return {
      orderItemId: String(item.OrderItemId || ""),
      sku: sellerSku || shopSku,
      shopSku,
      name: String(item.Name || item.ProductName || ""),
      quantity: parseInt(String(item.Quantity || "1"), 10),
      price: parseFloat(String(item.PaidPrice || item.UnitPrice || "0")) || 0,
      status: String(item.Status || ""),
      imageUrl,
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
