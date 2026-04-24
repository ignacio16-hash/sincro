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
    <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6 lg:mb-10 pb-6 border-b border-black">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-[0.15em]">Match SKUs</h1>
          <p className="text-[11px] font-light tracking-widest text-neutral-500 mt-2">
            Compara los SKUs de Bsale con los SKU Seller de Falabella y Ripley.
          </p>
        </div>
        <button
          onClick={runMatch}
          disabled={loading}
          className="self-start text-xs font-bold tracking-[0.25em] underline underline-offset-[6px] hover:no-underline disabled:opacity-40 flex items-center gap-2"
        >
          {loading && <span className="w-3 h-3 border border-current border-t-transparent spinner-ring animate-spin inline-block" />}
          {loading ? "Comparando..." : "Comparar SKUs"}
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 border border-black text-xs font-light tracking-wider">
          {error}
        </div>
      )}

      {!result && !loading && !error && (
        <div className="text-center py-20 text-neutral-400 font-light text-xs tracking-widest border border-black">
          Presiona &quot;Comparar SKUs&quot; para iniciar
        </div>
      )}

      {result && s && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-0 mb-6 border border-black">
            {[
              { label: "Bsale", value: s.bsaleTotal },
              { label: "Falabella", value: s.falabellaTotal },
              { label: "Ripley", value: s.ripleyTotal },
              { label: "Match Fal.", value: s.falabellaMatched },
              { label: "Match Rip.", value: s.ripleyMatched },
              { label: "Solo Bsale", value: s.onlyBsale },
            ].map((c, i) => (
              <div
                key={c.label}
                className={`p-4 text-center border-black ${i < 5 ? "border-b lg:border-b-0 lg:border-r" : ""} ${i < 3 ? "border-r" : "md:border-r md:last:border-r-0"} ${i % 2 === 1 ? "md:border-r-0 lg:border-r" : ""}`}
              >
                <div className="text-2xl lg:text-3xl font-bold">{c.value}</div>
                <div className="text-[10px] font-light tracking-[0.2em] text-neutral-500 mt-2">{c.label}</div>
              </div>
            ))}
          </div>

          {/* Market selector */}
          <div className="flex gap-8 mb-4 border-b border-neutral-200 pb-4">
            {(["falabella", "ripley"] as Market[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMarket(m); setTab("matched"); }}
                data-active={market === m}
                className={`text-xs tracking-[0.2em] pb-1 ${
                  market === m ? "font-bold border-b border-black" : "font-light text-neutral-500 hover:text-black"
                }`}
              >
                {m === "falabella" ? "Falabella" : "Ripley (Mirakl)"}
              </button>
            ))}
          </div>

          {/* Tabs + Table */}
          <div className="border border-black overflow-hidden">
            <div className="flex border-b border-black overflow-x-auto">
              {([
                { key: "matched" as Tab, label: `Con match (${market === "falabella" ? s.falabellaMatched : s.ripleyMatched})` },
                { key: "onlyMarket" as Tab, label: `Solo ${market === "falabella" ? "Falabella" : "Ripley"} (${data ? data.onlyMarket.length : 0})` },
                { key: "onlyBsale" as Tab, label: `Solo Bsale (${s.onlyBsale})` },
              ]).map((t, i) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  data-active={tab === t.key}
                  className={`px-5 py-3 text-[11px] tracking-[0.2em] whitespace-nowrap ${i < 2 ? "border-r border-neutral-200" : ""} ${
                    tab === t.key ? "font-bold bg-neutral-50" : "font-light hover:bg-neutral-50"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="overflow-x-auto">
              {tab === "matched" && data && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-black text-left">
                      <th className="px-5 py-3 text-[10px] font-bold tracking-[0.2em]">SKU</th>
                      <th className="px-5 py-3 text-[10px] font-bold tracking-[0.2em]">Nombre</th>
                      <th className="px-5 py-3 text-[10px] font-bold tracking-[0.2em] text-right">Stock Bsale</th>
                      <th className="px-5 py-3 text-[10px] font-bold tracking-[0.2em] text-right">
                        Stock {market === "falabella" ? "Falabella" : "Ripley"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.matched.map((r) => (
                      <tr key={r.sku} className="border-b border-neutral-100 hover:bg-neutral-50">
                        <td className="px-5 py-3 font-mono text-xs font-bold">{r.sku}</td>
                        <td className="px-5 py-3 text-xs font-light tracking-wider max-w-xs truncate">{r.name}</td>
                        <td className="px-5 py-3 text-right text-xs font-bold">{r.bsaleStock}</td>
                        <td className="px-5 py-3 text-right text-xs font-bold">
                          {market === "falabella" ? r.falabellaStock : r.ripleyStock}
                        </td>
                      </tr>
                    ))}
                    {data.matched.length === 0 && (
                      <tr><td colSpan={4} className="px-5 py-8 text-center text-neutral-400 font-light text-xs tracking-widest">Sin matches</td></tr>
                    )}
                  </tbody>
                </table>
              )}

              {tab === "onlyMarket" && data && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-black text-left">
                      <th className="px-5 py-3 text-[10px] font-bold tracking-[0.2em]">SKU Seller</th>
                      <th className="px-5 py-3 text-[10px] font-bold tracking-[0.2em]">Nombre</th>
                      <th className="px-5 py-3 text-[10px] font-bold tracking-[0.2em] text-right">Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.onlyMarket.map((r) => (
                      <tr key={r.sku} className="border-b border-neutral-100 hover:bg-neutral-50">
                        <td className="px-5 py-3 font-mono text-xs font-bold">{r.sku}</td>
                        <td className="px-5 py-3 text-xs font-light tracking-wider max-w-xs truncate">{r.name}</td>
                        <td className="px-5 py-3 text-right text-xs font-bold">
                          {market === "falabella" ? r.falabellaStock : r.ripleyStock}
                        </td>
                      </tr>
                    ))}
                    {data.onlyMarket.length === 0 && (
                      <tr><td colSpan={3} className="px-5 py-8 text-center text-neutral-400 font-light text-xs tracking-widest">Todos los SKUs hacen match con Bsale</td></tr>
                    )}
                  </tbody>
                </table>
              )}

              {tab === "onlyBsale" && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-black text-left">
                      <th className="px-5 py-3 text-[10px] font-bold tracking-[0.2em]">SKU Bsale</th>
                      <th className="px-5 py-3 text-[10px] font-bold tracking-[0.2em]">Nombre</th>
                      <th className="px-5 py-3 text-[10px] font-bold tracking-[0.2em] text-right">Stock Bsale</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.onlyBsale.map((r) => (
                      <tr key={r.sku} className="border-b border-neutral-100 hover:bg-neutral-50">
                        <td className="px-5 py-3 font-mono text-xs font-bold">{r.sku}</td>
                        <td className="px-5 py-3 text-xs font-light tracking-wider max-w-xs truncate">{r.name}</td>
                        <td className="px-5 py-3 text-right text-xs font-bold">{r.bsaleStock}</td>
                      </tr>
                    ))}
                    {result.onlyBsale.length === 0 && (
                      <tr><td colSpan={3} className="px-5 py-8 text-center text-neutral-400 font-light text-xs tracking-widest">Todos los SKUs de Bsale hacen match</td></tr>
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
