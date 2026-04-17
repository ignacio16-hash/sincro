import axios from "axios";

// Falabella Marketplace API v500
// Docs: https://developers.falabella.com/v500.0.0/reference

const BASE_URL = "https://sellercenter-api.falabella.com";

function getClient(apiKey: string, sellerId: string) {
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      Authorization: apiKey,
      "X-Seller-Id": sellerId,
      "Content-Type": "application/json",
    },
    timeout: 15000,
  });
}

export async function updateFalabellaStock(
  apiKey: string,
  sellerId: string,
  sku: string,
  quantity: number
): Promise<void> {
  const client = getClient(apiKey, sellerId);
  await client.put(`/v2/products/${sku}/stock`, {
    sellable_quantity: quantity,
  });
}

export async function getFalabellaStock(
  apiKey: string,
  sellerId: string,
  sku: string
): Promise<number> {
  const client = getClient(apiKey, sellerId);
  const { data } = await client.get(`/v2/products/${sku}`);
  return data?.stock?.sellable_quantity ?? 0;
}

export async function batchUpdateFalabellaStock(
  apiKey: string,
  sellerId: string,
  items: { sku: string; quantity: number }[]
): Promise<{ success: string[]; failed: string[] }> {
  const success: string[] = [];
  const failed: string[] = [];

  // Falabella supports batch updates
  const chunks = [];
  for (let i = 0; i < items.length; i += 20) {
    chunks.push(items.slice(i, i + 20));
  }

  for (const chunk of chunks) {
    try {
      const client = getClient(apiKey, sellerId);
      await client.put("/v2/products/stock/batch", {
        products: chunk.map((item) => ({
          sku: item.sku,
          sellable_quantity: item.quantity,
        })),
      });
      chunk.forEach((item) => success.push(item.sku));
    } catch {
      chunk.forEach((item) => failed.push(item.sku));
    }
  }

  return { success, failed };
}
