import axios from "axios";

// Ripley SVC (SellerCenter) — operación logística
// Auth: POST /api/login { username, password } → Set-Cookie: PRSVC=...
// Cookie válida ~16 horas (Max-Age=60000). Cacheamos en memoria.
// Labels: POST /api/label/print { orderNumber } → PDF (base64 en text/plain gzipped).

const DEFAULT_BASE_URL = "https://sellercenter.ripleylabs.com";

interface CachedCookie {
  value: string; // el string completo "PRSVC=...; ...attrs"
  cookieHeader: string; // solo "PRSVC=..." para header Cookie
  expiresAt: number; // epoch ms
}

const cookieCache = new Map<string, CachedCookie>();

function cacheKey(username: string, baseUrl: string): string {
  return `${baseUrl}::${username}`;
}

// Login y cachea cookie PRSVC.
async function loginSvc(
  username: string,
  password: string,
  baseUrl: string
): Promise<CachedCookie> {
  const res = await axios.post(
    `${baseUrl}/api/login`,
    { username, password },
    {
      headers: { "Content-Type": "application/json", Accept: "*/*" },
      maxRedirects: 5,
      timeout: 15000,
      validateStatus: (s) => s >= 200 && s < 400,
    }
  );

  const setCookie = res.headers["set-cookie"];
  if (!setCookie || !Array.isArray(setCookie) || setCookie.length === 0) {
    throw new Error("Ripley SVC login: no se recibió Set-Cookie");
  }

  const prsvc = setCookie.find((c) => c.startsWith("PRSVC="));
  if (!prsvc) {
    throw new Error("Ripley SVC login: no se recibió cookie PRSVC");
  }

  // Extrae solo el valor "PRSVC=..." hasta el primer ";"
  const cookieHeader = prsvc.split(";")[0];

  // Parsea Max-Age para calcular expiración (con margen de 5 min)
  const maxAgeMatch = /Max-Age=(\d+)/i.exec(prsvc);
  const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 3600;
  const expiresAt = Date.now() + (maxAge - 300) * 1000;

  return { value: prsvc, cookieHeader, expiresAt };
}

// Obtiene cookie válida (cacheada o re-login).
async function getValidCookie(
  username: string,
  password: string,
  baseUrl: string
): Promise<string> {
  const key = cacheKey(username, baseUrl);
  const cached = cookieCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.cookieHeader;
  }

  const fresh = await loginSvc(username, password, baseUrl);
  cookieCache.set(key, fresh);
  return fresh.cookieHeader;
}

// POST /api/label/print → etiqueta de envío (PDF).
// Returns raw response data. Body asumido: { orderNumber }. Si falla con 400
// y el campo correcto fuera "orderId", probar ajustar.
export async function getRipleySvcLabel(
  username: string,
  password: string,
  orderNumber: string,
  baseUrlInput?: string
): Promise<{ data: Buffer; contentType: string }> {
  const baseUrl = (baseUrlInput || DEFAULT_BASE_URL).replace(/\/$/, "");
  const cookie = await getValidCookie(username, password, baseUrl);

  const res = await axios.post(
    `${baseUrl}/api/label/print`,
    { orderNumber },
    {
      headers: {
        "Content-Type": "application/json",
        Accept: "*/*",
        Cookie: cookie,
        Origin: baseUrl,
        Referer: `${baseUrl}/order/${orderNumber}`,
      },
      responseType: "arraybuffer",
      timeout: 20000,
      // No lanzar para 401 — re-login y reintento
      validateStatus: () => true,
    }
  );

  // Si la cookie expiró (401/403), re-login y reintento una vez
  if (res.status === 401 || res.status === 403) {
    cookieCache.delete(cacheKey(username, baseUrl));
    const freshCookie = await getValidCookie(username, password, baseUrl);
    const retry = await axios.post(
      `${baseUrl}/api/label/print`,
      { orderNumber },
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "*/*",
          Cookie: freshCookie,
          Origin: baseUrl,
          Referer: `${baseUrl}/order/${orderNumber}`,
        },
        responseType: "arraybuffer",
        timeout: 20000,
      }
    );
    return {
      data: Buffer.from(retry.data as ArrayBuffer),
      contentType: String(retry.headers["content-type"] || "application/pdf"),
    };
  }

  if (res.status < 200 || res.status >= 300) {
    const bodyText = Buffer.from(res.data as ArrayBuffer).toString("utf-8").slice(0, 300);
    throw new Error(`Ripley SVC /api/label/print ${res.status}: ${bodyText}`);
  }

  return {
    data: Buffer.from(res.data as ArrayBuffer),
    contentType: String(res.headers["content-type"] || "application/pdf"),
  };
}
