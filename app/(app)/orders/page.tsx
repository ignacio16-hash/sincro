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

function StateChip({ state }: { state: string }) {
  return (
    <span className="inline-block text-[10px] font-bold tracking-[0.2em] border border-black px-2 py-0.5">
      {state}
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
        {loading && <span className="w-2 h-2 border border-current border-t-transparent animate-spin inline-block" />}
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
    <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10">
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
          className="w-full sm:w-auto px-6 py-3 text-xs font-bold tracking-[0.2em] border border-black hover:bg-black hover:text-white disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {loading && <span className="w-3 h-3 border border-current border-t-transparent animate-spin inline-block" />}
          Actualizar
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 border border-black bg-black text-white text-xs font-light tracking-wider">
          {error}
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-0 mb-6 border border-black">
        <div className="p-5 border-r border-black">
          <p className="text-[10px] font-light tracking-[0.25em] text-neutral-500">Ripley</p>
          <p className="text-3xl lg:text-4xl font-bold mt-2">{totalRipley}</p>
        </div>
        <div className="p-5">
          <p className="text-[10px] font-light tracking-[0.25em] text-neutral-500">Falabella</p>
          <p className="text-3xl lg:text-4xl font-bold mt-2">{totalFalabella}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 mb-6 border border-black">
        {([
          { key: "ripley" as MarketTab, label: `Ripley (${totalRipley})` },
          { key: "falabella" as MarketTab, label: `Falabella (${totalFalabella})` },
        ]).map((t, i) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            data-active={tab === t.key}
            className={`flex-1 px-4 py-3 text-xs tracking-[0.2em] ${i === 0 ? "border-r border-black" : ""} ${
              tab === t.key ? "bg-black text-white font-bold" : "font-light hover:bg-neutral-100"
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
                  <StateChip state={order.orderState} />
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
                  <StateChip state={order.status} />
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
                      <StateChip state={item.status} />
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
