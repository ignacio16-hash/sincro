"use client";

import { useEffect, useState, useCallback } from "react";
import { formatDate } from "@/lib/utils";

interface StockItem {
  id: string;
  sku: string;
  name: string | null;
  bsaleStock: number;
  parisStock: number | null;
  falabellaStock: number | null;
  ripleyStock: number | null;
  lastSyncAt: string | null;
}

function StockCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-neutral-300 text-sm">—</span>;
  const weight = value === 0 ? "font-bold" : "font-light";
  return <span className={`text-sm ${weight}`}>{value}</span>;
}

export default function StockPage() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), search });
    const res = await fetch(`/api/stock?${params}`);
    const json = await res.json();
    setItems(json.items || []);
    setTotal(json.total || 0);
    setPages(json.pages || 1);
    setLoading(false);
  }, [page, search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search]);

  const refreshCatalog = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshMsg("Refrescando catálogo (Bsale + matching Falabella/Ripley)...");
    try {
      const res = await fetch("/api/catalog-refresh", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setRefreshMsg(`Error: ${json.error || "desconocido"}`);
      } else {
        const errs = json.errors?.length ? ` · Errores: ${json.errors.join("; ")}` : "";
        setRefreshMsg(
          `Listo: ${json.matchedTotal ?? 0} SKUs guardados (de ${json.bsaleCount} Bsale) · ${json.matched.falabella} Falabella · ${json.matched.ripley} Ripley${errs}`
        );
        await load();
      }
    } catch (e) {
      setRefreshMsg(`Error: ${(e as Error).message}`);
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, load]);

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10">
      {/* Header */}
      <div className="flex flex-col gap-4 mb-6 lg:mb-10 pb-6 border-b border-black">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-[0.15em]">Stock</h1>
          <p className="text-[11px] font-light tracking-widest text-neutral-500 mt-2">
            {total.toLocaleString()} SKUs sincronizados desde Bsale
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={refreshCatalog}
            disabled={refreshing}
            className="bg-black text-white px-6 py-3 text-xs font-bold tracking-[0.2em] hover:bg-neutral-800 disabled:opacity-40"
          >
            {refreshing ? "Refrescando..." : "Refrescar Catálogo"}
          </button>
          <input
            type="text"
            placeholder="Buscar SKU o nombre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 sm:w-72 px-4 py-3 text-xs tracking-widest"
          />
        </div>
      </div>

      {refreshMsg && (
        <div className="mb-6 px-4 py-3 border border-black text-[11px] font-light tracking-wider">
          {refreshMsg}
        </div>
      )}

      <div className="border border-black overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-black bg-white">
                <th className="text-left text-[10px] font-bold tracking-[0.2em] px-4 lg:px-6 py-4">SKU</th>
                <th className="text-left text-[10px] font-bold tracking-[0.2em] px-4 lg:px-6 py-4">Nombre</th>
                <th className="text-center text-[10px] font-bold tracking-[0.2em] px-3 py-4">Bsale</th>
                <th className="text-center text-[10px] font-bold tracking-[0.2em] px-3 py-4">Paris</th>
                <th className="text-center text-[10px] font-bold tracking-[0.2em] px-3 py-4">Falabella</th>
                <th className="text-center text-[10px] font-bold tracking-[0.2em] px-3 py-4">Ripley</th>
                <th className="text-left text-[10px] font-bold tracking-[0.2em] px-4 lg:px-6 py-4 hidden md:table-cell">Último Sync</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-neutral-100">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-4">
                        <div className="h-3 bg-neutral-100 animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-neutral-400 font-light text-xs tracking-wider">
                    {search ? `No hay SKUs que coincidan con "${search}"` : "Sin datos. Realiza un sync para empezar."}
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                    <td className="px-4 lg:px-6 py-4">
                      <span className="font-mono text-xs font-bold">{item.sku}</span>
                    </td>
                    <td className="px-4 lg:px-6 py-4">
                      <span className="text-xs font-light tracking-wider max-w-xs truncate block">
                        {item.name || "—"}
                      </span>
                    </td>
                    <td className="px-3 py-4 text-center"><StockCell value={item.bsaleStock} /></td>
                    <td className="px-3 py-4 text-center"><StockCell value={item.parisStock} /></td>
                    <td className="px-3 py-4 text-center"><StockCell value={item.falabellaStock} /></td>
                    <td className="px-3 py-4 text-center"><StockCell value={item.ripleyStock} /></td>
                    <td className="px-4 lg:px-6 py-4 hidden md:table-cell">
                      <span className="text-[10px] font-light tracking-widest text-neutral-400">
                        {item.lastSyncAt ? formatDate(item.lastSyncAt) : "—"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 lg:px-6 py-4 border-t border-black">
            <p className="text-[11px] font-light tracking-widest text-neutral-500">
              Página {page} de {pages} — {total.toLocaleString()} SKUs
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-5 py-2 text-[11px] font-bold tracking-[0.2em] border border-black disabled:opacity-30 hover:bg-black hover:text-white"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page === pages}
                className="px-5 py-2 text-[11px] font-bold tracking-[0.2em] border border-black disabled:opacity-30 hover:bg-black hover:text-white"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
