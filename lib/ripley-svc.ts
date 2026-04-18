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

// GET /api/order/{orderId} → detalle orden con labels[]._id
// orderId típicamente viene como "24512529402-A" (commercial_id + sufijo).
// Si recibimos solo el commercial_id, probamos el formato con "-A".
async function fetchOrderLabelId(
  orderId: string,
  cookie: string,
  baseUrl: string
): Promise<{ labelId: string; resolvedOrderId: string }> {
  const candidates = /-[A-Z]$/.test(orderId) ? [orderId] : [`${orderId}-A`, orderId];
  let lastError = "";
  for (const candidate of candidates) {
    const res = await axios.get(`${baseUrl}/api/order/${candidate}`, {
      headers: {
        Accept: "application/json",
        Cookie: cookie,
        Referer: `${baseUrl}/order/${candidate}`,
        ...BROWSER_HEADERS,
      },
      timeout: 15000,
      validateStatus: () => true,
    });
    if (res.status >= 200 && res.status < 300 && res.data) {
      const data = res.data as { labels?: Array<{ _id: string; active?: boolean }> };
      const labels = data.labels || [];
      const active = labels.find((l) => l.active) || labels[0];
      if (active?._id) {
        return { labelId: active._id, resolvedOrderId: candidate };
      }
      lastError = `orden ${candidate} sin labels`;
      continue;
    }
    lastError = `GET /api/order/${candidate} → ${res.status}`;
  }
  throw new Error(`No se pudo obtener label_id. ${lastError}`);
}

// Flujo: GET /api/order/{id} para obtener labels[]._id → POST /api/label/print
// con body { labels: [{ label_id }] }. Responde PDF binario.
export async function getRipleySvcLabel(
  username: string,
  password: string,
  orderId: string,
  baseUrlInput?: string
): Promise<{ data: Buffer; contentType: string }> {
  const baseUrl = (baseUrlInput || DEFAULT_BASE_URL).replace(/\/$/, "");
  let cookie = await getValidCookie(username, password, baseUrl);

  let resolved: { labelId: string; resolvedOrderId: string };
  try {
    resolved = await fetchOrderLabelId(orderId, cookie, baseUrl);
  } catch (err) {
    // Cookie pudo haber expirado; re-login y reintento
    cookieCache.delete(cacheKey(username, baseUrl));
    cookie = await getValidCookie(username, password, baseUrl);
    resolved = await fetchOrderLabelId(orderId, cookie, baseUrl);
    void err;
  }

  const printBody = { labels: [{ label_id: resolved.labelId }] };
  const res = await axios.post(`${baseUrl}/api/label/print`, printBody, {
    headers: {
      "Content-Type": "application/json",
      Accept: "*/*",
      Cookie: cookie,
      Origin: baseUrl,
      Referer: `${baseUrl}/order/${resolved.resolvedOrderId}`,
      ...BROWSER_HEADERS,
    },
    responseType: "arraybuffer",
    timeout: 20000,
    validateStatus: () => true,
  });

  if (res.status === 401 || res.status === 403) {
    cookieCache.delete(cacheKey(username, baseUrl));
    const freshCookie = await getValidCookie(username, password, baseUrl);
    const retry = await axios.post(`${baseUrl}/api/label/print`, printBody, {
      headers: {
        "Content-Type": "application/json",
        Accept: "*/*",
        Cookie: freshCookie,
        Origin: baseUrl,
        Referer: `${baseUrl}/order/${resolved.resolvedOrderId}`,
        ...BROWSER_HEADERS,
      },
      responseType: "arraybuffer",
      timeout: 20000,
    });
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
