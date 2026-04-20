"use client";

import { useCallback, useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FalabellaItem {
  orderItemId: string;
  sku: string;
  shopSku: string;
  name: string;
  quantity: number;
  price: number;
  status: string;
  imageUrl: string | null;
}

interface FalabellaOrder {
  orderId: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  // Fecha tope para entregar al operador logístico (Falabella PromisedShippingTime)
  promisedShippingTime: string | null;
  items: FalabellaItem[];
}

interface RipleyLine {
  orderLineId: string;
  offerSku: string;
  productTitle: string;
  quantity: number;
  price: number;
  orderLineState: string;
  imageUrl: string | null;
}

interface RipleyOrder {
  orderId: string;
  orderState: string;
  createdDate: string;
  currencyCode: string;
  orderLines: RipleyLine[];
}

interface OrdersData {
  falabella: FalabellaOrder[];
  ripley: RipleyOrder[];
}

function formatDate(s: string) {
  if (!s) return "—";
  try { return new Date(s).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" }); }
  catch { return s; }
}

// ─── Cache helpers ────────────────────────────────────────────────────────────
// Guardamos los pedidos ya vistos en localStorage por usuario para que:
//   · Al volver a la página se muestren de inmediato (sin loader).
//   · "Actualizar" solo mergee los nuevos en vez de borrar todo.
// Tope de 500 por marketplace para no pasarnos del cupo (~5MB) de localStorage.

const CACHE_MAX = 500;

function cacheKeys(username: string | null) {
  const u = username || "anon";
  return {
    falabella: `orders:${u}:falabella`,
    ripley: `orders:${u}:ripley`,
  };
}

function readCache<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeCache<T>(key: string, data: T[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // quota excedida u otro error — descartamos silenciosamente
  }
}

// Merge: el fetch nuevo pisa al caché si el orderId coincide (así un pedido
// que pasó de "pending" a "shipped" se actualiza). Los que solo están en
// caché se preservan (quedaron fuera del window de la API pero siguen siendo
// válidos para la UI).
function mergeFalabella(cached: FalabellaOrder[], fetched: FalabellaOrder[]): FalabellaOrder[] {
  const byId = new Map<string, FalabellaOrder>();
  for (const o of cached) byId.set(o.orderId, o);
  for (const o of fetched) byId.set(o.orderId, o);
  return [...byId.values()]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, CACHE_MAX);
}

function mergeRipley(cached: RipleyOrder[], fetched: RipleyOrder[]): RipleyOrder[] {
  const byId = new Map<string, RipleyOrder>();
  for (const o of cached) byId.set(o.orderId, o);
  for (const o of fetched) byId.set(o.orderId, o);
  return [...byId.values()]
    .sort((a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime())
    .slice(0, CACHE_MAX);
}

function countNew<T extends { orderId: string }>(cached: T[], fetched: T[]): number {
  const seen = new Set(cached.map((o) => o.orderId));
  return fetched.filter((o) => !seen.has(o.orderId)).length;
}

// Etiquetas de estado SOLO para mostrar en la UI.
// Nunca usar estas traducciones para filtrar, comparar o enviar a las APIs —
// los estados crudos (pending, SHIPPING, etc.) tienen que seguir siendo la
// única fuente de verdad en la lógica.
const FALABELLA_STATE_ES: Record<string, string> = {
  pending: "Pendiente",
  canceled: "Cancelado",
  ready_to_ship: "Listo para envío",
  shipped: "Enviado",
  delivered: "Entregado",
  returned: "Devuelto",
  failed: "Fallido",
};

const RIPLEY_STATE_ES: Record<string, string> = {
  STAGING: "Borrador",
  WAITING_ACCEPTANCE: "Esperando aceptación",
  WAITING_DEBIT: "Esperando pago",
  WAITING_DEBIT_PAYMENT: "Esperando pago",
  SHIPPING: "En preparación",
  SHIPPED: "Enviado",
  TO_COLLECT: "Por recoger",
  RECEIVED: "Recibido",
  CLOSED: "Cerrado",
  REFUSED: "Rechazado",
  CANCELED: "Cancelado",
  REFUNDED: "Reembolsado",
  INCIDENT_OPEN: "Incidencia abierta",
};

function translateState(market: "falabella" | "ripley", state: string): string {
  if (!state) return "—";
  if (market === "falabella") {
    return FALABELLA_STATE_ES[state.toLowerCase()] ?? state;
  }
  return RIPLEY_STATE_ES[state.toUpperCase()] ?? state;
}

function StateChip({ state, market }: { state: string; market: "falabella" | "ripley" }) {
  return (
    <span className="inline-block text-[10px] font-bold tracking-[0.2em] border border-black px-2 py-0.5">
      {translateState(market, state)}
    </span>
  );
}

function DownloadLabelButton({
  platform,
  orderId,
  orderItemIds,
}: {
  platform: "falabella" | "ripley";
  orderId?: string;
  orderItemIds?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ platform });
      if (orderId) params.set("orderId", orderId);
      if (orderItemIds) params.set("orderItemIds", orderItemIds);
      const res = await fetch(`/api/orders/label?${params}`);
      if (!res.ok) {
        const j = await res.json();
        setError(j.error || "Error al descargar");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `etiqueta-${orderId || "falabella"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={download}
        disabled={loading}
        className="text-[10px] font-bold tracking-[0.2em] px-3 py-2 border border-black hover:bg-black hover:text-white disabled:opacity-40 flex items-center gap-2"
      >
        {loading && <span className="w-2 h-2 border border-current border-t-transparent rounded-full animate-spin inline-block" />}
        Etiqueta PDF
      </button>
      {error && <p className="text-[10px] font-light text-red-700 tracking-wider">{error}</p>}
    </div>
  );
}

type MarketTab = "ripley" | "falabella";

export default function OrdersPage() {
  const [data, setData] = useState<OrdersData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<MarketTab>("ripley");
  const [username, setUsername] = useState<string | null>(null);
  const [userResolved, setUserResolved] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Resolver el usuario primero para namespar las keys de caché.
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d: { user: { username: string } | null }) => setUsername(d.user?.username ?? null))
      .catch(() => setUsername(null))
      .finally(() => setUserResolved(true));
  }, []);

  // Hidratar desde caché una vez que sepamos el usuario (incluso si /me falló,
  // caemos a "anon" como fallback). Si no hay nada cacheado, disparamos el
  // fetch inicial; si hay algo, lo mostramos y esperamos a que el usuario
  // apriete "Actualizar".
  useEffect(() => {
    if (!userResolved) return;
    const keys = cacheKeys(username);
    const cachedF = readCache<FalabellaOrder>(keys.falabella);
    const cachedR = readCache<RipleyOrder>(keys.ripley);
    const hasCache = cachedF.length > 0 || cachedR.length > 0;
    setData({ falabella: cachedF, ripley: cachedR });
    if (!hasCache) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userResolved, username]);

  // Toast de "N pedidos nuevos" durante 5s.
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/orders");
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Error al cargar pedidos"); return; }

      const keys = cacheKeys(username);
      const prevF = readCache<FalabellaOrder>(keys.falabella);
      const prevR = readCache<RipleyOrder>(keys.ripley);
      const fetchedF: FalabellaOrder[] = json.falabella ?? [];
      const fetchedR: RipleyOrder[] = json.ripley ?? [];

      const mergedF = mergeFalabella(prevF, fetchedF);
      const mergedR = mergeRipley(prevR, fetchedR);
      writeCache(keys.falabella, mergedF);
      writeCache(keys.ripley, mergedR);
      setData({ falabella: mergedF, ripley: mergedR });

      // Solo mostramos toast en refresh (cuando ya había algo cacheado).
      const nuevos = countNew(prevF, fetchedF) + countNew(prevR, fetchedR);
      if ((prevF.length > 0 || prevR.length > 0) && nuevos > 0) {
        setToast(`${nuevos} pedido${nuevos === 1 ? "" : "s"} nuevo${nuevos === 1 ? "" : "s"}`);
      }
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }, [username]);

  // Conteos por estado clave: pending (Falabella) y SHIPPING (Ripley)
  const falabellaPending = data?.falabella.filter((o) => o.status === "pending").length ?? 0;
  const ripleyShipping = data?.ripley.filter((o) => o.orderState === "SHIPPING").length ?? 0;

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10">
      {/* Toast — aparece 5s cuando "Actualizar" trae pedidos nuevos */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 right-4 z-50 bg-black text-white text-[11px] font-bold tracking-[0.2em] px-4 py-3 border border-black shadow-lg"
        >
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6 lg:mb-10 pb-6 border-b border-black">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-[0.15em]">Pedidos</h1>
          <p className="text-[11px] font-light tracking-widest text-neutral-500 mt-2">
            Órdenes recientes de Falabella y Ripley (Mirakl)
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="self-start text-xs font-bold tracking-[0.25em] underline underline-offset-[6px] hover:no-underline disabled:opacity-40 flex items-center gap-2"
        >
          {loading && <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin inline-block" />}
          Actualizar
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 border border-black text-xs font-light tracking-wider">
          {error}
        </div>
      )}

      {/* Tabs — el conteo entre paréntesis es solo el de pedidos en el estado clave:
            · Ripley   → SHIPPING
            · Falabella → pending */}
      <div className="flex gap-8 mb-6 border-b border-neutral-200 pb-4">
        {([
          { key: "ripley" as MarketTab, label: `Ripley (${ripleyShipping})` },
          { key: "falabella" as MarketTab, label: `Falabella (${falabellaPending})` },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            data-active={tab === t.key}
            className={`text-xs tracking-[0.2em] pb-1 ${
              tab === t.key ? "font-bold border-b border-black" : "font-light text-neutral-500 hover:text-black"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && !data && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="border border-black p-6">
              <div className="h-3 bg-neutral-100 animate-pulse mb-3 w-1/4" />
              <div className="h-2 bg-neutral-100 animate-pulse w-1/2" />
            </div>
          ))}
        </div>
      )}

      {data && tab === "ripley" && (
        <div className="space-y-4">
          {data.ripley.length === 0 && (
            <div className="text-center py-20 text-neutral-400 font-light text-xs tracking-widest border border-black">
              No hay pedidos de Ripley
            </div>
          )}
          {data.ripley.map((order) => (
            <div key={order.orderId} className="border border-black overflow-hidden">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 px-4 lg:px-6 py-4 border-b border-black bg-neutral-50">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-light tracking-[0.25em] text-neutral-500">Orden #</span>
                    <span className="font-mono text-sm font-bold mt-1">{order.orderId}</span>
                  </div>
                  <StateChip state={order.orderState} market="ripley" />
                  <span className="text-[10px] font-light tracking-widest text-neutral-400">{formatDate(order.createdDate)}</span>
                </div>
                <DownloadLabelButton platform="ripley" orderId={order.orderId} />
              </div>

              <div className="divide-y divide-neutral-200">
                {order.orderLines.map((line) => (
                  <div key={line.orderLineId} className="flex flex-col sm:flex-row sm:items-center gap-4 px-4 lg:px-6 py-4">
                    <div className="w-16 h-16 bg-neutral-100 flex-shrink-0 overflow-hidden">
                      {line.imageUrl ? (
                        <img
                          src={line.imageUrl}
                          alt={line.productTitle}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg className="w-5 h-5 text-neutral-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="square" strokeWidth={1.5}
                              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-light text-xs tracking-wider truncate">{line.productTitle || "—"}</p>
                      <p className="font-mono text-xs font-bold mt-1">{line.offerSku}</p>
                    </div>

                    <div className="flex sm:flex-col sm:text-center items-baseline gap-2">
                      <p className="text-2xl font-bold">{line.quantity}</p>
                      <p className="text-[10px] font-light tracking-widest text-neutral-400">Unidades</p>
                    </div>

                    <div className="flex sm:flex-col items-start sm:items-end gap-2">
                      <p className="text-xs font-bold tracking-wider">
                        {order.currencyCode} {line.price.toLocaleString("es-CL")}
                      </p>
                      <StateChip state={line.orderLineState} market="ripley" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {data && tab === "falabella" && (
        <div className="space-y-4">
          {data.falabella.length === 0 && (
            <div className="text-center py-20 text-neutral-400 font-light text-xs tracking-widest border border-black">
              No hay pedidos de Falabella
            </div>
          )}
          {data.falabella.map((order) => (
            <div key={order.orderId} className="border border-black overflow-hidden">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 px-4 lg:px-6 py-4 border-b border-black bg-neutral-50">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-light tracking-[0.25em] text-neutral-500">Orden #</span>
                    <span className="font-mono text-sm font-bold mt-1">{order.orderNumber}</span>
                    {order.orderNumber !== order.orderId && (
                      <span className="font-mono text-[10px] font-light text-neutral-400 mt-0.5">id: {order.orderId}</span>
                    )}
                  </div>
                  <StateChip state={order.status} market="falabella" />
                  <span className="text-[10px] font-light tracking-widest text-neutral-400">{formatDate(order.createdAt)}</span>
                </div>
                <DownloadLabelButton
                  platform="falabella"
                  orderItemIds={order.items.map((i) => i.orderItemId).join(",")}
                />
              </div>

              <div className="divide-y divide-neutral-200">
                {order.items.map((item) => (
                  <div key={item.orderItemId} className="flex flex-col sm:flex-row sm:items-center gap-4 px-4 lg:px-6 py-4">
                    <div className="w-16 h-16 bg-neutral-100 flex-shrink-0 overflow-hidden flex items-center justify-center">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          onError={(e) => {
                            const img = e.target as HTMLImageElement;
                            img.style.display = "none";
                            (img.parentElement?.querySelector("svg") as SVGElement | null)?.style.setProperty("display", "block");
                          }}
                        />
                      ) : null}
                      <svg
                        className="w-5 h-5 text-neutral-300"
                        style={{ display: item.imageUrl ? "none" : "block" }}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="square" strokeWidth={1.5}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-light text-xs tracking-wider truncate">{item.name || "—"}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-light tracking-[0.2em] text-neutral-500">SKU Seller</span>
                        <span className="font-mono text-xs font-bold">{item.sku || "—"}</span>
                        {item.shopSku && item.shopSku !== item.sku && (
                          <span className="font-mono text-[10px] font-light text-neutral-400">shop: {item.shopSku}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex sm:flex-col sm:text-center items-baseline gap-2">
                      <p className="text-2xl font-bold">{item.quantity}</p>
                      <p className="text-[10px] font-light tracking-widest text-neutral-400">Unidades</p>
                    </div>

                    <div className="flex sm:flex-col items-start sm:items-end gap-2">
                      <p className="text-xs font-bold tracking-wider">
                        CLP {item.price.toLocaleString("es-CL")}
                      </p>
                      <StateChip state={item.status} market="falabella" />
                    </div>
                  </div>
                ))}
                {order.items.length === 0 && (
                  <p className="px-6 py-4 text-xs font-light tracking-wider text-neutral-400">Sin items</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
