import axios from "axios";

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

export interface BsaleStock {
  id: number;
  quantity: number;
  variantId: number;
  officeId: number;
}

export interface BsaleVariant {
  id: number;
  sku: string;
  description: string;
  stocksCount: number;
}

export async function getBsaleVariants(
  accessToken: string,
  limit = 50,
  offset = 0
): Promise<{ list: BsaleVariant[]; count: number; total: number }> {
  const client = getClient(accessToken);
  const { data } = await client.get("/variants.json", {
    params: { limit, offset },
  });
  return data;
}

export async function getBsaleStockByVariant(
  accessToken: string,
  variantId: number
): Promise<BsaleStock[]> {
  const client = getClient(accessToken);
  const { data } = await client.get(
    `/stocks.json?variantid=${variantId}&limit=100`
  );
  return data.list || [];
}

export async function getBsaleTotalStock(
  accessToken: string,
  variantId: number,
  officeId?: number
): Promise<number> {
  const stocks = await getBsaleStockByVariant(accessToken, variantId);
  if (officeId) {
    const found = stocks.find((s) => s.officeId === officeId);
    return found?.quantity ?? 0;
  }
  return stocks.reduce((sum, s) => sum + (s.quantity || 0), 0);
}

export async function updateBsaleStock(
  accessToken: string,
  stockId: number,
  quantity: number
): Promise<void> {
  const client = getClient(accessToken);
  await client.put(`/stocks/${stockId}.json`, { quantity });
}

export async function discountBsaleStock(
  accessToken: string,
  variantId: number,
  amount: number,
  officeId?: number
): Promise<{ success: boolean; newQty: number; stockId: number }> {
  const stocks = await getBsaleStockByVariant(accessToken, variantId);

  let target: BsaleStock | undefined;
  if (officeId) {
    target = stocks.find((s) => s.officeId === officeId);
  } else {
    target = stocks.reduce((max, s) =>
      (s.quantity || 0) > (max.quantity || 0) ? s : max
    );
  }

  if (!target) throw new Error(`No stock found for variantId ${variantId}`);

  const newQty = Math.max(0, (target.quantity || 0) - amount);
  await updateBsaleStock(accessToken, target.id, newQty);

  return { success: true, newQty, stockId: target.id };
}

export async function getAllBsaleSkus(
  accessToken: string
): Promise<{ sku: string; variantId: number; name: string; stock: number }[]> {
  const results: { sku: string; variantId: number; name: string; stock: number }[] = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    const { list, count } = await getBsaleVariants(accessToken, limit, offset);
    if (!list || list.length === 0) break;

    for (const variant of list) {
      if (!variant.sku) continue;
      const stock = await getBsaleTotalStock(accessToken, variant.id);
      results.push({
        sku: variant.sku,
        variantId: variant.id,
        name: variant.description,
        stock,
      });
    }

    offset += limit;
    if (offset >= count) break;
  }

  return results;
}
