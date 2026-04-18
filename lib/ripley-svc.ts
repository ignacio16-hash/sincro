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

// Headers de navegador para bypass Cloudflare bot-detection.
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15",
  "Accept-Language": "es-419,es;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
};

// Intenta login con varios nombres de campo. Algunos SVC usan "email", otros "username".
async function attemptLogin(
  body: Record<string, string>,
  baseUrl: string
): Promise<{ status: number; setCookie?: string[]; bodyText: string }> {
  const res = await axios.post(`${baseUrl}/api/login`, body, {
    headers: {
      "Content-Type": "application/json",
      Accept: "*/*",
      Origin: baseUrl,
      Referer: `${baseUrl}/login`,
      ...BROWSER_HEADERS,
    },
    maxRedirects: 5,
    timeout: 15000,
    validateStatus: () => true,
    responseType: "text",
    transformResponse: [(d) => d],
  });
  return {
    status: res.status,
    setCookie: res.headers["set-cookie"] as string[] | undefined,
    bodyText: typeof res.data === "string" ? res.data : JSON.stringify(res.data),
  };
}

// Login y cachea cookie PRSVC. Prueba username, email y user como nombres de campo.
async function loginSvc(
  username: string,
  password: string,
  baseUrl: string
): Promise<CachedCookie> {
  const candidates: Record<string, string>[] = [
    { username, password },
    { email: username, password },
    { user: username, password },
    { login: username, password },
  ];

  let lastError = "";
  for (const body of candidates) {
    const { status, setCookie, bodyText } = await attemptLogin(body, baseUrl);
    if (status >= 200 && status < 400 && setCookie) {
      const prsvc = setCookie.find((c) => c.startsWith("PRSVC="));
      if (prsvc) {
        const cookieHeader = prsvc.split(";")[0];
        const maxAgeMatch = /Max-Age=(\d+)/i.exec(prsvc);
        const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 3600;
        const expiresAt = Date.now() + (maxAge - 300) * 1000;
        return { value: prsvc, cookieHeader, expiresAt };
      }
    }
    lastError = `status=${status} body=${bodyText.slice(0, 200)}`;
  }

  throw new Error(`Ripley SVC login falló con todos los campos probados. Último: ${lastError}`);
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
        ...BROWSER_HEADERS,
      },
      responseType: "arraybuffer",
      timeout: 20000,
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
          ...BROWSER_HEADERS,
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
