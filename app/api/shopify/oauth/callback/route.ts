// GET /api/shopify/oauth/callback?code&hmac&state&shop&timestamp
//
// Shopify redirige acá tras el authorize. No hay sesión de nuestro usuario
// acá (Shopify hace un redirect del lado del browser, pero aún así lo hacemos
// público en el proxy). La seguridad viene de:
//
//   1. HMAC del query string validado con SHOPIFY_CLIENT_SECRET
//   2. `state` del query == cookie `shopify_oauth_state` (CSRF)
//   3. `shop` coincide con el guardado en la cookie (no dejamos que Shopify
//      cambie la tienda a última hora)
//
// Si todo cuadra, intercambiamos el `code` por un access_token permanente y
// lo guardamos en ApiCredential(platform="shopify").
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import axios from "axios";
import { prisma } from "@/lib/db";
import {
  STATE_COOKIE_NAME,
  appUrl,
  normalizeShopDomain,
  shopDomainIsValid,
  verifyShopifyHmac,
} from "@/lib/shopify-oauth";

export const dynamic = "force-dynamic";

function fail(req: NextRequest, reason: string, extra?: Record<string, unknown>): NextResponse {
  console.error("[shopify-oauth] callback fail:", reason, extra || {});
  const url = new URL("/settings", appUrl(req));
  url.searchParams.set("shopify", "error");
  url.searchParams.set("reason", reason);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  console.log("[shopify-oauth] callback hit:", req.nextUrl.pathname, req.nextUrl.search);

  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return fail(req, "env_missing", { hasId: !!clientId, hasSecret: !!clientSecret });
  }

  const query = req.nextUrl.searchParams;
  const code = query.get("code");
  const stateQuery = query.get("state");
  const shopRaw = query.get("shop") || "";

  if (!code || !stateQuery || !shopRaw) {
    return fail(req, "bad_request", { hasCode: !!code, hasState: !!stateQuery, hasShop: !!shopRaw });
  }
  if (!shopDomainIsValid(shopRaw)) return fail(req, "bad_shop", { shopRaw });
  const shop = normalizeShopDomain(shopRaw);

  // 1. HMAC
  if (!verifyShopifyHmac(query, clientSecret)) {
    return fail(req, "hmac_invalid", { shop });
  }

  // 2. state + shop de la cookie
  const store = await cookies();
  const cookieVal = store.get(STATE_COOKIE_NAME)?.value || "";
  const [stateCookie, shopCookie] = cookieVal.split("|");
  if (!stateCookie || stateCookie !== stateQuery) {
    return fail(req, "state_mismatch", {
      hasCookie: !!cookieVal,
      cookieLen: cookieVal.length,
      queryLen: stateQuery.length,
    });
  }
  if (shopCookie && shopCookie !== shop) {
    return fail(req, "shop_mismatch", { shopCookie, shop });
  }

  // 3. Intercambiar code por access_token
  let accessToken: string;
  let scope: string | undefined;
  try {
    const { data } = await axios.post(
      `https://${shop}/admin/oauth/access_token`,
      { client_id: clientId, client_secret: clientSecret, code },
      { headers: { "Content-Type": "application/json" }, timeout: 15000 }
    );
    accessToken = String(data?.access_token || "");
    scope = typeof data?.scope === "string" ? data.scope : undefined;
    if (!accessToken) return fail(req, "no_token", { data });
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    const body = axios.isAxiosError(err) ? err.response?.data : undefined;
    return fail(req, "exchange_failed", { status, body, message: (err as Error).message });
  }

  // 4. Persistir credencial — merge con la config previa (preserva apiVersion).
  try {
    const existing = await prisma.apiCredential.findUnique({ where: { platform: "shopify" } });
    const prevConfig = (existing?.config as Record<string, string>) || {};
    const newConfig: Record<string, string> = {
      ...prevConfig,
      shopDomain: shop,
      accessToken,
    };
    if (scope) newConfig.scope = scope;
    if (!newConfig.apiVersion) newConfig.apiVersion = "2026-04";

    await prisma.apiCredential.upsert({
      where: { platform: "shopify" },
      update: { config: newConfig, isActive: true },
      create: { platform: "shopify", config: newConfig, isActive: true },
    });
    console.log("[shopify-oauth] callback OK — credential saved for", shop);
  } catch (err) {
    return fail(req, "persist_failed", { message: (err as Error).message });
  }

  // 5. Limpiar cookie de state y redirigir al settings.
  store.delete(STATE_COOKIE_NAME);
  const url = new URL("/settings", appUrl(req));
  url.searchParams.set("shopify", "connected");
  url.searchParams.set("shop", shop);
  return NextResponse.redirect(url);
}
