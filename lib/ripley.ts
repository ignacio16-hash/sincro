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
