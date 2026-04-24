// GET /api/shopify/oauth/install?shop=<tienda>.myshopify.com
//
// Inicia el OAuth de Shopify. Admin-only (además del proxy.ts, validamos el
// role acá porque este endpoint arranca el install con privilegios sobre la
// tienda).
//
// Setea una cookie `shopify_oauth_state` con un nonce (HttpOnly, SameSite=Lax
// para sobrevivir el bounce de Shopify) y redirige al authorize de Shopify.
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import {
  STATE_COOKIE_NAME,
  STATE_COOKIE_TTL_SEC,
  appUrl,
  buildAuthorizeUrl,
  normalizeShopDomain,
  randomNonce,
  shopDomainIsValid,
} from "@/lib/shopify-oauth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Solo admin puede conectar Shopify" }, { status: 403 });
  }

  const clientId = process.env.SHOPIFY_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "Falta SHOPIFY_CLIENT_ID en el entorno" },
      { status: 500 }
    );
  }

  const shopRaw = req.nextUrl.searchParams.get("shop") || "";
  if (!shopDomainIsValid(shopRaw)) {
    return NextResponse.json(
      { error: "Shop Domain inválido. Debe ser <tienda>.myshopify.com" },
      { status: 400 }
    );
  }
  const shop = normalizeShopDomain(shopRaw);

  const state = randomNonce();
  const redirectUri = `${appUrl(req)}/api/shopify/oauth/callback`;
  const authorize = buildAuthorizeUrl(shop, clientId, redirectUri, state);

  const store = await cookies();
  store.set(STATE_COOKIE_NAME, `${state}|${shop}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: STATE_COOKIE_TTL_SEC,
  });

  return NextResponse.redirect(authorize);
}
