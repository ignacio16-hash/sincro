import axios from "axios";

// Paris / Cencosud Marketplace API
// Docs: https://developers.ecomm.cencosud.com/docs
// NOTE: The Cencosud developer portal requires authenticated access (JS SPA behind login).
// Credentials and exact endpoints must be obtained from Cencosud merchant support.
// Contact: https://login-microfrontend.ecomm.cencosud.com/
//
// This implementation uses the standard patterns observed for Cencosud's REST API.
// Fields may need adjustment once you receive official API docs from Cencosud.

function getClient(apiKey: string, baseUrl: string) {
  return axios.create({
    baseURL: baseUrl,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    timeout: 15000,
  });
}

// Update stock for a single SKU
// Endpoint structure based on Cencosud's marketplace platform patterns.
// Adjust path if Cencosud provides a different endpoint after onboarding.
export async function updateParisStock(
  apiKey: string,
  sellerId: string,
  baseUrl: string, // Configurable — get exact URL from Cencosud support
  sku: string,
  quantity: number
): Promise<void> {
  const client = getClient(apiKey, baseUrl);
  await client.put(`/sellers/${sellerId}/products/${sku}/stock`, {
    available: quantity,
  });
}

export async function getParisStock(
  apiKey: string,
  sellerId: string,
  baseUrl: string,
  sku: string
): Promise<number> {
  const client = getClient(apiKey, baseUrl);
  const { data } = await client.get(`/sellers/${sellerId}/products/${sku}`);
  return data?.stock?.available ?? data?.available ?? 0;
}

export async function batchUpdateParisStock(
  apiKey: string,
  sellerId: string,
  baseUrl: string,
  items: { sku: string; quantity: number }[]
): Promise<{ success: string[]; failed: string[] }> {
  const success: string[] = [];
  const failed: string[] = [];

  for (const item of items) {
    try {
      await updateParisStock(apiKey, sellerId, baseUrl, item.sku, item.quantity);
      success.push(item.sku);
    } catch {
      failed.push(item.sku);
    }
  }

  return { success, failed };
}
