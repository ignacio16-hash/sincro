"use client";

import { useEffect, useState } from "react";

interface PlatformConfig {
  platform: string;
  label: string;
  color: string;
  description: string;
  fields: { key: string; label: string; placeholder: string; type?: string }[];
}

const platforms: PlatformConfig[] = [
  {
    platform: "bsale",
    label: "Bsale",
    color: "blue",
    description: "Stock principal. Auth: header access_token. Obtén tu token en Bsale → Configuración → API.",
    fields: [
      { key: "accessToken", label: "Access Token", placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", type: "password" },
      { key: "officeId", label: "Office ID (opcional)", placeholder: "Ej: 1 — vacío para todas las bodegas" },
    ],
  },
  {
    platform: "paris",
    label: "Paris (Cencosud)",
    color: "green",
    description: "Credenciales obtenidas desde el portal https://developers.ecomm.cencosud.com (requiere cuenta de vendedor).",
    fields: [
      { key: "apiKey", label: "API Key / Bearer Token", placeholder: "tu-bearer-token-de-cencosud", type: "password" },
      { key: "sellerId", label: "Seller ID", placeholder: "tu-seller-id" },
      { key: "baseUrl", label: "Base URL API", placeholder: "https://api.cencosud-marketplaces.com" },
    ],
  },
  {
    platform: "falabella",
    label: "Falabella",
    color: "orange",
    description: "Falabella Seller Center. Auth: HMAC-SHA256. Credenciales en https://developers.falabella.com",
    fields: [
      { key: "apiKey", label: "API Key (HMAC secret)", placeholder: "tu-api-key-de-falabella", type: "password" },
      { key: "userId", label: "User ID (email de vendedor)", placeholder: "vendedor@email.com" },
      { key: "country", label: "País", placeholder: "CL — opciones: CL, PE, CO, MX" },
    ],
  },
  {
    platform: "ripley",
    label: "Ripley (Mirakl)",
    color: "purple",
    description: "Ripley vía Mirakl MMP. Auth: Authorization: <api-key> (sin Bearer). Confirma la URL de instancia con Ripley.",
    fields: [
      { key: "apiKey", label: "API Key Mirakl", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", type: "password" },
      { key: "instanceUrl", label: "Instance URL", placeholder: "https://ripley.mirakl.net" },
    ],
  },
];

const colorMap: Record<string, string> = {
  blue: "border-blue-200 bg-blue-50",
  green: "border-green-200 bg-green-50",
  orange: "border-orange-200 bg-orange-50",
  purple: "border-purple-200 bg-purple-50",
};

const dotMap: Record<string, string> = {
  blue: "bg-blue-500",
  green: "bg-green-500",
  orange: "bg-orange-500",
  purple: "bg-purple-500",
};

export default function SettingsPage() {
  const [formData, setFormData] = useState<Record<string, Record<string, string>>>({});
  const [activeStatus, setActiveStatus] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((creds: { platform: string; config: Record<string, string>; isActive: boolean }[]) => {
        const fd: Record<string, Record<string, string>> = {};
        const status: Record<string, boolean> = {};
        creds.forEach((c) => {
          fd[c.platform] = c.config;
          status[c.platform] = c.isActive;
        });
        setFormData(fd);
        setActiveStatus(status);
      });
  }, []);

  function handleChange(platform: string, key: string, value: string) {
    setFormData((prev) => ({
      ...prev,
      [platform]: { ...(prev[platform] || {}), [key]: value },
    }));
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
    } catch {
      alert("Error al guardar");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Configuración</h1>
        <p className="text-slate-500 text-sm mt-1">
          Conecta tus cuentas de cada marketplace. Las claves se guardan cifradas.
        </p>
      </div>

      <div className="space-y-6 max-w-2xl">
        {platforms.map((p) => (
          <div
            key={p.platform}
            className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden"
          >
            {/* Platform header */}
            <div className={`px-6 py-4 border-b ${colorMap[p.color]} border-opacity-50`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${dotMap[p.color]}`} />
                  <h2 className="font-semibold text-slate-900">{p.label}</h2>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      activeStatus[p.platform]
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
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
                  <input
                    type={field.type || "text"}
                    value={formData[p.platform]?.[field.key] || ""}
                    onChange={(e) => handleChange(p.platform, field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono"
                  />
                </div>
              ))}

              {/* Webhook URL info */}
              {p.platform !== "bsale" && (
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs font-medium text-slate-600 mb-1">URL de Webhook a configurar en {p.label}:</p>
                  <code className="text-xs text-indigo-600 font-mono">
                    {typeof window !== "undefined" ? window.location.origin : "https://tu-dominio.railway.app"}/api/webhooks/{p.platform}
                  </code>
                  <p className="text-xs text-slate-400 mt-1">
                    Configura esta URL en el panel de {p.label} para recibir notificaciones de órdenes en tiempo real.
                  </p>
                </div>
              )}
              {p.platform === "bsale" && (
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs font-medium text-slate-600 mb-1">URL de Webhook Bsale:</p>
                  <code className="text-xs text-indigo-600 font-mono">
                    {typeof window !== "undefined" ? window.location.origin : "https://tu-dominio.railway.app"}/api/webhooks/bsale
                  </code>
                  <p className="text-xs text-slate-400 mt-1">
                    Configura en Bsale → Configuración → Webhooks para recibir cambios de stock en tiempo real.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                {saved === p.platform && (
                  <span className="text-emerald-600 text-sm font-medium flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Guardado correctamente
                  </span>
                )}
                {saved !== p.platform && <span />}
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
        ))}
      </div>
    </div>
  );
}
