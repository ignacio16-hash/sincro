// Shopify Admin API client — solo lectura de pedidos.
// Docs: https://shopify.dev/docs/api/admin-rest/2026-04/resources/order
//
// Auth: Custom App con Access Token. Header "X-Shopify-Access-Token".
// Scopes requeridos: read_orders, read_products.
//
// shopDomain: "mi-tienda.myshopify.com" (SIN protocolo).
// apiVersion: default "2024-10".
import axios from "axios";

const DEFAULT_API_VERSION = "2026-04";

export interface ShopifyLineItem {
  lineItemId: string;
  productId: string | null;
  variantId: string | null;
  title: string;
  sku: string;
  quantity: number;
  imageUrl: string | null;
}

export interface ShopifyOrder {
  orderId: string;      // numeric id (string for JSON compat)
  orderName: string;    // "#1001"
  createdAt: string;
  items: ShopifyLineItem[];
}

function base(shopDomain: string, apiVersion = DEFAULT_API_VERSION): string {
  const clean = shopDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `https://${clean}/admin/api/${apiVersion}`;
}

function authHeaders(accessToken: string): Record<string, string> {
  return {
    "X-Shopify-Access-Token": accessToken,
    "Content-Type": "application/json",
  };
}

// Lista N pedidos recientes (todos los estados por default). Trae line_items
// inline. Para las imágenes resolvemos product images en paralelo con cache
// en memoria por request para no pedir la misma imagen N veces.
export async function getShopifyOrders(
  shopDomain: string,
  accessToken: string,
  limit = 50,
  apiVersion = DEFAULT_API_VERSION
): Promise<ShopifyOrder[]> {
  const url = `${base(shopDomain, apiVersion)}/orders.json`;
  const { data } = await axios.get(url, {
    headers: authHeaders(accessToken),
    params: {
      status: "any",
      limit: Math.min(Math.max(1, limit), 250),
    },
    timeout: 15000,
  });

  const raw = Array.isArray(data?.orders) ? data.orders : [];

  // Cache por productId para no duplicar llamadas a products/*.json
  const imageCache = new Map<string, string | null>();

  async function imageForProduct(productId: string | null, variantId: string | null): Promise<string | null> {
    if (!productId) return null;
    if (imageCache.has(productId)) return imageCache.get(productId) ?? null;
    try {
      const { data: p } = await axios.get(`${base(shopDomain, apiVersion)}/products/${productId}.json`, {
        headers: authHeaders(accessToken),
        timeout: 10000,
      });
      const product = p?.product;
      // Si el variant tiene image_id específico, usar esa; si no, la imagen principal.
      let img: string | null = null;
      if (variantId && Array.isArray(product?.images)) {
        const variant = product.variants?.find((v: { id: number; image_id?: number | null }) => String(v.id) === variantId);
        const imgId = variant?.image_id;
        if (imgId) {
          const found = product.images.find((i: { id: number; src: string }) => String(i.id) === String(imgId));
          if (found?.src) img = found.src;
        }
      }
      if (!img) img = product?.image?.src ?? null;
      imageCache.set(productId, img);
      return img;
    } catch {
      imageCache.set(productId, null);
      return null;
    }
  }

  const orders: ShopifyOrder[] = await Promise.all(
    raw.map(async (o: Record<string, unknown>) => {
      const lineItemsRaw = Array.isArray(o.line_items) ? (o.line_items as Record<string, unknown>[]) : [];
      const items = await Promise.all(
        lineItemsRaw.map(async (li) => {
          const productId = li.product_id != null ? String(li.product_id) : null;
          const variantId = li.variant_id != null ? String(li.variant_id) : null;
          const imageUrl = await imageForProduct(productId, variantId);
          return {
            lineItemId: String(li.id ?? ""),
            productId,
            variantId,
            title: String(li.title ?? li.name ?? ""),
            sku: String(li.sku ?? ""),
            quantity: Number(li.quantity ?? 1),
            imageUrl,
          } satisfies ShopifyLineItem;
        })
      );
      return {
        orderId: String(o.id ?? ""),
        orderName: String(o.name ?? ""),
        createdAt: String(o.created_at ?? ""),
        items,
      } satisfies ShopifyOrder;
    })
  );

  return orders;
}

// Test de credenciales — pide 1 pedido para validar token + scopes.
export async function testShopifyConnection(
  shopDomain: string,
  accessToken: string,
  apiVersion = DEFAULT_API_VERSION
): Promise<{ ok: boolean; message: string }> {
  if (!shopDomain) return { ok: false, message: "Falta el Shop Domain" };
  if (!accessToken) return { ok: false, message: "Falta el Access Token" };
  try {
    const { data } = await axios.get(`${base(shopDomain, apiVersion)}/shop.json`, {
      headers: authHeaders(accessToken),
      timeout: 8000,
    });
    const name = data?.shop?.name ?? shopDomain;
    return { ok: true, message: `Conectado — tienda "${name}"` };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const s = err.response?.status;
      if (s === 401) return { ok: false, message: "Access Token inválido (401)" };
      if (s === 403) return { ok: false, message: "Scopes insuficientes (falta read_orders o read_products)" };
      if (s === 404) return { ok: false, message: "Shop Domain no existe" };
      return { ok: false, message: `Error ${s ?? "de red"}: ${err.message}` };
    }
    return { ok: false, message: (err as Error).message };
  }
}
