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

function StockBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-slate-300 text-sm">—</span>;
  const color =
    value === 0
      ? "text-red-600 bg-red-50"
      : value < 5
      ? "text-amber-700 bg-amber-50"
      : "text-emerald-700 bg-emerald-50";
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-sm font-semibold ${color}`}>
      {value}
    </span>
  );
}

export default function StockPage() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    load();
  }, [load]);

  // Reset page on search change
  useEffect(() => {
    setPage(1);
  }, [search]);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Stock</h1>
          <p className="text-slate-500 text-sm mt-1">
            {total.toLocaleString()} SKUs sincronizados desde Bsale
          </p>
        </div>
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar SKU o nombre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent w-64"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-4">SKU</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-4">Nombre</th>
                <th className="text-center text-xs font-semibold text-blue-500 uppercase tracking-wider px-4 py-4">Bsale</th>
                <th className="text-center text-xs font-semibold text-green-500 uppercase tracking-wider px-4 py-4">Paris</th>
                <th className="text-center text-xs font-semibold text-orange-500 uppercase tracking-wider px-4 py-4">Falabella</th>
                <th className="text-center text-xs font-semibold text-purple-500 uppercase tracking-wider px-4 py-4">Ripley</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-4">Último Sync</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-6 py-4">
                        <div className="h-4 bg-slate-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-slate-400">
                    {search ? `No hay SKUs que coincidan con "${search}"` : "Sin datos. Realiza un sync para empezar."}
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <span className="font-mono text-sm font-semibold text-slate-800">{item.sku}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-600 max-w-xs truncate block">{item.name || "—"}</span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <StockBadge value={item.bsaleStock} />
                    </td>
                    <td className="px-4 py-4 text-center">
                      <StockBadge value={item.parisStock} />
                    </td>
                    <td className="px-4 py-4 text-center">
                      <StockBadge value={item.falabellaStock} />
                    </td>
                    <td className="px-4 py-4 text-center">
                      <StockBadge value={item.ripleyStock} />
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs text-slate-400">
                        {item.lastSyncAt ? formatDate(item.lastSyncAt) : "—"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
            <p className="text-sm text-slate-500">
              Página {page} de {pages} — {total.toLocaleString()} SKUs
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 text-sm border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition-colors"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page === pages}
                className="px-4 py-2 text-sm border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition-colors"
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
