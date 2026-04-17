import axios from "axios";

// Bsale API
// Docs: https://apichile.bsalelab.com
// Auth: access_token header (NOT Authorization Bearer)

const BASE_URL = "https://api.bsale.io/v1";

function getClient(accessToken: string) {
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      access_token: accessToken,
      "Content-Type": "application/json",
    },
    timeout: 15000,
  });
}

export interface BsaleStockItem {
  quantity: number;
  quantityReserved: number;
  quantityAvailable: number;
  variant: { href: string; id: string };
  office: { href: string; id: string };
}

export interface BsaleVariant {
  id: number;
  code: string; // SKU
  description: string;
}

// GET all variants (paginated)
export async function getBsaleVariants(
  accessToken: string,
  limit = 50,
  offset = 0
): Promise<{ list: BsaleVariant[]; count: number }> {
  const client = getClient(accessToken);
  const { data } = await client.get("/variants.json", {
    params: { limit, offset },
  });
  return { list: data.list || [], count: data.count || 0 };
}

// GET stock for a SKU (by code)
export async function getBsaleStockBySku(
  accessToken: string,
  sku: string,
  officeId?: number
): Promise<BsaleStockItem[]> {
  const client = getClient(accessToken);
  const params: Record<string, string | number> = { code: sku, limit: 50 };
  if (officeId) params.officeid = officeId;
  const { data } = await client.get("/stocks.json", { params });
  return data.items || [];
}

// GET stock by variant ID
export async function getBsaleStockByVariantId(
  accessToken: string,
  variantId: number,
  officeId?: number
): Promise<BsaleStockItem[]> {
  const client = getClient(accessToken);
  const params: Record<string, string | number> = { variantid: variantId, limit: 50 };
  if (officeId) params.officeid = officeId;
  const { data } = await client.get("/stocks.json", { params });
  return data.items || [];
}

// GET total available stock for a variant
export async function getBsaleTotalStock(
  accessToken: string,
  variantId: number,
  officeId?: number
): Promise<number> {
  const items = await getBsaleStockByVariantId(accessToken, variantId, officeId);
  if (officeId) {
    const found = items.find((s) => String(s.office.id) === String(officeId));
    return found?.quantityAvailable ?? 0;
  }
  return items.reduce((sum, s) => sum + (s.quantityAvailable || 0), 0);
}

// Discount stock in Bsale using consumption (removes stock)
// Called when a marketplace receives an order
export async function consumeBsaleStock(
  accessToken: string,
  variantId: number,
  quantity: number,
  officeId?: number,
  note = "Venta marketplace"
): Promise<void> {
  const client = getClient(accessToken);
  const detail: Record<string, unknown> = {
    variantId,
    quantity,
  };
  if (officeId) detail.officeId = officeId;

  await client.post("/stocks/consumptions.json", {
    officeId: officeId || 1,
    note,
    details: [detail],
  });
}

// Add stock in Bsale using reception
export async function receiveBsaleStock(
  accessToken: string,
  variantId: number,
  quantity: number,
  officeId = 1,
  note = "Recepción sync"
): Promise<void> {
  const client = getClient(accessToken);
  await client.post("/stocks/receptions.json", {
    officeId,
    note,
    details: [{ variantId, quantity, cost: 0 }],
  });
}

// Get all SKUs with current stock using stocks endpoint + expand=[variant]
// This avoids N+1 calls — one paginated request returns stock + variant SKU together.
// When no officeId, stocks from all offices are summed per SKU.
export async function getAllBsaleSkus(
  accessToken: string,
  officeId?: number
): Promise<{ sku: string; variantId: number; name: string; stock: number }[]> {
  const client = getClient(accessToken);
  const skuMap = new Map<string, { sku: string; variantId: number; name: string; stock: number }>();
  let offset = 0;
  const limit = 50;

  while (true) {
    const params: Record<string, string | number> = { limit, offset };
    if (officeId) params.officeid = officeId;

    // Append expand to URL directly to avoid axios encoding the brackets
    const { data } = await client.get("/stocks.json?expand=[variant]", { params });
    const items: Record<string, unknown>[] = data.items || [];
    if (items.length === 0) break;

    for (const item of items) {
      const v = item.variant as Record<string, string> | undefined;
      const sku = v?.code;
      if (!sku) continue;

      const qty = Number(item.quantityAvailable) || 0;
      const existing = skuMap.get(sku);
      if (existing) {
        existing.stock += qty;
      } else {
        skuMap.set(sku, {
          sku,
          variantId: parseInt(v!.id || "0"),
          name: v!.description || "",
          stock: qty,
        });
      }
    }

    if (items.length < limit) break;
    offset += limit;
  }

  return Array.from(skuMap.values());
}

// Resolve SKU string → variantId using the variants endpoint
export async function resolveSkuToVariantId(
  accessToken: string,
  sku: string
): Promise<number | null> {
  const client = getClient(accessToken);
  const { data } = await client.get("/variants.json", {
    params: { code: sku, limit: 1 },
  });
  const first = (data.list || [])[0];
  return first ? first.id : null;
}
