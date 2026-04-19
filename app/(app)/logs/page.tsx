"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
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

const typeLabels: Record<string, string> = {
  full_sync: "Sync Completo",
  webhook: "Webhook",
  manual: "Manual",
};

const statusLabels: Record<string, string> = {
  success: "Éxito",
  error: "Error",
  partial: "Parcial",
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

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [platform, status]);

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
    <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10">
      <div className="flex flex-col gap-4 mb-6 lg:mb-10 pb-6 border-b border-black">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-[0.15em]">Logs de Sincronización</h1>
          <p className="text-[11px] font-light tracking-widest text-neutral-500 mt-2">
            {total.toLocaleString()} registros de actividad
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="flex-1 sm:flex-none px-4 py-3 text-xs tracking-widest"
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
            className="flex-1 sm:flex-none px-4 py-3 text-xs tracking-widest"
          >
            <option value="">Todos los estados</option>
            <option value="success">Éxito</option>
            <option value="error">Error</option>
            <option value="partial">Parcial</option>
          </select>
          <button
            onClick={load}
            className="px-5 py-3 text-xs font-bold tracking-[0.2em] border border-black hover:bg-black hover:text-white"
          >
            Actualizar
          </button>
        </div>
      </div>

      <div className="border border-black overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-black">
                <th className="text-left text-[10px] font-bold tracking-[0.2em] px-4 py-4 w-8" />
                <th className="text-left text-[10px] font-bold tracking-[0.2em] px-4 lg:px-6 py-4">Estado</th>
                <th className="text-left text-[10px] font-bold tracking-[0.2em] px-4 lg:px-6 py-4 hidden sm:table-cell">Tipo</th>
                <th className="text-left text-[10px] font-bold tracking-[0.2em] px-4 lg:px-6 py-4">Plataforma</th>
                <th className="text-left text-[10px] font-bold tracking-[0.2em] px-4 lg:px-6 py-4">Mensaje</th>
                <th className="text-left text-[10px] font-bold tracking-[0.2em] px-4 lg:px-6 py-4 hidden md:table-cell">Duración</th>
                <th className="text-left text-[10px] font-bold tracking-[0.2em] px-4 lg:px-6 py-4 hidden lg:table-cell">Fecha</th>
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
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-neutral-400 font-light text-xs tracking-widest">
                    Sin registros para los filtros seleccionados
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <Fragment key={log.id}>
                    <tr
                      className={`border-b border-neutral-100 ${hasFailed(log) ? "cursor-pointer hover:bg-neutral-50" : ""}`}
                      onClick={() => hasFailed(log) && toggleExpand(log.id)}
                    >
                      <td className="px-3 py-4 w-8 text-center">
                        {hasFailed(log) && (
                          <span className={`text-neutral-400 text-xs inline-block transition-transform ${expanded.has(log.id) ? "rotate-90" : ""}`}>
                            ▶
                          </span>
                        )}
                      </td>
                      <td className="px-4 lg:px-6 py-4">
                        <span className="inline-block text-[10px] font-bold tracking-[0.2em] border border-black px-2 py-0.5">
                          {statusLabels[log.status] || log.status}
                        </span>
                      </td>
                      <td className="px-4 lg:px-6 py-4 hidden sm:table-cell">
                        <span className="text-xs font-light tracking-wider">{typeLabels[log.type] || log.type}</span>
                      </td>
                      <td className="px-4 lg:px-6 py-4">
                        <span className="text-xs font-bold tracking-widest">{platformLabels[log.platform] || log.platform}</span>
                      </td>
                      <td className="px-4 lg:px-6 py-4 max-w-sm">
                        <span className="text-xs font-light tracking-wider truncate block">{log.message || "—"}</span>
                      </td>
                      <td className="px-4 lg:px-6 py-4 hidden md:table-cell">
                        <span className="text-[10px] font-light tracking-widest text-neutral-400">
                          {log.duration ? `${(log.duration / 1000).toFixed(1)}s` : "—"}
                        </span>
                      </td>
                      <td className="px-4 lg:px-6 py-4 hidden lg:table-cell">
                        <span className="text-[10px] font-light tracking-widest text-neutral-400 whitespace-nowrap">
                          {formatDate(log.createdAt)}
                        </span>
                      </td>
                    </tr>

                    {hasFailed(log) && expanded.has(log.id) && (
                      <tr className="bg-neutral-100 border-b border-neutral-200">
                        <td colSpan={7} className="px-6 py-4">
                          <p className="text-[10px] font-bold tracking-[0.2em] mb-3">
                            SKUs con falla ({log.details!.failed!.length})
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {log.details!.failed!.map((sku) => (
                              <span
                                key={sku}
                                className="font-mono text-xs border border-black px-2 py-0.5"
                              >
                                {sku}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 lg:px-6 py-4 border-t border-black">
            <p className="text-[11px] font-light tracking-widest text-neutral-500">
              Página {page} de {pages}
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
