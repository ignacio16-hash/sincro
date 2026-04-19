"use client";

import { useEffect, useState, useCallback } from "react";

interface PlatformConfig {
  platform: string;
  label: string;
  description: string;
  fields: { key: string; label: string; placeholder: string; type?: string; isSelect?: boolean }[];
}

interface Office { id: number; name: string }

const platforms: PlatformConfig[] = [
  {
    platform: "bsale",
    label: "Bsale",
    description: "Stock principal. Obtén tu Access Token en Bsale → Configuración → API.",
    fields: [
      { key: "accessToken", label: "Access Token", placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", type: "password" },
      { key: "officeId", label: "Bodega (Office)", placeholder: "Ingresa el Access Token para cargar bodegas", isSelect: true },
    ],
  },
  {
    platform: "paris",
    label: "Paris (Cencosud)",
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
    description: "Ripley vía Mirakl MMP — gestión comercial: productos, precios, stock, boletas, postventa.",
    fields: [
      { key: "apiKey", label: "API Key Mirakl", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", type: "password" },
      { key: "instanceUrl", label: "Instance URL", placeholder: "https://ripley.mirakl.net" },
    ],
  },
  {
    platform: "ripley_svc",
    label: "Ripley SVC (SellerCenter)",
    description: "Ripley SVC — operación logística: etiquetas, manifiestos, agendamiento de despachos. Usa tu usuario/contraseña de https://sellercenter.ripleylabs.com",
    fields: [
      { key: "username", label: "Usuario (Seller)", placeholder: "tu-usuario-svc" },
      { key: "password", label: "Contraseña", placeholder: "••••••••", type: "password" },
      { key: "baseUrl", label: "Base URL", placeholder: "https://sellercenter.ripleylabs.com" },
    ],
  },
];

const webhookPaths: Record<string, string> = {
  bsale: "/api/webhooks/bsale",
  paris: "/api/webhooks/paris",
  falabella: "/api/webhooks/falabella",
  ripley: "/api/webhooks/ripley",
  ripley_svc: "/api/webhooks/ripley",
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
      if (!res.ok) { alert(json.error || "Error al guardar"); return; }
      setActiveStatus((prev) => ({ ...prev, [platform]: json.isActive }));
      setSaved(platform);
      setTimeout(() => setSaved(null), 3000);
    } catch { alert("Error de red al guardar"); }
    finally { setSaving(null); }
  }

  async function handleTest(platform: string) {
    setTestStatus((prev) => ({ ...prev, [platform]: { loading: true } }));
    try {
      const config = formData[platform] || {};
      const cleanConfig: Record<string, string> = {};
      for (const [k, v] of Object.entries(config)) {
        if (v && !v.includes("••••")) cleanConfig[k] = v;
      }
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
    <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10">
      <div className="mb-6 lg:mb-10 pb-6 border-b border-black">
        <h1 className="text-2xl lg:text-3xl font-bold tracking-[0.15em]">Configuración</h1>
        <p className="text-[11px] font-light tracking-widest text-neutral-500 mt-2">
          Conecta tus cuentas de cada marketplace.
        </p>
      </div>

      <div className="space-y-6 max-w-3xl">
        {platforms.map((p) => {
          const test = testStatus[p.platform];
          return (
            <div key={p.platform} className="border border-black">
              {/* Header */}
              <div className="px-4 lg:px-6 py-4 border-b border-black bg-neutral-50">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-sm lg:text-base font-bold tracking-[0.15em]">{p.label}</h2>
                  <span
                    data-active={activeStatus[p.platform]}
                    className={`text-[10px] font-bold tracking-[0.2em] border border-black px-2 py-0.5 ${
                      activeStatus[p.platform] ? "bg-black text-white" : ""
                    }`}
                  >
                    {activeStatus[p.platform] ? "Conectado" : "Sin configurar"}
                  </span>
                </div>
                <p className="text-[11px] font-light tracking-wider text-neutral-500 mt-2">{p.description}</p>
              </div>

              {/* Fields */}
              <div className="px-4 lg:px-6 py-5 space-y-4">
                {p.fields.map((field) => (
                  <div key={field.key}>
                    <label className="block text-[10px] font-bold tracking-[0.2em] mb-2">
                      {field.label}
                    </label>

                    {field.isSelect ? (
                      <div className="flex gap-2">
                        <select
                          value={formData[p.platform]?.[field.key] || ""}
                          onChange={(e) => handleChange(p.platform, field.key, e.target.value)}
                          disabled={loadingOffices || offices.length === 0}
                          className="flex-1 px-4 py-3 text-xs tracking-widest disabled:bg-neutral-50 disabled:text-neutral-400"
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
                            className="px-4 py-3 border border-black text-[10px] font-bold tracking-[0.2em] hover:bg-black hover:text-white"
                            title="Recargar bodegas"
                          >
                            ↻
                          </button>
                        )}
                      </div>
                    ) : (
                      <input
                        type={field.type || "text"}
                        value={formData[p.platform]?.[field.key] || ""}
                        onChange={(e) => handleChange(p.platform, field.key, e.target.value)}
                        placeholder={field.placeholder}
                        className="w-full px-4 py-3 text-xs font-mono tracking-wider"
                      />
                    )}
                  </div>
                ))}

                {/* Webhook info */}
                <div className="border border-black p-4">
                  <p className="text-[10px] font-bold tracking-[0.2em] mb-2">URL de Webhook</p>
                  <code className="text-[11px] font-mono break-all text-neutral-700">
                    {typeof window !== "undefined" ? window.location.origin : "https://tu-app.railway.app"}{webhookPaths[p.platform]}
                  </code>
                </div>

                {/* Test result */}
                {test && !test.loading && (
                  <div
                    className={`p-3 border text-[11px] font-light tracking-wider ${
                      test.ok ? "border-black bg-neutral-50" : "border-black bg-black text-white"
                    }`}
                  >
                    {test.ok ? "✓ " : "✗ "}{test.message}
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
                  <button
                    onClick={() => handleTest(p.platform)}
                    disabled={test?.loading}
                    className="px-5 py-3 text-[11px] font-bold tracking-[0.2em] border border-black hover:bg-black hover:text-white disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {test?.loading && (
                      <span className="w-3 h-3 border border-current border-t-transparent animate-spin inline-block" />
                    )}
                    {test?.loading ? "Verificando..." : "Verificar Conexión"}
                  </button>

                  <div className="flex items-center gap-4">
                    {saved === p.platform && (
                      <span className="text-[10px] font-bold tracking-[0.2em]">✓ Guardado</span>
                    )}
                    <button
                      onClick={() => handleSave(p.platform)}
                      disabled={saving === p.platform}
                      className="bg-black text-white px-6 py-3 text-[11px] font-bold tracking-[0.2em] hover:bg-neutral-800 disabled:opacity-40"
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
