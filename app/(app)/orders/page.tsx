"use client";

import { useCallback, useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FalabellaItem {
  orderItemId: string;
  sku: string;
  name: string;
  quantity: number;
  price: number;
  status: string;
}

interface FalabellaOrder {
  orderId: string;
  orderNumber: string;
  status: string;
  createdAt: string;
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const stateColors: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  ready_to_ship: "bg-blue-100 text-blue-800",
  shipped: "bg-emerald-100 text-emerald-800",
  delivered: "bg-emerald-100 text-emerald-800",
  canceled: "bg-red-100 text-red-800",
  WAITING_ACCEPTANCE: "bg-amber-100 text-amber-800",
  SHIPPING: "bg-blue-100 text-blue-800",
  SHIPPED: "bg-emerald-100 text-emerald-800",
  RECEIVED: "bg-emerald-100 text-emerald-800",
  CLOSED: "bg-slate-100 text-slate-600",
  REFUSED: "bg-red-100 text-red-800",
  CANCELED: "bg-red-100 text-red-800",
};

function formatDate(s: string) {
  if (!s) return "—";
  try { return new Date(s).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" }); }
  catch { return s; }
}

function StateChip({ state }: { state: string }) {
  return (
    <span className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full ${stateColors[state] || "bg-slate-100 text-slate-600"}`}>
      {state}
    </span>
  );
}

// ─── Label download ───────────────────────────────────────────────────────────

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
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg transition-colors disabled:opacity-60 font-medium"
      >
        {loading ? (
          <span className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          </svg>
        )}
        Etiqueta PDF
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type MarketTab = "ripley" | "falabella";

export default function OrdersPage() {
  const [data, setData] = useState<OrdersData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<MarketTab>("ripley");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/orders");
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Error al cargar pedidos"); return; }
      setData(json);
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalRipley = data?.ripley.length ?? 0;
  const totalFalabella = data?.falabella.length ?? 0;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pedidos</h1>
          <p className="text-slate-500 text-sm mt-1">
            Órdenes recientes de Falabella y Ripley (Mirakl)
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-sm hover:bg-slate-50 transition-colors disabled:opacity-60"
        >
          <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Actualizar
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <p className="text-slate-500 text-sm">Pedidos Ripley</p>
          <p className="text-3xl font-bold text-purple-600 mt-1">{totalRipley}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <p className="text-slate-500 text-sm">Pedidos Falabella</p>
          <p className="text-3xl font-bold text-orange-600 mt-1">{totalFalabella}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {([
          { key: "ripley" as MarketTab, label: `Ripley (Mirakl) (${totalRipley})`, color: "text-purple-700" },
          { key: "falabella" as MarketTab, label: `Falabella (${totalFalabella})`, color: "text-orange-700" },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              tab === t.key
                ? "bg-indigo-600 text-white"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Order list */}
      {loading && !data && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 p-6">
              <div className="h-4 bg-slate-100 rounded animate-pulse mb-3 w-1/4" />
              <div className="h-3 bg-slate-100 rounded animate-pulse w-1/2" />
            </div>
          ))}
        </div>
      )}

      {data && tab === "ripley" && (
        <div className="space-y-4">
          {data.ripley.length === 0 && (
            <div className="text-center py-20 text-slate-400 bg-white rounded-2xl border border-slate-100">
              <p className="text-sm">No hay pedidos de Ripley</p>
            </div>
          )}
          {data.ripley.map((order) => (
            <div key={order.orderId} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              {/* Order header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50 bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-400 font-medium">Orden #</span>
                    <span className="font-mono text-base font-bold text-purple-700">{order.orderId}</span>
                  </div>
                  <StateChip state={order.orderState} />
                  <span className="text-xs text-slate-400">{formatDate(order.createdDate)}</span>
                </div>
                <DownloadLabelButton platform="ripley" orderId={order.orderId} />
              </div>

              {/* Order lines */}
              <div className="divide-y divide-slate-50">
                {order.orderLines.map((line) => (
                  <div key={line.orderLineId} className="flex items-center gap-4 px-6 py-4">
                    {/* Product image */}
                    <div className="w-16 h-16 rounded-lg bg-slate-100 flex-shrink-0 overflow-hidden">
                      {line.imageUrl ? (
                        <img
                          src={line.imageUrl}
                          alt={line.productTitle}
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg className="w-6 h-6 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 text-sm truncate">{line.productTitle || "—"}</p>
                      <p className="font-mono text-xs text-indigo-600 mt-0.5">{line.offerSku}</p>
                    </div>

                    <div className="text-center">
                      <p className="text-2xl font-bold text-slate-900">{line.quantity}</p>
                      <p className="text-xs text-slate-400">unidades</p>
                    </div>

                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-800">
                        {order.currencyCode} {line.price.toLocaleString("es-CL")}
                      </p>
                      <StateChip state={line.orderLineState} />
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
            <div className="text-center py-20 text-slate-400 bg-white rounded-2xl border border-slate-100">
              <p className="text-sm">No hay pedidos de Falabella</p>
            </div>
          )}
          {data.falabella.map((order) => (
            <div key={order.orderId} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              {/* Order header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50 bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-400 font-medium">Orden #</span>
                    <span className="font-mono text-base font-bold text-orange-700">{order.orderNumber}</span>
                    {order.orderNumber !== order.orderId && (
                      <span className="font-mono text-[10px] text-slate-400 mt-0.5">id: {order.orderId}</span>
                    )}
                  </div>
                  <StateChip state={order.status} />
                  <span className="text-xs text-slate-400">{formatDate(order.createdAt)}</span>
                </div>
                <DownloadLabelButton
                  platform="falabella"
                  orderItemIds={order.items.map((i) => i.orderItemId).join(",")}
                />
              </div>

              {/* Items */}
              <div className="divide-y divide-slate-50">
                {order.items.map((item) => (
                  <div key={item.orderItemId} className="flex items-center gap-4 px-6 py-4">
                    {/* Placeholder image (Falabella GetOrderItems doesn't return images in v500) */}
                    <div className="w-16 h-16 rounded-lg bg-slate-100 flex-shrink-0 flex items-center justify-center">
                      <svg className="w-6 h-6 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 text-sm truncate">{item.name || "—"}</p>
                      <div className="mt-1 inline-flex items-center gap-1.5">
                        <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">SKU Seller</span>
                        <span className="font-mono text-sm font-semibold text-orange-700 bg-orange-50 px-2 py-0.5 rounded">{item.sku || "—"}</span>
                      </div>
                    </div>

                    <div className="text-center">
                      <p className="text-2xl font-bold text-slate-900">{item.quantity}</p>
                      <p className="text-xs text-slate-400">unidades</p>
                    </div>

                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-800">
                        CLP {item.price.toLocaleString("es-CL")}
                      </p>
                      <StateChip state={item.status} />
                    </div>
                  </div>
                ))}
                {order.items.length === 0 && (
                  <p className="px-6 py-4 text-sm text-slate-400">Sin items</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
