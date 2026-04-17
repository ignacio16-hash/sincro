"use client";

import { useEffect, useState, useCallback } from "react";
import { formatDate } from "@/lib/utils";

interface Log {
  id: string;
  type: string;
  platform: string;
  status: string;
  message: string | null;
  details: { failed?: string[]; errors?: string[]; synced?: number } | null;
  duration: number | null;
  createdAt: string;
}

const statusColors: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-800",
  error: "bg-red-100 text-red-800",
  partial: "bg-amber-100 text-amber-800",
};

const typeLabels: Record<string, string> = {
  full_sync: "Sync Completo",
  webhook: "Webhook",
  manual: "Manual",
};

const platformLabels: Record<string, string> = {
  bsale: "Bsale",
  paris: "Paris",
  falabella: "Falabella",
  ripley: "Ripley",
  all: "Todos",
};

export default function LogsPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [platform, setPlatform] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (platform) params.set("platform", platform);
    if (status) params.set("status", status);
    const res = await fetch(`/api/logs?${params}`);
    const json = await res.json();
    setLogs(json.logs || []);
    setTotal(json.total || 0);
    setPages(json.pages || 1);
    setLoading(false);
  }, [page, platform, status]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [platform, status]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function hasFailed(log: Log): boolean {
    const failed = log.details?.failed;
    return Array.isArray(failed) && failed.length > 0;
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Logs de Sincronización</h1>
          <p className="text-slate-500 text-sm mt-1">
            {total.toLocaleString()} registros de actividad
          </p>
        </div>
        <div className="flex gap-3">
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Todas las plataformas</option>
            <option value="bsale">Bsale</option>
            <option value="paris">Paris</option>
            <option value="falabella">Falabella</option>
            <option value="ripley">Ripley</option>
            <option value="all">Todos</option>
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Todos los estados</option>
            <option value="success">Éxito</option>
            <option value="error">Error</option>
            <option value="partial">Parcial</option>
          </select>
          <button
            onClick={load}
            className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm hover:bg-slate-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-4 w-8" />
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-4">Estado</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-4">Tipo</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-4">Plataforma</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-4">Mensaje</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-4">Duración</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-4">Fecha</th>
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
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-slate-400">
                    Sin registros para los filtros seleccionados
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <>
                    <tr
                      key={log.id}
                      className={`transition-colors ${hasFailed(log) ? "cursor-pointer hover:bg-slate-50" : ""}`}
                      onClick={() => hasFailed(log) && toggleExpand(log.id)}
                    >
                      {/* Expand chevron */}
                      <td className="px-3 py-4 w-8 text-center">
                        {hasFailed(log) && (
                          <span className={`text-slate-400 text-xs transition-transform inline-block ${expanded.has(log.id) ? "rotate-90" : ""}`}>
                            ▶
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full ${statusColors[log.status] || "bg-slate-100 text-slate-600"}`}>
                          {log.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-700">{typeLabels[log.type] || log.type}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-slate-800">{platformLabels[log.platform] || log.platform}</span>
                      </td>
                      <td className="px-6 py-4 max-w-sm">
                        <span className="text-sm text-slate-600 truncate block">{log.message || "—"}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs text-slate-400">
                          {log.duration ? `${(log.duration / 1000).toFixed(1)}s` : "—"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs text-slate-400 whitespace-nowrap">{formatDate(log.createdAt)}</span>
                      </td>
                    </tr>

                    {/* Expandable failed SKUs row */}
                    {hasFailed(log) && expanded.has(log.id) && (
                      <tr key={`${log.id}-detail`} className="bg-red-50">
                        <td colSpan={7} className="px-8 py-3">
                          <p className="text-xs font-semibold text-red-700 mb-2">
                            SKUs con falla ({log.details!.failed!.length}):
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {log.details!.failed!.map((sku) => (
                              <span
                                key={sku}
                                className="font-mono text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded border border-red-200"
                              >
                                {sku}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
            <p className="text-sm text-slate-500">
              Página {page} de {pages}
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
