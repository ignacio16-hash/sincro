import axios from "axios";

// Paris / Cencosud Marketplace API
// Docs: https://developers.ecomm.cencosud.com

const BASE_URL = "https://api.cencosud-marketplaces.com";

function getClient(apiKey: string, sellerId: string) {
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "x-seller-id": sellerId,
      "Content-Type": "application/json",
    },
    timeout: 15000,
  });
}

export async function updateParisStock(
  apiKey: string,
  sellerId: string,
  sku: string,
  quantity: number
): Promise<void> {
  const client = getClient(apiKey, sellerId);
  await client.put(`/inventory/v1/products/${sku}/stock`, {
    available: quantity,
  });
}

export async function getParisStock(
  apiKey: string,
  sellerId: string,
  sku: string
): Promise<number> {
  const client = getClient(apiKey, sellerId);
  const { data } = await client.get(`/inventory/v1/products/${sku}/stock`);
  return data?.available ?? 0;
}

export async function batchUpdateParisStock(
  apiKey: string,
  sellerId: string,
  items: { sku: string; quantity: number }[]
): Promise<{ success: string[]; failed: string[] }> {
  const success: string[] = [];
  const failed: string[] = [];

  for (const item of items) {
    try {
      await updateParisStock(apiKey, sellerId, item.sku, item.quantity);
      success.push(item.sku);
    } catch {
      failed.push(item.sku);
    }
  }

  return { success, failed };
}
