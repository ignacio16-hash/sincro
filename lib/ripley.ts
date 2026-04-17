import axios from "axios";

// Ripley / Mirakl MMP API
// Docs: https://developer.mirakl.com/content/product/mmp/rest/seller/openapi3

const BASE_URL = "https://ripley.mirakl.net/api";

function getClient(apiKey: string) {
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    timeout: 15000,
  });
}

export async function updateRipleyStock(
  apiKey: string,
  sku: string,
  quantity: number
): Promise<void> {
  const client = getClient(apiKey);
  // Mirakl uses offers to manage stock
  await client.put("/offers", {
    offers: [
      {
        sku,
        quantity,
      },
    ],
  });
}

export async function getRipleyOffers(
  apiKey: string,
  sku?: string
): Promise<{ sku: string; quantity: number }[]> {
  const client = getClient(apiKey);
  const params: Record<string, string> = { max: "100" };
  if (sku) params.sku = sku;

  const { data } = await client.get("/offers", { params });
  const offers = data?.offers || [];

  return offers.map((o: { sku: string; quantity: number }) => ({
    sku: o.sku,
    quantity: o.quantity ?? 0,
  }));
}

export async function getRipleyStock(
  apiKey: string,
  sku: string
): Promise<number> {
  const offers = await getRipleyOffers(apiKey, sku);
  return offers.find((o) => o.sku === sku)?.quantity ?? 0;
}

export async function batchUpdateRipleyStock(
  apiKey: string,
  items: { sku: string; quantity: number }[]
): Promise<{ success: string[]; failed: string[] }> {
  const success: string[] = [];
  const failed: string[] = [];

  // Mirakl supports bulk offer updates
  const chunks = [];
  for (let i = 0; i < items.length; i += 50) {
    chunks.push(items.slice(i, i + 50));
  }

  for (const chunk of chunks) {
    try {
      const client = getClient(apiKey);
      await client.put("/offers", {
        offers: chunk.map((item) => ({ sku: item.sku, quantity: item.quantity })),
      });
      chunk.forEach((item) => success.push(item.sku));
    } catch {
      chunk.forEach((item) => failed.push(item.sku));
    }
  }

  return { success, failed };
}
