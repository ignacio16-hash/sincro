// Shopify OAuth helpers — install flow para apps creadas desde el Dev Dashboard.
// Shopify desactivó la creación de custom apps legacy en Admin desde enero 2026.
// El único camino hoy es registrar la app en https://shopify.dev y usar OAuth.
//
// Variables de entorno requeridas:
//   SHOPIFY_CLIENT_ID       — API Key del Dev Dashboard
//   SHOPIFY_CLIENT_SECRET   — API Secret del Dev Dashboard
//   SHOPIFY_APP_URL         — opcional; si no, se infiere de los headers del request
//
// Flujo:
//   1. GET /api/shopify/oauth/install?shop=<tienda>.myshopify.com
//      → set cookie `shopify_oauth_state` con nonce
//      → 302 a https://<shop>/admin/oauth/authorize?client_id=...&scope=...&redirect_uri=...&state=<nonce>
//   2. Shopify redirige a redirect_uri con ?code&hmac&state&shop&timestamp
//      → validar HMAC con SHOPIFY_CLIENT_SECRET
//      → validar state == cookie
//      → POST https://<shop>/admin/oauth/access_token con client_id + client_secret + code
//      → guardar access_token en ApiCredential(platform="shopify")
//      → 302 a /settings?shopify=connected
import crypto from "crypto";

export const SHOPIFY_SCOPES = "read_orders,read_products";
export const STATE_COOKIE_NAME = "shopify_oauth_state";
export const STATE_COOKIE_TTL_SEC = 600; // 10 min — tiempo de sobra para completar el install

// Acepta *.myshopify.com — subdominio en minúsculas/números/guión.
export function shopDomainIsValid(shop: string): boolean {
  if (!shop) return false;
  const clean = shop.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(clean);
}

export function normalizeShopDomain(shop: string): string {
  return shop.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
}

// Verifica el parámetro `hmac` de Shopify. Se excluye `hmac` (y el histórico
// `signature`) antes de ordenar y firmar con el client_secret.
export function verifyShopifyHmac(query: URLSearchParams, secret: string): boolean {
  const hmac = query.get("hmac");
  if (!hmac) return false;
  const params = new URLSearchParams(query);
  params.delete("hmac");
  params.delete("signature");
  const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const message = sorted.map(([k, v]) => `${k}=${v}`).join("&");
  const expected = crypto.createHmac("sha256", secret).update(message).digest("hex");
  try {
    const a = Buffer.from(hmac, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function randomNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

// Resuelve la URL pública de la app. Prioriza SHOPIFY_APP_URL (más estable) y
// cae a los headers x-forwarded-* (útiles en dev con túnel).
export function appUrl(req: Request): string {
  const env = process.env.SHOPIFY_APP_URL;
  if (env) return env.replace(/\/$/, "");
  const h = req.headers;
  const host = h.get("x-forwarded-host") || h.get("host") || "";
  const proto = h.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

export function buildAuthorizeUrl(shop: string, clientId: string, redirectUri: string, state: string): string {
  const clean = normalizeShopDomain(shop);
  const params = new URLSearchParams({
    client_id: clientId,
    scope: SHOPIFY_SCOPES,
    redirect_uri: redirectUri,
    state,
  });
  return `https://${clean}/admin/oauth/authorize?${params.toString()}`;
}
