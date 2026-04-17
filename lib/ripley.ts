import axios from "axios";
import FormData from "form-data";

// Ripley Marketplace — Mirakl MMP API
// Docs: https://developer.mirakl.com/content/product/mmp/rest/seller/openapi3
// Auth: Authorization: <api-key>  (NO Bearer prefix)
// Stock update: STO01 — POST /api/offers/stock/imports (CSV)
// Orders: poll OR11 — GET /api/orders (no webhook push for sellers)

function getClient(apiKey: string, instanceUrl: string) {
  return axios.create({
    baseURL: instanceUrl,
    headers: {
      Authorization: apiKey, // Mirakl uses key directly, no "Bearer" prefix
    },
    timeout: 20000,
  });
}

// STO01: Update stock using CSV import (recommended — stock-only, no side effects)
export async function updateRipleyStock(
  apiKey: string,
  instanceUrl: string,
  sku: string,
  quantity: number
): Promise<void> {
  const csvContent = `offer-sku,quantity,warehouse-code,update-delete\n${sku},${quantity},,`;

  const form = new FormData();
  form.append("file", Buffer.from(csvContent), {
    filename: "stock.csv",
    contentType: "text/csv",
  });

  const client = getClient(apiKey, instanceUrl);
  await client.post("/api/offers/stock/imports", form, {
    headers: form.getHeaders(),
  });
}

// STO01: Batch update stock for multiple SKUs
export async function batchUpdateRipleyStock(
  apiKey: string,
  instanceUrl: string,
  items: { sku: string; quantity: number }[]
): Promise<{ success: string[]; failed: string[] }> {
  if (items.length === 0) return { success: [], failed: [] };

  const lines = items
    .map((item) => `${item.sku},${item.quantity},,`)
    .join("\n");
  const csvContent = `offer-sku,quantity,warehouse-code,update-delete\n${lines}`;

  try {
    const form = new FormData();
    form.append("file", Buffer.from(csvContent), {
      filename: "stock.csv",
      contentType: "text/csv",
    });

    const client = getClient(apiKey, instanceUrl);
    await client.post("/api/offers/stock/imports", form, {
      headers: form.getHeaders(),
    });

    return { success: items.map((i) => i.sku), failed: [] };
  } catch {
    return { success: [], failed: items.map((i) => i.sku) };
  }
}

// GET stock for a specific offer by SKU
// First resolves SKU to offer_id, then gets quantity
export async function getRipleyStock(
  apiKey: string,
  instanceUrl: string,
  sku: string
): Promise<number> {
  const client = getClient(apiKey, instanceUrl);

  // Find offer by SKU
  const { data } = await client.get("/api/offers", {
    params: { shop_sku: sku, max: 1 },
  });

  const offer = (data?.offers || [])[0];
  if (!offer) return 0;

  // Get quantity for that offer
  const { data: qtyData } = await client.get(
    `/api/offers/${offer.offer_id}/quantity`
  );
  return qtyData?.quantity ?? 0;
}

// OF21: List all offers of the shop (paginated)
// Response: { offers: [{ shop_sku, product_title, quantity }], total_count }
export async function getAllRipleySkus(
  apiKey: string,
  instanceUrl: string
): Promise<{ sku: string; name: string; quantity: number }[]> {
  const client = getClient(apiKey, instanceUrl);
  const results: { sku: string; name: string; quantity: number }[] = [];
  let offset = 0;
  const max = 100;

  while (true) {
    const { data } = await client.get("/api/offers", {
      params: { max, offset },
    });

    const offers: Record<string, unknown>[] = data?.offers || [];
    for (const offer of offers) {
      const sku = String(offer.shop_sku || "");
      if (sku) {
        results.push({
          sku,
          name: String(offer.product_title || ""),
          quantity: Number(offer.quantity) || 0,
        });
      }
    }

    if (offers.length < max) break;
    offset += max;
  }

  return results;
}

// ─── Orders (OR11 / OR72 / OR73) ─────────────────────────────────────────────

export interface RipleyOrderLine {
  orderLineId: string;
  offerSku: string;       // offer_sku — seller's own SKU
  productTitle: string;
  quantity: number;
  price: number;
  orderLineState: string;
  imageUrl: string | null; // product_medias[0].media_url (small type preferred)
}

export interface RipleyOrder {
  orderId: string;
  orderState: string;
  createdDate: string;
  currencyCode: string;
  orderLines: RipleyOrderLine[];
}

// OR11: List orders with full line detail (product_medias for images)
export async function getRipleyOrders(
  apiKey: string,
  instanceUrl: string,
  stateCodes?: string, // comma-separated, e.g. "WAITING_ACCEPTANCE,SHIPPING"
  max = 50
): Promise<RipleyOrder[]> {
  const client = getClient(apiKey, instanceUrl);
  const params: Record<string, string | number> = { max };
  if (stateCodes) params.order_state_codes = stateCodes;

  const { data } = await client.get("/api/orders", { params });
  const orders: Record<string, unknown>[] = data?.orders || [];

  return orders.map((o) => {
    const lines: RipleyOrderLine[] = ((o.order_lines as Record<string, unknown>[]) || []).map((line) => {
      const medias: Record<string, string>[] = (line.product_medias as Record<string, string>[]) || [];
      // Prefer "small" type image, fallback to first
      const img = medias.find((m) => m.type === "small") || medias[0];
      return {
        orderLineId: String(line.order_line_id || ""),
        offerSku: String(line.offer_sku || ""),
        productTitle: String(line.product_title || ""),
        quantity: Number(line.quantity) || 0,
        price: Number(line.price) || 0,
        orderLineState: String(line.order_line_state || ""),
        imageUrl: img?.media_url ?? null,
      };
    });
    return {
      orderId: String(o.order_id || ""),
      orderState: String(o.order_state || ""),
      createdDate: String(o.created_date || ""),
      currencyCode: String(o.currency_iso_code || "CLP"),
      orderLines: lines,
    };
  });
}

// OR72: List documents attached to an order
// Returns array of { id, type, file_name }
export async function getRipleyOrderDocuments(
  apiKey: string,
  instanceUrl: string,
  orderId: string
): Promise<{ id: number; type: string; fileName: string }[]> {
  const client = getClient(apiKey, instanceUrl);
  const { data } = await client.get("/api/orders/documents", {
    params: { order_id: orderId },
  });
  const docs: Record<string, unknown>[] = data?.order_documents || [];
  return docs.map((d) => ({
    id: Number(d.id),
    type: String(d.type || ""),
    fileName: String(d.file_name || ""),
  }));
}

// OR73: Download one document by ID — returns binary Buffer (PDF or ZIP)
export async function downloadRipleyOrderDocument(
  apiKey: string,
  instanceUrl: string,
  documentId: number
): Promise<Buffer> {
  const client = getClient(apiKey, instanceUrl);
  const response = await client.get("/api/orders/documents/download", {
    params: { document_ids: String(documentId) },
    responseType: "arraybuffer",
  });
  return Buffer.from(response.data as ArrayBuffer);
}

// OR11: Poll for new orders (Mirakl doesn't push webhooks to sellers)
// Returns orders in WAITING_ACCEPTANCE state
export async function getPendingRipleyOrders(
  apiKey: string,
  instanceUrl: string
): Promise<
  { orderId: string; sku: string; quantity: number }[]
> {
  const client = getClient(apiKey, instanceUrl);
  const { data } = await client.get("/api/orders", {
    params: {
      order_state_codes: "WAITING_ACCEPTANCE",
      max: 100,
    },
  });

  const results: { orderId: string; sku: string; quantity: number }[] = [];
  for (const order of data?.orders || []) {
    for (const line of order?.order_lines || []) {
      results.push({
        orderId: order.order_id,
        sku: line.offer_sku, // use offer_sku, NOT product_sku
        quantity: line.quantity,
      });
    }
  }
  return results;
}
