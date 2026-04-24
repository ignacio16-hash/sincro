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

interface ShopifyItem {
  lineItemId: string;
  productId: string | null;
  variantId: string | null;
  title: string;
  sku: string;
  quantity: number;
  imageUrl: string | null;
}

interface ShopifyOrder {
  orderId: string;
  orderName: string;
  createdAt: string;
  items: ShopifyItem[];
  hasLabel: boolean;
  isShipped: boolean;
  shippedAt: string | null;
  shippedBy: string | null;
}

// ─── Paris ────────────────────────────────────────────────────────────────────
// Paris entrega una orden como un agrupador (originOrderNumber) que contiene
// sub-órdenes (subOrderNumber). Cada sub-orden tiene su propio estado de
// despacho y sus items. Para la UI mostramos las líneas planas con el estado
// del ITEM (que es el más granular — un item puede estar "delivered" aunque
// la sub-orden siga "in_preparation"), y el conteo de pendientes agrupa por
// item no cerrado.
interface ParisItem {
  itemId: string;
  sku: string;
  parisSku: string;
  name: string;
  quantity: number;
  price: number;
  status: string;
  imageUrl: string | null;
}

interface ParisSubOrder {
  subOrderNumber: string;
  status: string;
  statusId: number | null;
  carrier: string | null;
  trackingNumber: string | null;
  dispatchDate: string | null;
  items: ParisItem[];
}

interface ParisOrder {
  orderId: string;
  orderNumber: string;
  createdAt: string;
  customerName: string | null;
  subOrders: ParisSubOrder[];
}

// Mismo criterio que lib/paris.ts#isParisItemPending — duplicado porque el UI
// no puede importar código server-side libremente. Tolerar variantes tanto en
// EN como ES para no contar de menos si Paris cambia la descripción del estado.
const PARIS_CLOSED_STATES = ["delivered", "shipped", "cancelled", "canceled", "returned", "entregado", "enviado", "cancelado"];
function isParisItemPending(statusName: string): boolean {
  const s = (statusName || "").toLowerCase();
  return !PARIS_CLOSED_STATES.some((k) => s.includes(k));
}

interface OrdersData {
  falabella: FalabellaOrder[];
  ripley: RipleyOrder[];
  shopify: ShopifyOrder[];
  paris: ParisOrder[];
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
    shopify: `orders:${u}:shopify`,
    paris: `orders:${u}:paris`,
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

function mergeShopify(cached: ShopifyOrder[], fetched: ShopifyOrder[]): ShopifyOrder[] {
  const byId = new Map<string, ShopifyOrder>();
  for (const o of cached) byId.set(o.orderId, o);
  for (const o of fetched) byId.set(o.orderId, o);
  return [...byId.values()]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, CACHE_MAX);
}

function mergeParis(cached: ParisOrder[], fetched: ParisOrder[]): ParisOrder[] {
  const byId = new Map<string, ParisOrder>();
  for (const o of cached) byId.set(o.orderId, o);
  for (const o of fetched) byId.set(o.orderId, o);
  return [...byId.values()]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
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
        {loading && <span className="w-2 h-2 border border-current border-t-transparent spinner-ring animate-spin inline-block" />}
        Etiqueta PDF
      </button>
      {error && <p className="text-[10px] font-light text-red-700 tracking-wider">{error}</p>}
    </div>
  );
}

// ─── Shopify label actions ────────────────────────────────────────────────────
// Admin: puede subir / reemplazar / borrar.
// Vendedor: solo puede descargar si ya hay una etiqueta subida.
function ShopifyLabelActions({
  orderId,
  hasLabel,
  role,
  onChange,
}: {
  orderId: string;
  hasLabel: boolean;
  role: "admin" | "vendedor" | null;
  onChange: (next: boolean) => void;
}) {
  const [busy, setBusy] = useState<"upload" | "delete" | "download" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy("download");
    setError(null);
    try {
      const res = await fetch(`/api/orders/label/shopify?orderId=${encodeURIComponent(orderId)}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "Error al descargar");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `etiqueta-shopify-${orderId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Error de red");
    } finally {
      setBusy(null);
    }
  }

  async function upload(file: File) {
    if (file.type !== "application/pdf") {
      setError("Solo se aceptan PDF");
      return;
    }
    setBusy("upload");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/orders/label/shopify?orderId=${encodeURIComponent(orderId)}`, {
        method: "POST",
        body: fd,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || "Error al subir");
        return;
      }
      onChange(true);
    } catch {
      setError("Error de red");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!window.confirm("¿Quitar la etiqueta de este pedido?")) return;
    setBusy("delete");
    setError(null);
    try {
      const res = await fetch(`/api/orders/label/shopify?orderId=${encodeURIComponent(orderId)}`, {
        method: "DELETE",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || "Error al borrar");
        return;
      }
      onChange(false);
    } catch {
      setError("Error de red");
    } finally {
      setBusy(null);
    }
  }

  // Vendedor: solo descarga si hay; si no, mensaje gris.
  if (role === "vendedor") {
    if (!hasLabel) {
      return (
        <p className="text-[10px] font-light tracking-[0.2em] text-neutral-400">
          Sin etiqueta disponible
        </p>
      );
    }
    return (
      <div className="flex flex-col items-start gap-1">
        <span className="text-[9px] font-bold tracking-[0.25em] text-neutral-500 uppercase">
          Ticket de envío
        </span>
        <button
          onClick={download}
          disabled={busy !== null}
          className="text-[10px] font-bold tracking-[0.2em] px-3 py-2 border border-black hover:bg-black hover:text-white disabled:opacity-40 flex items-center gap-2"
        >
          {busy === "download" && <span className="w-2 h-2 border border-current border-t-transparent spinner-ring animate-spin inline-block" />}
          Descargar ticket
        </button>
        {error && <p className="text-[10px] font-light text-red-700 tracking-wider">{error}</p>}
      </div>
    );
  }

  // Admin
  return (
    <div className="flex flex-col items-start gap-2">
      <span className="text-[9px] font-bold tracking-[0.25em] text-neutral-500 uppercase">
        Ticket de envío
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {hasLabel && (
          <button
            onClick={download}
            disabled={busy !== null}
            className="text-[10px] font-bold tracking-[0.2em] px-3 py-2 border border-black hover:bg-black hover:text-white disabled:opacity-40 flex items-center gap-2"
          >
            {busy === "download" && <span className="w-2 h-2 border border-current border-t-transparent spinner-ring animate-spin inline-block" />}
            Descargar ticket
          </button>
        )}
        <label className="text-[10px] font-bold tracking-[0.2em] px-3 py-2 border border-black hover:bg-black hover:text-white disabled:opacity-40 flex items-center gap-2 cursor-pointer">
          {busy === "upload" && <span className="w-2 h-2 border border-current border-t-transparent spinner-ring animate-spin inline-block" />}
          {hasLabel ? "Reemplazar ticket" : "Adjuntar ticket (PDF)"}
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            disabled={busy !== null}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
        </label>
        {hasLabel && (
          <button
            onClick={remove}
            disabled={busy !== null}
            className="text-[10px] font-light tracking-[0.2em] text-neutral-500 hover:text-black underline underline-offset-[3px] disabled:opacity-40"
          >
            Quitar
          </button>
        )}
      </div>
      {error && <p className="text-[10px] font-light text-red-700 tracking-wider">{error}</p>}
    </div>
  );
}

// Toggle de "enviado" local (no se empuja a Shopify). Admin y vendedor pueden
// marcar / desmarcar. Cuando está marcado, se muestra chip + metadata; cuando
// no, un botón para marcar.
function ShopifyShippedToggle({
  orderId,
  isShipped,
  shippedAt,
  shippedBy,
  onChange,
}: {
  orderId: string;
  isShipped: boolean;
  shippedAt: string | null;
  shippedBy: string | null;
  onChange: (next: { isShipped: boolean; shippedAt: string | null; shippedBy: string | null }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/orders/shipped/shopify?orderId=${encodeURIComponent(orderId)}`,
        { method: next ? "POST" : "DELETE" }
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || "Error");
        return;
      }
      onChange({
        isShipped: !!j.isShipped,
        shippedAt: j.shippedAt ?? null,
        shippedBy: j.shippedBy ?? null,
      });
    } catch {
      setError("Error de red");
    } finally {
      setBusy(false);
    }
  }

  if (isShipped) {
    return (
      <div className="flex flex-col items-start gap-1">
        <div className="flex items-center gap-2">
          <span className="inline-block text-[10px] font-bold tracking-[0.2em] bg-black text-white px-2 py-0.5">
            Enviado
          </span>
          <button
            onClick={() => toggle(false)}
            disabled={busy}
            className="text-[10px] font-light tracking-[0.2em] text-neutral-500 hover:text-black underline underline-offset-[3px] disabled:opacity-40"
          >
            Deshacer
          </button>
        </div>
        {(shippedBy || shippedAt) && (
          <p className="text-[10px] font-light tracking-widest text-neutral-400">
            {shippedBy ? `por ${shippedBy}` : ""}{shippedBy && shippedAt ? " · " : ""}{shippedAt ? formatDate(shippedAt) : ""}
          </p>
        )}
        {error && <p className="text-[10px] font-light text-red-700 tracking-wider">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={() => toggle(true)}
        disabled={busy}
        className="text-[10px] font-bold tracking-[0.2em] px-3 py-2 border border-black hover:bg-black hover:text-white disabled:opacity-40 flex items-center gap-2"
      >
        {busy && <span className="w-2 h-2 border border-current border-t-transparent spinner-ring animate-spin inline-block" />}
        Marcar enviado
      </button>
      {error && <p className="text-[10px] font-light text-red-700 tracking-wider">{error}</p>}
    </div>
  );
}

type MarketTab = "ripley" | "falabella" | "shopify" | "paris";

export default function OrdersPage() {
  const [data, setData] = useState<OrdersData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<MarketTab>("ripley");
  const [username, setUsername] = useState<string | null>(null);
  const [role, setRole] = useState<"admin" | "vendedor" | null>(null);
  const [userResolved, setUserResolved] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Resolver el usuario primero para namespar las keys de caché.
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d: { user: { username: string; role: "admin" | "vendedor" } | null }) => {
        setUsername(d.user?.username ?? null);
        setRole(d.user?.role ?? null);
      })
      .catch(() => { setUsername(null); setRole(null); })
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
    const cachedS = readCache<ShopifyOrder>(keys.shopify);
    const cachedP = readCache<ParisOrder>(keys.paris);
    const hasCache = cachedF.length > 0 || cachedR.length > 0 || cachedS.length > 0 || cachedP.length > 0;
    setData({ falabella: cachedF, ripley: cachedR, shopify: cachedS, paris: cachedP });
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
      const prevS = readCache<ShopifyOrder>(keys.shopify);
      const prevP = readCache<ParisOrder>(keys.paris);
      const fetchedF: FalabellaOrder[] = json.falabella ?? [];
      const fetchedR: RipleyOrder[] = json.ripley ?? [];
      const fetchedS: ShopifyOrder[] = json.shopify ?? [];
      const fetchedP: ParisOrder[] = json.paris ?? [];

      const mergedF = mergeFalabella(prevF, fetchedF);
      const mergedR = mergeRipley(prevR, fetchedR);
      const mergedS = mergeShopify(prevS, fetchedS);
      const mergedP = mergeParis(prevP, fetchedP);
      writeCache(keys.falabella, mergedF);
      writeCache(keys.ripley, mergedR);
      writeCache(keys.shopify, mergedS);
      writeCache(keys.paris, mergedP);
      setData({ falabella: mergedF, ripley: mergedR, shopify: mergedS, paris: mergedP });

      // Solo mostramos toast en refresh (cuando ya había algo cacheado).
      const nuevos = countNew(prevF, fetchedF) + countNew(prevR, fetchedR) + countNew(prevS, fetchedS) + countNew(prevP, fetchedP);
      const hadAny = prevF.length > 0 || prevR.length > 0 || prevS.length > 0 || prevP.length > 0;
      if (hadAny && nuevos > 0) {
        setToast(`${nuevos} pedido${nuevos === 1 ? "" : "s"} nuevo${nuevos === 1 ? "" : "s"}`);
      }
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }, [username]);

  // Conteos por estado clave: pending (Falabella) y SHIPPING (Ripley).
  // Para Shopify contamos solo los pendientes de enviar (no marcados como
  // enviados localmente).
  const falabellaPending = data?.falabella.filter((o) => o.status === "pending").length ?? 0;
  const ripleyShipping = data?.ripley.filter((o) => o.orderState === "SHIPPING").length ?? 0;
  const shopifyPending = data?.shopify.filter((o) => !o.isShipped).length ?? 0;
  // Paris: contamos órdenes que tengan AL MENOS un item todavía abierto
  // (pendiente/preparando/listo para despachar — todo lo que no esté entregado,
  // enviado, cancelado o devuelto).
  const parisPending = data?.paris.filter((o) =>
    o.subOrders.some((so) => so.items.some((it) => isParisItemPending(it.status)))
  ).length ?? 0;

  // Toggle de hasLabel después de subir/borrar una etiqueta. Actualiza el
  // estado y el caché para que el cambio persista al navegar.
  const setShopifyLabelFlag = useCallback((orderId: string, hasLabel: boolean) => {
    setData((prev) => {
      if (!prev) return prev;
      const nextShopify = prev.shopify.map((o) => o.orderId === orderId ? { ...o, hasLabel } : o);
      const keys = cacheKeys(username);
      writeCache(keys.shopify, nextShopify);
      return { ...prev, shopify: nextShopify };
    });
  }, [username]);

  // Toggle del flag local "enviado". Persiste en caché igual que hasLabel.
  const setShopifyShipped = useCallback((orderId: string, next: { isShipped: boolean; shippedAt: string | null; shippedBy: string | null }) => {
    setData((prev) => {
      if (!prev) return prev;
      const nextShopify = prev.shopify.map((o) => o.orderId === orderId ? { ...o, ...next } : o);
      const keys = cacheKeys(username);
      writeCache(keys.shopify, nextShopify);
      return { ...prev, shopify: nextShopify };
    });
  }, [username]);

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
            Órdenes recientes de Falabella, Ripley, Shopify y Paris
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="self-start text-xs font-bold tracking-[0.25em] underline underline-offset-[6px] hover:no-underline disabled:opacity-40 flex items-center gap-2"
        >
          {loading && <span className="w-3 h-3 border border-current border-t-transparent spinner-ring animate-spin inline-block" />}
          Actualizar
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 border border-black text-xs font-light tracking-wider">
          {error}
        </div>
      )}

      {/* Tabs — el conteo entre paréntesis es:
            · Ripley   → SHIPPING
            · Falabella → pending
            · Shopify   → total de pedidos cargados */}
      <div className="flex gap-8 mb-6 border-b border-neutral-200 pb-4 overflow-x-auto">
        {([
          { key: "ripley" as MarketTab, label: `Ripley (${ripleyShipping})` },
          { key: "falabella" as MarketTab, label: `Falabella (${falabellaPending})` },
          { key: "shopify" as MarketTab, label: `Shopify (${shopifyPending})` },
          { key: "paris" as MarketTab, label: `Paris (${parisPending})` },
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

      {data && tab === "shopify" && (
        <div className="space-y-4">
          {data.shopify.length === 0 && (
            <div className="text-center py-20 text-neutral-400 font-light text-xs tracking-widest border border-black">
              No hay pedidos de Shopify
            </div>
          )}
          {data.shopify.map((order) => (
            <div key={order.orderId} className="border border-black overflow-hidden">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 px-4 lg:px-6 py-4 border-b border-black bg-neutral-50">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-light tracking-[0.25em] text-neutral-500">Orden</span>
                    <span className="font-mono text-sm font-bold mt-1">{order.orderName || order.orderId}</span>
                  </div>
                  <span className="text-[10px] font-light tracking-widest text-neutral-400">{formatDate(order.createdAt)}</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  <ShopifyShippedToggle
                    orderId={order.orderId}
                    isShipped={order.isShipped}
                    shippedAt={order.shippedAt}
                    shippedBy={order.shippedBy}
                    onChange={(next) => setShopifyShipped(order.orderId, next)}
                  />
                  <ShopifyLabelActions
                    orderId={order.orderId}
                    hasLabel={order.hasLabel}
                    role={role}
                    onChange={(next) => setShopifyLabelFlag(order.orderId, next)}
                  />
                </div>
              </div>

              <div className="divide-y divide-neutral-200">
                {order.items.map((item) => (
                  <div key={item.lineItemId} className="flex flex-col sm:flex-row sm:items-center gap-4 px-4 lg:px-6 py-4">
                    <div className="w-16 h-16 bg-neutral-100 flex-shrink-0 overflow-hidden flex items-center justify-center">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.title}
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
                      <p className="font-light text-xs tracking-wider truncate">{item.title || "—"}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-light tracking-[0.2em] text-neutral-500">SKU</span>
                        <span className="font-mono text-xs font-bold">{item.sku || "—"}</span>
                      </div>
                    </div>

                    <div className="flex sm:flex-col sm:text-center items-baseline gap-2">
                      <p className="text-2xl font-bold">{item.quantity}</p>
                      <p className="text-[10px] font-light tracking-widest text-neutral-400">Unidades</p>
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

      {/* Paris — pestaña solo con órdenes pendientes de despacho.
          Cada "order" de Paris agrupa una o más sub-órdenes; dentro de cada
          sub-orden mostramos solo los items que todavía no están cerrados
          (entregado, enviado, cancelado, devuelto). Si toda la orden ya está
          cerrada, no se muestra en esta pestaña. */}
      {data && tab === "paris" && (
        <div className="space-y-4">
          {(() => {
            const pendingOrders = data.paris
              .map((o) => ({
                ...o,
                subOrders: o.subOrders
                  .map((so) => ({ ...so, items: so.items.filter((it) => isParisItemPending(it.status)) }))
                  .filter((so) => so.items.length > 0),
              }))
              .filter((o) => o.subOrders.length > 0);

            if (pendingOrders.length === 0) {
              return (
                <div className="text-center py-20 text-neutral-400 font-light text-xs tracking-widest border border-black">
                  No hay pedidos de Paris pendientes de despacho
                </div>
              );
            }

            return pendingOrders.map((order) => (
              <div key={order.orderNumber} className="border border-black overflow-hidden">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 px-4 lg:px-6 py-4 border-b border-black bg-neutral-50">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-light tracking-[0.25em] text-neutral-500">Orden #</span>
                      <span className="font-mono text-sm font-bold mt-1">{order.orderId}</span>
                    </div>
                    <span className="text-[10px] font-light tracking-widest text-neutral-400">{formatDate(order.createdAt)}</span>
                    {order.customerName && (
                      <span className="text-[10px] font-light tracking-widest text-neutral-500">{order.customerName}</span>
                    )}
                  </div>
                </div>

                {order.subOrders.map((so) => (
                  <div key={so.subOrderNumber} className="border-t border-neutral-200 first:border-t-0">
                    <div className="flex flex-wrap items-center gap-3 px-4 lg:px-6 py-2 bg-neutral-50 border-b border-neutral-200">
                      <span className="text-[10px] font-light tracking-[0.25em] text-neutral-500">Sub-orden</span>
                      <span className="font-mono text-xs font-bold">{so.subOrderNumber}</span>
                      {so.status && (
                        <span className="text-[10px] font-bold tracking-[0.2em] px-2 py-0.5 border border-black uppercase">
                          {so.status}
                        </span>
                      )}
                      {so.carrier && (
                        <span className="text-[10px] font-light tracking-widest text-neutral-500">
                          {so.carrier}{so.trackingNumber ? ` · ${so.trackingNumber}` : ""}
                        </span>
                      )}
                      {so.dispatchDate && (
                        <span className="text-[10px] font-light tracking-widest text-neutral-400">
                          Despacho: {formatDate(so.dispatchDate)}
                        </span>
                      )}
                    </div>

                    <div className="divide-y divide-neutral-200">
                      {so.items.map((item) => (
                        <div key={item.itemId} className="flex flex-col sm:flex-row sm:items-center gap-4 px-4 lg:px-6 py-4">
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
                              {item.parisSku && item.parisSku !== item.sku && (
                                <span className="font-mono text-[10px] font-light text-neutral-400">paris: {item.parisSku}</span>
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
                            <span className="text-[10px] font-light tracking-[0.2em] uppercase text-neutral-600">{item.status || "—"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ));
          })()}
        </div>
      )}
    </div>
  );
}
