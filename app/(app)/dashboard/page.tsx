"use client";

import { useEffect, useRef, useState } from "react";
import { formatDate } from "@/lib/utils";

interface DashboardData {
  totalSkus: number;
  lastSync: string | null;
  lastSyncStatus: string | null;
  errorCount: number;
  recentLogs: {
    id: string;
    type: string;
    platform: string;
    status: string;
    message: string;
    createdAt: string;
    duration: number | null;
  }[];
  platforms: { platform: string; isActive: boolean }[];
}

interface ProgressLine {
  stage: string;
  message: string;
  percent: number;
  status?: string;
}

const platformLabels: Record<string, string> = {
  bsale: "Bsale",
  paris: "Paris",
  falabella: "Falabella",
  ripley: "Ripley",
};

const statusLabels: Record<string, string> = {
  success: "Éxito",
  error: "Error",
  partial: "Parcial",
};

const progressStatusIcon: Record<string, string> = {
  ok: "✓",
  partial: "!",
  error: "✗",
  skipped: "—",
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [progressLines, setProgressLines] = useState<ProgressLine[]>([]);
  const [currentPercent, setCurrentPercent] = useState(0);
  const esRef = useRef<EventSource | null>(null);

  async function load() {
    const res = await fetch("/api/dashboard");
    const json = await res.json();
    setData(json);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    return () => { esRef.current?.close(); };
  }, []);

  function handleManualSync() {
    if (syncing) return;
    setSyncing(true);
    setSyncResult(null);
    setProgressLines([]);
    setCurrentPercent(0);

    const es = new EventSource("/api/sync/stream");
    esRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "done") {
          setSyncing(false); es.close(); load(); return;
        }
        if (data.type === "error") {
          setSyncing(false);
          setSyncResult({ ok: false, message: data.message || "Error desconocido" });
          es.close(); return;
        }
        if (typeof data.percent === "number") {
          setCurrentPercent(data.percent);
          if (data.stage !== "init") {
            setProgressLines((prev) => {
              const existing = prev.findIndex((l) => l.stage === data.stage);
              if (existing >= 0) {
                const next = [...prev];
                next[existing] = data;
                return next;
              }
              return [...prev, data];
            });
          }
          if (data.percent === 100 && data.status) {
            setSyncResult({ ok: data.status !== "error", message: data.message });
          }
        }
      } catch { /* ignore */ }
    };

    es.onerror = () => {
      setSyncing(false);
      setSyncResult({ ok: false, message: "Error de conexión al stream de sync" });
      es.close();
    };
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-6 h-6 border-2 border-black border-t-transparent spinner-ring animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8 lg:mb-12 pb-6 border-b border-black">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-[0.15em]">Dashboard</h1>
          <p className="text-[11px] font-light tracking-widest text-neutral-500 mt-2">
            Sync automática cada 15 min · Ventas detectadas cada 2 min
          </p>
        </div>
        <button
          onClick={handleManualSync}
          disabled={syncing}
          className="self-start text-xs font-bold tracking-[0.25em] underline underline-offset-[6px] hover:no-underline disabled:opacity-40 flex items-center gap-3"
        >
          {syncing && (
            <span className="w-3 h-3 border border-current border-t-transparent spinner-ring animate-spin inline-block" />
          )}
          {syncing ? "Sincronizando..." : "Sync Manual"}
        </button>
      </div>

      {/* Real-time progress */}
      {syncing && (
        <div className="mb-6 border border-black p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-bold tracking-[0.2em]">Sincronizando</p>
            <span className="text-sm font-bold">{currentPercent}%</span>
          </div>
          <div className="w-full h-[2px] bg-neutral-200 mb-5">
            <div
              className="bg-black h-[2px] transition-all duration-300"
              style={{ width: `${currentPercent}%` }}
            />
          </div>
          <div className="space-y-2">
            {progressLines.map((line, i) => (
              <div key={i} className="flex items-center gap-3 text-xs tracking-wider">
                <span className="w-4 text-center font-bold">
                  {line.status ? (progressStatusIcon[line.status] || "·") : (
                    <span className="w-2 h-2 border border-black border-t-transparent spinner-ring animate-spin inline-block" />
                  )}
                </span>
                <span className={line.status ? "font-light text-neutral-600" : "font-bold"}>
                  {line.message}
                </span>
              </div>
            ))}
            {progressLines.length === 0 && (
              <p className="text-xs font-light text-neutral-400 tracking-wider">Iniciando...</p>
            )}
          </div>
        </div>
      )}

      {/* Final result */}
      {!syncing && syncResult && (
        <div className="mb-6 p-4 border border-black text-xs tracking-wider font-light">
          {syncResult.message}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-0 mb-8 border border-black">
        <div className="p-6 border-b sm:border-b-0 sm:border-r border-black">
          <p className="text-[10px] font-light tracking-[0.25em] text-neutral-500">Total SKUs</p>
          <p className="text-4xl lg:text-5xl font-bold mt-3">{data.totalSkus.toLocaleString()}</p>
          <p className="text-[10px] font-light tracking-widest text-neutral-400 mt-2">Productos Bsale</p>
        </div>
        <div className="p-6 border-b sm:border-b-0 sm:border-r border-black">
          <p className="text-[10px] font-light tracking-[0.25em] text-neutral-500">Último Sync</p>
          <p className="text-base lg:text-lg font-bold mt-3">
            {data.lastSync ? formatDate(data.lastSync) : "Nunca"}
          </p>
          {data.lastSyncStatus && (
            <p className="text-[10px] font-light tracking-widest text-neutral-400 mt-2">
              {statusLabels[data.lastSyncStatus] || data.lastSyncStatus}
            </p>
          )}
        </div>
        <div className="p-6">
          <p className="text-[10px] font-light tracking-[0.25em] text-neutral-500">Errores (24h)</p>
          <p className="text-4xl lg:text-5xl font-bold mt-3">{data.errorCount}</p>
          <p className="text-[10px] font-light tracking-widest text-neutral-400 mt-2">
            {data.errorCount === 0 ? "Todo bien" : "Revisar logs"}
          </p>
        </div>
      </div>

      {/* Platform Status */}
      <div className="border border-black p-6 mb-8">
        <h2 className="text-xs font-bold tracking-[0.2em] mb-5">Estado Plataformas</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-0 border border-black">
          {data.platforms.map((p, idx) => (
            <div
              key={p.platform}
              className={`p-4 ${idx < data.platforms.length - 1 ? "border-b lg:border-b-0 lg:border-r border-black" : ""}`}
            >
              <p className="text-xs font-bold tracking-widest">{platformLabels[p.platform]}</p>
              <p className={`text-[10px] font-light tracking-widest mt-2 ${p.isActive ? "text-black" : "text-neutral-400"}`}>
                {p.isActive ? "● Conectado" : "○ Sin configurar"}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Webhook URLs */}
      <div className="border border-black p-6 mb-8">
        <h2 className="text-xs font-bold tracking-[0.2em] mb-1">URLs de Webhooks</h2>
        <p className="text-[11px] font-light tracking-wider text-neutral-500 mb-5">
          Configura en cada marketplace. Ripley y Falabella también vía polling cada 2 min.
        </p>
        <div className="divide-y divide-neutral-200 border border-black">
          {[
            { label: "Bsale (stock)", path: "/api/webhooks/bsale" },
            { label: "Paris (órdenes)", path: "/api/webhooks/paris" },
            { label: "Falabella (órdenes)", path: "/api/webhooks/falabella" },
            { label: "Ripley (órdenes)", path: "/api/webhooks/ripley" },
          ].map((wh) => (
            <div key={wh.path} className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 p-3">
              <span className="text-[11px] font-bold tracking-widest md:w-48 shrink-0">{wh.label}</span>
              <code className="text-[11px] font-mono break-all text-neutral-700">
                {typeof window !== "undefined" ? window.location.origin : ""}{wh.path}
              </code>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Logs */}
      <div className="border border-black p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xs font-bold tracking-[0.2em]">Actividad Reciente</h2>
          <a href="/logs" className="text-[11px] font-bold tracking-widest underline underline-offset-4">
            Ver todos →
          </a>
        </div>
        {data.recentLogs.length === 0 ? (
          <p className="text-xs font-light text-neutral-400 text-center py-6 tracking-wider">
            Sin actividad reciente
          </p>
        ) : (
          <div className="divide-y divide-neutral-200 border border-black">
            {data.recentLogs.map((log) => (
              <div
                key={log.id}
                className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 p-3"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[10px] font-bold tracking-[0.2em] border border-black px-2 py-0.5">
                    {statusLabels[log.status] || log.status}
                  </span>
                  <span className="text-xs font-bold tracking-widest">{platformLabels[log.platform] || log.platform}</span>
                  <span className="text-[11px] font-light tracking-wider text-neutral-600">{log.message}</span>
                </div>
                <span className="text-[10px] font-light tracking-widest text-neutral-400 shrink-0">
                  {formatDate(log.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
