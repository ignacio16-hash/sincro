"use client";

import { useState } from "react";

interface MatchedSku { sku: string; name: string; bsaleStock: number; falabellaStock: number }
interface OnlyFalabella { sku: string; name: string; falabellaStock: number }
interface OnlyBsale { sku: string; name: string; bsaleStock: number }

interface MatchResult {
  summary: { bsaleTotal: number; falabellaTotal: number; matched: number; onlyFalabella: number; onlyBsale: number };
  matched: MatchedSku[];
  onlyFalabella: OnlyFalabella[];
  onlyBsale: OnlyBsale[];
}

type Tab = "matched" | "onlyFalabella" | "onlyBsale";

export default function SkuMatchPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("matched");

  async function runMatch() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/sku-match");
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Error desconocido"); return; }
      setResult(json);
      setTab("matched");
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Match SKUs</h1>
          <p className="text-slate-500 text-sm mt-1">Compara los SKUs de Bsale con los SKU Seller de Falabella.</p>
        </div>
        <button
          onClick={runMatch}
          disabled={loading}
          className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
          {loading ? "Comparando..." : "Comparar SKUs"}
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
      )}

      {!result && !loading && !error && (
        <div className="text-center py-20 text-slate-400">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-sm">Presiona "Comparar SKUs" para iniciar</p>
        </div>
      )}

      {result && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            {[
              { label: "SKUs Bsale", value: result.summary.bsaleTotal, color: "text-blue-600 bg-blue-50" },
              { label: "SKUs Falabella", value: result.summary.falabellaTotal, color: "text-orange-600 bg-orange-50" },
              { label: "Con match", value: result.summary.matched, color: "text-emerald-600 bg-emerald-50" },
              { label: "Solo Falabella", value: result.summary.onlyFalabella, color: "text-amber-600 bg-amber-50" },
              { label: "Solo Bsale", value: result.summary.onlyBsale, color: "text-slate-600 bg-slate-100" },
            ].map((c) => (
              <div key={c.label} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 text-center">
                <div className={`text-2xl font-bold ${c.color.split(" ")[0]}`}>{c.value}</div>
                <div className="text-xs text-slate-500 mt-1">{c.label}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="flex border-b border-slate-100">
              {([
                { key: "matched", label: `Con match (${result.summary.matched})` },
                { key: "onlyFalabella", label: `Solo Falabella (${result.summary.onlyFalabella})` },
                { key: "onlyBsale", label: `Solo Bsale (${result.summary.onlyBsale})` },
              ] as { key: Tab; label: string }[]).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-5 py-3 text-sm font-medium transition-colors ${tab === t.key ? "text-indigo-600 border-b-2 border-indigo-600" : "text-slate-500 hover:text-slate-700"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="overflow-x-auto">
              {tab === "matched" && (
                <table className="w-full text-sm">
                  <thead><tr className="bg-slate-50 text-left">
                    <th className="px-5 py-3 font-medium text-slate-600">SKU</th>
                    <th className="px-5 py-3 font-medium text-slate-600">Nombre</th>
                    <th className="px-5 py-3 font-medium text-slate-600 text-right">Stock Bsale</th>
                    <th className="px-5 py-3 font-medium text-slate-600 text-right">Stock Falabella</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {result.matched.map((r) => (
                      <tr key={r.sku} className="hover:bg-slate-50">
                        <td className="px-5 py-3 font-mono text-indigo-600">{r.sku}</td>
                        <td className="px-5 py-3 text-slate-700 max-w-xs truncate">{r.name}</td>
                        <td className="px-5 py-3 text-right font-semibold text-slate-800">{r.bsaleStock}</td>
                        <td className="px-5 py-3 text-right font-semibold text-orange-600">{r.falabellaStock}</td>
                      </tr>
                    ))}
                    {result.matched.length === 0 && (
                      <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-400">Sin matches</td></tr>
                    )}
                  </tbody>
                </table>
              )}

              {tab === "onlyFalabella" && (
                <table className="w-full text-sm">
                  <thead><tr className="bg-slate-50 text-left">
                    <th className="px-5 py-3 font-medium text-slate-600">SKU Seller Falabella</th>
                    <th className="px-5 py-3 font-medium text-slate-600">Nombre</th>
                    <th className="px-5 py-3 font-medium text-slate-600 text-right">Stock Falabella</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {result.onlyFalabella.map((r) => (
                      <tr key={r.sku} className="hover:bg-slate-50">
                        <td className="px-5 py-3 font-mono text-amber-600">{r.sku}</td>
                        <td className="px-5 py-3 text-slate-700 max-w-xs truncate">{r.name}</td>
                        <td className="px-5 py-3 text-right font-semibold text-slate-800">{r.falabellaStock}</td>
                      </tr>
                    ))}
                    {result.onlyFalabella.length === 0 && (
                      <tr><td colSpan={3} className="px-5 py-8 text-center text-slate-400">Todos los SKUs de Falabella hacen match</td></tr>
                    )}
                  </tbody>
                </table>
              )}

              {tab === "onlyBsale" && (
                <table className="w-full text-sm">
                  <thead><tr className="bg-slate-50 text-left">
                    <th className="px-5 py-3 font-medium text-slate-600">SKU Bsale</th>
                    <th className="px-5 py-3 font-medium text-slate-600">Nombre</th>
                    <th className="px-5 py-3 font-medium text-slate-600 text-right">Stock Bsale</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {result.onlyBsale.map((r) => (
                      <tr key={r.sku} className="hover:bg-slate-50">
                        <td className="px-5 py-3 font-mono text-slate-500">{r.sku}</td>
                        <td className="px-5 py-3 text-slate-700 max-w-xs truncate">{r.name}</td>
                        <td className="px-5 py-3 text-right font-semibold text-slate-800">{r.bsaleStock}</td>
                      </tr>
                    ))}
                    {result.onlyBsale.length === 0 && (
                      <tr><td colSpan={3} className="px-5 py-8 text-center text-slate-400">Todos los SKUs de Bsale hacen match</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
