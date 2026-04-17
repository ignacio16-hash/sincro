import axios from "axios";
import crypto from "crypto";

// Falabella Seller Center API
// Docs: https://developers.falabella.com/v600.0.0/reference
// Auth: HMAC-SHA256 signed query params (NOT Authorization header)
// Base URL: https://sellercenter-api.falabella.com/ (linio.cl deprecated)

const BASE_URLS: Record<string, string> = {
  CL: "https://sellercenter-api.falabella.com/",
  PE: "https://sellercenter-api.falabella.com/",
  CO: "https://sellercenter-api.falabella.com/",
  MX: "https://sellercenter-api.falabella.com/",
};

function buildSignature(
  params: Record<string, string>,
  apiKey: string
): string {
  // Sign raw (unencoded) values — per Falabella docs the string to sign uses
  // plain key=value pairs, NOT percent-encoded. URL-encoding happens only in
  // the final HTTP query string, not in the signing step.
  const sorted = Object.keys(params).sort();
  const toSign = sorted.map((k) => `${k}=${params[k]}`).join("&");
  return crypto.createHmac("sha256", apiKey).update(toSign).digest("hex");
}

function buildSignedUrl(
  baseUrl: string,
  action: string,
  userId: string,
  apiKey: string,
  extra: Record<string, string> = {}
): string {
  // RFC 3339 format with colon in timezone offset: 2026-04-17T12:00:00+00:00
  const timestamp = new Date().toISOString().replace(/\.\d+Z$/, "+00:00");
  const params: Record<string, string> = {
    Action: action,
    UserID: userId,
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

function getClient(userId: string) {
  return axios.create({
    headers: {
      "User-Agent": `SincroStock/${userId}/Node.js/1.0`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    timeout: 20000,
  });
}

// Update stock for a single SKU
// Falabella uses XML feed via ProductUpdate action
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
  const { data } = await client.post(
    url,
    `payload=${encodeURIComponent(xml)}`
  );

  // Returns a FeedID for async processing
  return data?.FeedID || data?.Body?.FeedID || "";
}

export async function getFalabellaStock(
  apiKey: string,
  userId: string,
  sku: string,
  country = "CL"
): Promise<number> {
  const baseUrl = BASE_URLS[country] || BASE_URLS.CL;
  const url = buildSignedUrl(baseUrl, "GetProducts", userId, apiKey, {
    SellerSku: sku,
  });
  const client = getClient(userId);
  const { data } = await client.get(url);
  const products = data?.SuccessResponse?.Body?.Products?.Product || [];
  const product = Array.isArray(products) ? products[0] : products;
  return parseInt(product?.Quantity || "0", 10);
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
    const url = buildSignedUrl(baseUrl, "GetProducts", userId, apiKey, {
      Limit: String(limit),
      Offset: String(offset),
    });
    const client = getClient(userId);
    const { data } = await client.get(url);

    const products: Record<string, unknown>[] =
      data?.SuccessResponse?.Body?.Products?.Product ||
      data?.Body?.Products?.Product || [];

    if (!Array.isArray(products) || products.length === 0) break;

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
