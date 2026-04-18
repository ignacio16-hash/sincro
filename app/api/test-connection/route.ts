import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import crypto from "crypto";
import { prisma } from "@/lib/db";

type TestResult = { ok: boolean; message: string };

async function testBsale(config: Record<string, string>): Promise<TestResult> {
  if (!config.accessToken) return { ok: false, message: "Falta el Access Token" };
  try {
    const { data } = await axios.get("https://api.bsale.io/v1/offices.json", {
      headers: { access_token: config.accessToken },
      params: { limit: 5 },
      timeout: 8000,
    });
    const count = data.count ?? (data.list?.length ?? 0);
    return { ok: true, message: `Conectado — ${count} bodega(s) encontrada(s)` };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const s = err.response?.status;
      if (s === 401) return { ok: false, message: "Token inválido (401 Unauthorized)" };
      return { ok: false, message: `Error ${s ?? "de red"}: ${err.message}` };
    }
    return { ok: false, message: (err as Error).message };
  }
}

async function testParis(config: Record<string, string>): Promise<TestResult> {
  if (!config.apiKey) return { ok: false, message: "Falta el Bearer Token" };
  if (!config.sellerId) return { ok: false, message: "Falta el Seller ID" };
  if (!config.baseUrl) return { ok: false, message: "Falta la Base URL" };
  try {
    await axios.get(`${config.baseUrl}/sellers/${config.sellerId}/products`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      params: { limit: 1 },
      timeout: 8000,
    });
    return { ok: true, message: "Conexión exitosa" };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const s = err.response?.status;
      if (s === 401 || s === 403) return { ok: false, message: "Credenciales inválidas" };
      if (s === 404) return { ok: true, message: "Conectado (endpoint alcanzado)" };
      return { ok: false, message: `Error ${s ?? "de red"}: ${err.message}` };
    }
    return { ok: false, message: (err as Error).message };
  }
}

async function testFalabella(config: Record<string, string>): Promise<TestResult> {
  if (!config.apiKey) return { ok: false, message: "Falta el API Key" };
  if (!config.userId) return { ok: false, message: "Falta el User ID (email)" };
  // linio.cl / linio.com.* are deprecated — all countries now use the same domain
  const BASE_URLS: Record<string, string> = {
    CL: "https://sellercenter-api.falabella.com/",
    PE: "https://sellercenter-api.falabella.com/",
    CO: "https://sellercenter-api.falabella.com/",
    MX: "https://sellercenter-api.falabella.com/",
  };
  const baseUrl = BASE_URLS[config.country || "CL"] || BASE_URLS.CL;
  // RFC 3339 format with colon in timezone offset: 2026-04-17T12:00:00+00:00
  const timestamp = new Date().toISOString().replace(/\.\d+Z$/, "+00:00");
  const params: Record<string, string> = {
    Action: "GetProducts",
    UserID: config.userId,
    Version: "1.0",
    Timestamp: timestamp,
    Format: "JSON",
    Limit: "1",
  };
  // Lazada/Falabella Seller Center: sort + rawurlencode(k)=rawurlencode(v) joined by "&" + HMAC-SHA256 lowercase hex
  const sorted = Object.keys(params).sort();
  const toSign = sorted
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join("&");
  params.Signature = crypto.createHmac("sha256", config.apiKey.trim()).update(toSign).digest("hex");
  const qs = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
  try {
    const { data } = await axios.get(`${baseUrl}?${qs}`, {
      headers: { "User-Agent": `SincroStock/${config.userId}/Node.js/1.0` },
      timeout: 8000,
    });
    // Falabella can return errors in either data.Head or data.ErrorResponse.Head
    const errCode = data?.Head?.ErrorCode ?? data?.ErrorResponse?.Head?.ErrorCode;
    if (errCode) {
      const errMsg = data?.Head?.ErrorMessage ?? data?.ErrorResponse?.Head?.ErrorMessage ?? JSON.stringify(data);
      return { ok: false, message: `Error Falabella (${errCode}): ${errMsg}` };
    }
    return { ok: true, message: "Conectado — credenciales válidas" };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const s = err.response?.status;
      if (s === 401 || s === 403) return { ok: false, message: "Credenciales inválidas" };
      return { ok: false, message: `Error ${s ?? "de red"}: ${err.message}` };
    }
    return { ok: false, message: (err as Error).message };
  }
}

async function testRipley(config: Record<string, string>): Promise<TestResult> {
  if (!config.apiKey) return { ok: false, message: "Falta el API Key" };
  if (!config.instanceUrl) return { ok: false, message: "Falta la Instance URL" };
  try {
    const { data } = await axios.get(`${config.instanceUrl}/api/offers`, {
      headers: { Authorization: config.apiKey },
      params: { max: 1 },
      timeout: 8000,
    });
    const count = data?.total_count ?? (data?.offers?.length ?? 0);
    return { ok: true, message: `Conectado — ${count} offer(s) encontrada(s)` };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const s = err.response?.status;
      if (s === 401 || s === 403) return { ok: false, message: "API Key inválida" };
      return { ok: false, message: `Error ${s ?? "de red"}: ${err.message}` };
    }
    return { ok: false, message: (err as Error).message };
  }
}

async function testRipleySvc(config: Record<string, string>): Promise<TestResult> {
  if (!config.username) return { ok: false, message: "Falta el usuario SVC" };
  if (!config.password) return { ok: false, message: "Falta la contraseña SVC" };
  const baseUrl = config.baseUrl || "https://sellercenter.ripleylabs.com";
  // Sin docs del API SVC, por ahora solo verificamos que la URL responde.
  // La integración real (login + etiquetas) se conectará cuando tengamos el endpoint.
  try {
    await axios.get(baseUrl, { timeout: 8000, maxRedirects: 2, validateStatus: () => true });
    return {
      ok: true,
      message: "Credenciales guardadas. Endpoint SVC pendiente de integración real (se requieren docs API).",
    };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      return { ok: false, message: `Base URL no responde: ${err.message}` };
    }
    return { ok: false, message: (err as Error).message };
  }
}

export async function POST(req: NextRequest) {
  const { platform, config: rawConfig } = await req.json() as {
    platform: string;
    config: Record<string, string>;
  };

  // Try to merge with stored credentials (for masked fields), but don't fail if DB is unavailable
  let storedConfig: Record<string, string> = {};
  try {
    const stored = await prisma.apiCredential.findUnique({ where: { platform } });
    storedConfig = (stored?.config as Record<string, string>) || {};
  } catch { /* DB not available — use rawConfig only */ }

  // rawConfig takes priority (fresh values override stored masked values)
  const config: Record<string, string> = { ...storedConfig, ...rawConfig };

  let result: TestResult;
  switch (platform) {
    case "bsale":     result = await testBsale(config); break;
    case "paris":     result = await testParis(config); break;
    case "falabella": result = await testFalabella(config); break;
    case "ripley":    result = await testRipley(config); break;
    case "ripley_svc": result = await testRipleySvc(config); break;
    default:          result = { ok: false, message: "Plataforma desconocida" };
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
