"use client";

import { useState } from "react";

interface MatchedSku { sku: string; name: string; bsaleStock: number; falabellaStock?: number; ripleyStock?: number }
interface MarketOnlySku { sku: string; name: string; falabellaStock?: number; ripleyStock?: number }
interface BsaleOnlySku { sku: string; name: string; bsaleStock: number }

interface MatchResult {
  summary: {
    bsaleTotal: number;
    falabellaTotal: number;
    ripleyTotal: number;
    falabellaMatched: number;
    ripleyMatched: number;
    onlyBsale: number;
  };
  falabella: { matched: MatchedSku[]; onlyMarket: MarketOnlySku[] };
  ripley: { matched: MatchedSku[]; onlyMarket: MarketOnlySku[] };
  onlyBsale: BsaleOnlySku[];
}

type Market = "falabella" | "ripley";
type Tab = "matched" | "onlyMarket" | "onlyBsale";

export default function SkuMatchPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [market, setMarket] = useState<Market>("falabella");
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
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }

  const s = result?.summary;
  const data = result ? result[market] : null;

  return (
    <div className="p-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Match SKUs</h1>
          <p className="text-slate-500 text-sm mt-1">Compara los SKUs de Bsale con los SKU Seller de Falabella y Ripley.</p>
        </div>
        <button
          onClick={runMatch}
          disabled={loading}
          className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors"
        >
          {loading
            ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          }
          {loading ? "Comparando..." : "Comparar SKUs"}
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
      )}

      {!result && !loading && !error && (
        <div className="text-center py-20 text-slate-400">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          <p className="text-sm">Presiona "Comparar SKUs" para iniciar</p>
        </div>
      )}

      {result && s && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
            {[
              { label: "Bsale", value: s.bsaleTotal, color: "text-blue-600" },
              { label: "Falabella", value: s.falabellaTotal, color: "text-orange-600" },
              { label: "Ripley", value: s.ripleyTotal, color: "text-purple-600" },
              { label: "Match Falabella", value: s.falabellaMatched, color: "text-emerald-600" },
              { label: "Match Ripley", value: s.ripleyMatched, color: "text-emerald-600" },
              { label: "Solo Bsale", value: s.onlyBsale, color: "text-slate-500" },
            ].map((c) => (
              <div key={c.label} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 text-center">
                <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
                <div className="text-xs text-slate-500 mt-1">{c.label}</div>
              </div>
            ))}
          </div>

          {/* Market selector */}
          <div className="flex gap-2 mb-4">
            {(["falabella", "ripley"] as Market[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMarket(m); setTab("matched"); }}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors capitalize ${market === m ? "bg-indigo-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
              >
                {m === "falabella" ? "Falabella" : "Ripley (Mirakl)"}
              </button>
            ))}
          </div>

          {/* Tabs + Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="flex border-b border-slate-100">
              {([
                { key: "matched" as Tab, label: `Con match (${market === "falabella" ? s.falabellaMatched : s.ripleyMatched})` },
                { key: "onlyMarket" as Tab, label: `Solo ${market === "falabella" ? "Falabella" : "Ripley"} (${data ? data.onlyMarket.length : 0})` },
                { key: "onlyBsale" as Tab, label: `Solo Bsale (${s.onlyBsale})` },
              ]).map((t) => (
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
              {tab === "matched" && data && (
                <table className="w-full text-sm">
                  <thead><tr className="bg-slate-50 text-left">
                    <th className="px-5 py-3 font-medium text-slate-600">SKU</th>
                    <th className="px-5 py-3 font-medium text-slate-600">Nombre</th>
                    <th className="px-5 py-3 font-medium text-slate-600 text-right">Stock Bsale</th>
                    <th className="px-5 py-3 font-medium text-slate-600 text-right">Stock {market === "falabella" ? "Falabella" : "Ripley"}</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {data.matched.map((r) => (
                      <tr key={r.sku} className="hover:bg-slate-50">
                        <td className="px-5 py-3 font-mono text-indigo-600">{r.sku}</td>
                        <td className="px-5 py-3 text-slate-700 max-w-xs truncate">{r.name}</td>
                        <td className="px-5 py-3 text-right font-semibold text-slate-800">{r.bsaleStock}</td>
                        <td className="px-5 py-3 text-right font-semibold text-orange-600">
                          {market === "falabella" ? r.falabellaStock : r.ripleyStock}
                        </td>
                      </tr>
                    ))}
                    {data.matched.length === 0 && (
                      <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-400">Sin matches</td></tr>
                    )}
                  </tbody>
                </table>
              )}

              {tab === "onlyMarket" && data && (
                <table className="w-full text-sm">
                  <thead><tr className="bg-slate-50 text-left">
                    <th className="px-5 py-3 font-medium text-slate-600">SKU Seller</th>
                    <th className="px-5 py-3 font-medium text-slate-600">Nombre</th>
                    <th className="px-5 py-3 font-medium text-slate-600 text-right">Stock</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {data.onlyMarket.map((r) => (
                      <tr key={r.sku} className="hover:bg-slate-50">
                        <td className="px-5 py-3 font-mono text-amber-600">{r.sku}</td>
                        <td className="px-5 py-3 text-slate-700 max-w-xs truncate">{r.name}</td>
                        <td className="px-5 py-3 text-right font-semibold text-slate-800">
                          {market === "falabella" ? r.falabellaStock : r.ripleyStock}
                        </td>
                      </tr>
                    ))}
                    {data.onlyMarket.length === 0 && (
                      <tr><td colSpan={3} className="px-5 py-8 text-center text-slate-400">Todos los SKUs hacen match con Bsale</td></tr>
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
