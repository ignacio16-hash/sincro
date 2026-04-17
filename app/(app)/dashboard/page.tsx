"use client";

import { useEffect, useState } from "react";
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

const platformLabels: Record<string, string> = {
  bsale: "Bsale",
  paris: "Paris",
  falabella: "Falabella",
  ripley: "Ripley",
};

const platformColors: Record<string, string> = {
  bsale: "bg-blue-500",
  paris: "bg-green-500",
  falabella: "bg-orange-500",
  ripley: "bg-purple-500",
};

const statusColors: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-800",
  error: "bg-red-100 text-red-800",
  partial: "bg-amber-100 text-amber-800",
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

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

  async function handleManualSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const json = await res.json();
      setSyncResult(
        json.status === "success"
          ? `Sync completado: ${json.synced} SKUs en ${(json.duration / 1000).toFixed(1)}s`
          : `Sync con errores: ${json.errors?.join(", ")}`
      );
      load();
    } catch {
      setSyncResult("Error al iniciar sync");
    } finally {
      setSyncing(false);
    }
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">
            Sincronización automática cada 15 minutos
          </p>
        </div>
        <button
          onClick={handleManualSync}
          disabled={syncing}
          className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-medium text-sm hover:bg-indigo-700 disabled:opacity-60 transition-colors"
        >
          <svg
            className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {syncing ? "Sincronizando..." : "Sync Manual"}
        </button>
      </div>

      {syncResult && (
        <div className={`mb-6 p-4 rounded-xl text-sm font-medium ${
          syncResult.includes("Error") || syncResult.includes("error")
            ? "bg-red-50 text-red-700 border border-red-200"
            : "bg-emerald-50 text-emerald-700 border border-emerald-200"
        }`}>
          {syncResult}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <p className="text-slate-500 text-sm font-medium">Total SKUs</p>
          <p className="text-4xl font-bold text-slate-900 mt-2">{data.totalSkus.toLocaleString()}</p>
          <p className="text-slate-400 text-xs mt-2">Productos en Bsale</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <p className="text-slate-500 text-sm font-medium">Último Sync</p>
          <p className="text-lg font-bold text-slate-900 mt-2">
            {data.lastSync ? formatDate(data.lastSync) : "Nunca"}
          </p>
          {data.lastSyncStatus && (
            <span className={`inline-block mt-2 text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[data.lastSyncStatus] || "bg-slate-100 text-slate-600"}`}>
              {data.lastSyncStatus}
            </span>
          )}
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <p className="text-slate-500 text-sm font-medium">Errores (24h)</p>
          <p className={`text-4xl font-bold mt-2 ${data.errorCount > 0 ? "text-red-600" : "text-emerald-600"}`}>
            {data.errorCount}
          </p>
          <p className="text-slate-400 text-xs mt-2">
            {data.errorCount === 0 ? "Todo funcionando bien" : "Revisar logs"}
          </p>
        </div>
      </div>

      {/* Platform Status */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 mb-8">
        <h2 className="font-semibold text-slate-900 mb-4">Estado de Plataformas</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {data.platforms.map((p) => (
            <div key={p.platform} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
              <div className={`w-3 h-3 rounded-full ${platformColors[p.platform]}`} />
              <div>
                <p className="font-medium text-sm text-slate-800">{platformLabels[p.platform]}</p>
                <p className={`text-xs font-medium ${p.isActive ? "text-emerald-600" : "text-slate-400"}`}>
                  {p.isActive ? "Conectado" : "Sin configurar"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Webhook URLs */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 mb-8">
        <h2 className="font-semibold text-slate-900 mb-1">URLs de Webhooks</h2>
        <p className="text-slate-500 text-sm mb-4">Configura estas URLs en cada marketplace para recibir notificaciones de órdenes:</p>
        <div className="space-y-2">
          {[
            { label: "Bsale (cambios de stock)", path: "/api/webhooks/bsale" },
            { label: "Paris (órdenes)", path: "/api/webhooks/paris" },
            { label: "Falabella (órdenes)", path: "/api/webhooks/falabella" },
            { label: "Ripley (órdenes)", path: "/api/webhooks/ripley" },
          ].map((wh) => (
            <div key={wh.path} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
              <span className="text-slate-600 text-sm w-48 shrink-0">{wh.label}</span>
              <code className="text-indigo-600 text-sm font-mono bg-indigo-50 px-3 py-1 rounded">
                {typeof window !== "undefined" ? window.location.origin : ""}{wh.path}
              </code>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Logs */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-900">Actividad Reciente</h2>
          <a href="/logs" className="text-indigo-600 text-sm hover:underline">Ver todos →</a>
        </div>
        {data.recentLogs.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-6">Sin actividad reciente</p>
        ) : (
          <div className="space-y-2">
            {data.recentLogs.map((log) => (
              <div key={log.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[log.status] || "bg-slate-100 text-slate-600"}`}>
                    {log.status}
                  </span>
                  <span className="text-slate-600 text-sm capitalize">{platformLabels[log.platform] || log.platform}</span>
                  <span className="text-slate-500 text-sm">{log.message}</span>
                </div>
                <span className="text-slate-400 text-xs whitespace-nowrap">{formatDate(log.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
