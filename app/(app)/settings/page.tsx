"use client";

import { useEffect, useState, useCallback } from "react";

interface PlatformConfig {
  platform: string;
  label: string;
  color: string;
  dot: string;
  description: string;
  fields: { key: string; label: string; placeholder: string; type?: string; isSelect?: boolean }[];
}

interface Office { id: number; name: string }

const platforms: PlatformConfig[] = [
  {
    platform: "bsale",
    label: "Bsale",
    color: "border-blue-200 bg-blue-50",
    dot: "bg-blue-500",
    description: "Stock principal. Obtén tu Access Token en Bsale → Configuración → API.",
    fields: [
      { key: "accessToken", label: "Access Token", placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", type: "password" },
      { key: "officeId", label: "Bodega (Office)", placeholder: "Ingresa el Access Token para cargar bodegas", isSelect: true },
    ],
  },
  {
    platform: "paris",
    label: "Paris (Cencosud)",
    color: "border-green-200 bg-green-50",
    dot: "bg-green-500",
    description: "Credenciales desde https://developers.ecomm.cencosud.com (requiere cuenta de vendedor).",
    fields: [
      { key: "apiKey", label: "Bearer Token", placeholder: "tu-bearer-token-de-cencosud", type: "password" },
      { key: "sellerId", label: "Seller ID", placeholder: "tu-seller-id" },
      { key: "baseUrl", label: "Base URL API", placeholder: "https://api.cencosud-marketplaces.com" },
    ],
  },
  {
    platform: "falabella",
    label: "Falabella",
    color: "border-orange-200 bg-orange-50",
    dot: "bg-orange-500",
    description: "Seller Center. Auth HMAC-SHA256. Credenciales en https://developers.falabella.com",
    fields: [
      { key: "apiKey", label: "API Key (HMAC secret)", placeholder: "tu-api-key-de-falabella", type: "password" },
      { key: "userId", label: "User ID (email)", placeholder: "vendedor@email.com" },
      { key: "country", label: "País", placeholder: "CL  (opciones: CL, PE, CO, MX)" },
    ],
  },
  {
    platform: "ripley",
    label: "Ripley (Mirakl)",
    color: "border-purple-200 bg-purple-50",
    dot: "bg-purple-500",
    description: "Ripley vía Mirakl MMP. Confirma la Instance URL con el equipo de Ripley.",
    fields: [
      { key: "apiKey", label: "API Key Mirakl", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", type: "password" },
      { key: "instanceUrl", label: "Instance URL", placeholder: "https://ripley.mirakl.net" },
    ],
  },
];

const webhookPaths: Record<string, string> = {
  bsale: "/api/webhooks/bsale",
  paris: "/api/webhooks/paris",
  falabella: "/api/webhooks/falabella",
  ripley: "/api/webhooks/ripley",
};

type TestStatus = { loading: boolean; ok?: boolean; message?: string };

export default function SettingsPage() {
  const [formData, setFormData] = useState<Record<string, Record<string, string>>>({});
  const [activeStatus, setActiveStatus] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<Record<string, TestStatus>>({});
  const [offices, setOffices] = useState<Office[]>([]);
  const [loadingOffices, setLoadingOffices] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((creds: { platform: string; config: Record<string, string>; isActive: boolean }[]) => {
        const fd: Record<string, Record<string, string>> = {};
        const status: Record<string, boolean> = {};
        creds.forEach((c) => { fd[c.platform] = c.config; status[c.platform] = c.isActive; });
        setFormData(fd);
        setActiveStatus(status);
      });
  }, []);

  const loadOffices = useCallback(async (token: string) => {
    if (!token || token.includes("••••")) return;
    setLoadingOffices(true);
    setOffices([]);
    try {
      const res = await fetch(`/api/bsale/offices?token=${encodeURIComponent(token)}`);
      const json = await res.json();
      if (json.offices) setOffices(json.offices);
    } catch { /* ignore */ }
    finally { setLoadingOffices(false); }
  }, []);

  // Auto-load offices when Bsale access token is available
  useEffect(() => {
    const token = formData["bsale"]?.accessToken;
    if (token && !token.includes("••••")) loadOffices(token);
  }, [formData, loadOffices]);

  function handleChange(platform: string, key: string, value: string) {
    setFormData((prev) => ({ ...prev, [platform]: { ...(prev[platform] || {}), [key]: value } }));
    if (platform === "bsale" && key === "accessToken" && value.length > 10 && !value.includes("••••")) {
      loadOffices(value);
    }
  }

  async function handleSave(platform: string) {
    setSaving(platform);
    setSaved(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, config: formData[platform] || {} }),
      });
      const json = await res.json();
      setActiveStatus((prev) => ({ ...prev, [platform]: json.isActive }));
      setSaved(platform);
      setTimeout(() => setSaved(null), 3000);
    } catch { alert("Error al guardar"); }
    finally { setSaving(null); }
  }

  async function handleTest(platform: string) {
    setTestStatus((prev) => ({ ...prev, [platform]: { loading: true } }));
    try {
      const config = formData[platform] || {};
      // Build clean config without masked values
      const cleanConfig: Record<string, string> = {};
      for (const [k, v] of Object.entries(config)) {
        if (v && !v.includes("••••")) cleanConfig[k] = v;
      }
      // If value is masked, try to use from saved creds (server will use stored value)
      const res = await fetch("/api/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, config: cleanConfig }),
      });
      const json = await res.json();
      setTestStatus((prev) => ({ ...prev, [platform]: { loading: false, ok: json.ok, message: json.message } }));
    } catch {
      setTestStatus((prev) => ({ ...prev, [platform]: { loading: false, ok: false, message: "Error de red" } }));
    }
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Configuración</h1>
        <p className="text-slate-500 text-sm mt-1">Conecta tus cuentas de cada marketplace.</p>
      </div>

      <div className="space-y-6 max-w-2xl">
        {platforms.map((p) => {
          const test = testStatus[p.platform];
          return (
            <div key={p.platform} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              {/* Header */}
              <div className={`px-6 py-4 border-b ${p.color}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${p.dot}`} />
                    <h2 className="font-semibold text-slate-900">{p.label}</h2>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${activeStatus[p.platform] ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {activeStatus[p.platform] ? "Conectado" : "Sin configurar"}
                    </span>
                  </div>
                </div>
                <p className="text-slate-500 text-sm mt-1">{p.description}</p>
              </div>

              {/* Fields */}
              <div className="px-6 py-5 space-y-4">
                {p.fields.map((field) => (
                  <div key={field.key}>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      {field.label}
                    </label>

                    {field.isSelect ? (
                      <div className="flex gap-2">
                        <select
                          value={formData[p.platform]?.[field.key] || ""}
                          onChange={(e) => handleChange(p.platform, field.key, e.target.value)}
                          disabled={loadingOffices || offices.length === 0}
                          className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-400"
                        >
                          <option value="">
                            {loadingOffices
                              ? "Cargando bodegas..."
                              : offices.length === 0
                              ? "Ingresa el Access Token primero"
                              : "Todas las bodegas (recomendado)"}
                          </option>
                          {offices.map((o) => (
                            <option key={o.id} value={String(o.id)}>
                              {o.name} (ID: {o.id})
                            </option>
                          ))}
                        </select>
                        {offices.length === 0 && !loadingOffices && formData["bsale"]?.accessToken && (
                          <button
                            onClick={() => loadOffices(formData["bsale"]?.accessToken || "")}
                            className="px-3 py-2 border border-slate-200 rounded-xl text-sm hover:bg-slate-50 transition-colors"
                            title="Recargar bodegas"
                          >
                            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ) : (
                      <input
                        type={field.type || "text"}
                        value={formData[p.platform]?.[field.key] || ""}
                        onChange={(e) => handleChange(p.platform, field.key, e.target.value)}
                        placeholder={field.placeholder}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                      />
                    )}
                  </div>
                ))}

                {/* Webhook info */}
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs font-medium text-slate-600 mb-1">URL de Webhook:</p>
                  <code className="text-xs text-indigo-600 font-mono break-all">
                    {typeof window !== "undefined" ? window.location.origin : "https://tu-app.railway.app"}{webhookPaths[p.platform]}
                  </code>
                </div>

                {/* Test result */}
                {test && !test.loading && (
                  <div className={`flex items-center gap-2 p-3 rounded-xl text-sm font-medium ${test.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                    {test.ok
                      ? <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      : <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    }
                    {test.message}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    onClick={() => handleTest(p.platform)}
                    disabled={test?.loading}
                    className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 disabled:opacity-50 transition-colors"
                  >
                    {test?.loading ? (
                      <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                    {test?.loading ? "Verificando..." : "Verificar conexión"}
                  </button>

                  <div className="flex items-center gap-3">
                    {saved === p.platform && (
                      <span className="text-emerald-600 text-sm font-medium flex items-center gap-1.5">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        Guardado
                      </span>
                    )}
                    <button
                      onClick={() => handleSave(p.platform)}
                      disabled={saving === p.platform}
                      className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                    >
                      {saving === p.platform ? "Guardando..." : "Guardar"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
