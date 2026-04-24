"use client";

import { useEffect, useState, useCallback } from "react";

interface PlatformConfig {
  platform: string;
  label: string;
  description: string;
  fields: { key: string; label: string; placeholder: string; type?: string; isSelect?: boolean }[];
}

interface Office { id: number; name: string }
interface AppUser { id: string; username: string; role: "admin" | "vendedor"; createdAt: string }
interface Me { username: string; role: "admin" | "vendedor" }

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
    description: "Ripley SVC — operación logística: etiquetas, manifiestos, agendamiento de despachos.",
    fields: [
      { key: "username", label: "Usuario (Seller)", placeholder: "tu-usuario-svc" },
      { key: "password", label: "Contraseña", placeholder: "••••••••", type: "password" },
      { key: "baseUrl", label: "Base URL", placeholder: "https://sellercenter.ripleylabs.com" },
    ],
  },
  {
    platform: "shopify",
    label: "Shopify",
    description: "Solo lectura de pedidos. Usa OAuth — ingresa el Shop Domain y presiona 'Conectar con Shopify'. Scopes: read_orders, read_products.",
    fields: [
      { key: "shopDomain", label: "Shop Domain", placeholder: "mi-tienda.myshopify.com" },
      { key: "apiVersion", label: "API Version (opcional)", placeholder: "2024-10" },
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
  const [me, setMe] = useState<Me | null>(null);
  const [formData, setFormData] = useState<Record<string, Record<string, string>>>({});
  const [activeStatus, setActiveStatus] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<Record<string, TestStatus>>({});
  const [offices, setOffices] = useState<Office[]>([]);
  const [loadingOffices, setLoadingOffices] = useState(false);

  // Shopify OAuth connection banner (from ?shopify=connected|error)
  const [shopifyBanner, setShopifyBanner] = useState<{ ok: boolean; message: string } | null>(null);

  // Admin-only state
  const [users, setUsers] = useState<AppUser[]>([]);
  const [newUser, setNewUser] = useState({ username: "", pin: "", role: "vendedor" as "admin" | "vendedor" });
  const [userError, setUserError] = useState<string | null>(null);
  const [loginSettings, setLoginSettings] = useState<{ logoText: string; logoSvg: string | null; imageUrl: string }>({ logoText: "PARROT", logoSvg: null, imageUrl: "" });
  const [loginSaved, setLoginSaved] = useState(false);
  const [logoSvgError, setLogoSvgError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d: { user: Me | null }) => setMe(d.user));
    fetch("/api/settings").then((r) => r.json()).then((creds: { platform: string; config: Record<string, string>; isActive: boolean }[]) => {
      const fd: Record<string, Record<string, string>> = {};
      const status: Record<string, boolean> = {};
      creds.forEach((c) => { fd[c.platform] = c.config; status[c.platform] = c.isActive; });
      setFormData(fd);
      setActiveStatus(status);
    });
    fetch("/api/login-settings").then((r) => r.json()).then(setLoginSettings);

    // Handle Shopify OAuth return params: ?shopify=connected|error&reason=...&shop=...
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const s = params.get("shopify");
      if (s === "connected") {
        const shop = params.get("shop") || "";
        setShopifyBanner({ ok: true, message: `Shopify conectado${shop ? ` — ${shop}` : ""}` });
      } else if (s === "error") {
        const reasonMap: Record<string, string> = {
          env_missing: "Faltan SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET",
          bad_request: "Respuesta inválida de Shopify",
          bad_shop: "Shop Domain inválido",
          hmac_invalid: "Firma HMAC inválida — revisa SHOPIFY_CLIENT_SECRET",
          state_mismatch: "Sesión de OAuth expirada — vuelve a iniciar",
          shop_mismatch: "Tienda cambió durante el flujo",
          no_token: "Shopify no devolvió access_token",
          exchange_failed: "Fallo al intercambiar el code por token",
          persist_failed: "No se pudo guardar la credencial",
        };
        const reason = params.get("reason") || "";
        setShopifyBanner({ ok: false, message: reasonMap[reason] || `Error: ${reason || "desconocido"}` });
      }
      if (s) {
        // Limpiar la URL para que el banner no persista en refresh.
        const clean = new URL(window.location.href);
        clean.searchParams.delete("shopify");
        clean.searchParams.delete("reason");
        clean.searchParams.delete("shop");
        window.history.replaceState({}, "", clean.toString());
      }
    }
  }, []);

  const isAdmin = me?.role === "admin";

  // Load users when admin
  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/users").then((r) => r.json()).then((d: { users: AppUser[] }) => setUsers(d.users || []));
  }, [isAdmin]);

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

  function connectShopify() {
    const shop = (formData["shopify"]?.shopDomain || "").trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
      alert("Shop Domain inválido. Debe ser <tienda>.myshopify.com");
      return;
    }
    window.location.href = `/api/shopify/oauth/install?shop=${encodeURIComponent(shop)}`;
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

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setUserError(null);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newUser),
    });
    const json = await res.json();
    if (!res.ok) { setUserError(json.error || "Error al crear usuario"); return; }
    setUsers((prev) => [...prev, json.user]);
    setNewUser({ username: "", pin: "", role: "vendedor" });
  }

  async function deleteUser(id: string) {
    if (!confirm("¿Eliminar usuario?")) return;
    const res = await fetch(`/api/users?id=${id}`, { method: "DELETE" });
    if (!res.ok) { alert("Error al eliminar"); return; }
    setUsers((prev) => prev.filter((u) => u.id !== id));
  }

  async function saveLoginSettings(e: React.FormEvent) {
    e.preventDefault();
    setLogoSvgError(null);
    const res = await fetch("/api/login-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(loginSettings),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setLogoSvgError(json.error || "Error al guardar");
      return;
    }
    setLoginSettings({ logoText: json.logoText, logoSvg: json.logoSvg ?? null, imageUrl: json.imageUrl });
    setLoginSaved(true);
    setTimeout(() => setLoginSaved(false), 3000);
  }

  async function handleSvgFile(file: File) {
    setLogoSvgError(null);
    if (file.size > 64 * 1024) {
      setLogoSvgError("El SVG debe pesar menos de 64 KB");
      return;
    }
    if (!file.type.includes("svg") && !file.name.toLowerCase().endsWith(".svg")) {
      setLogoSvgError("El archivo debe ser .svg");
      return;
    }
    const text = await file.text();
    if (!/<svg[\s>]/i.test(text)) {
      setLogoSvgError("El archivo no contiene un <svg> válido");
      return;
    }
    setLoginSettings((prev) => ({ ...prev, logoSvg: text }));
  }

  function clearLogoSvg() {
    setLoginSettings((prev) => ({ ...prev, logoSvg: null }));
    setLogoSvgError(null);
  }

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10">
      <div className="mb-6 lg:mb-10 pb-6 border-b border-black">
        <h1 className="text-2xl lg:text-3xl font-bold tracking-[0.15em]">Configuración</h1>
        <p className="text-[11px] font-light tracking-widest text-neutral-500 mt-2">
          Conecta tus cuentas de cada marketplace.
        </p>
      </div>

      {/* ─── Admin-only: User management ──────────────────────────── */}
      {isAdmin && (
        <section className="mb-12 max-w-3xl">
          <h2 className="text-sm font-bold tracking-[0.2em] mb-6 border-b border-black pb-3">
            |01| Usuarios
          </h2>

          <div className="border border-black overflow-hidden mb-6">
            <table className="w-full">
              <thead>
                <tr className="border-b border-black">
                  <th className="text-left text-[10px] font-bold tracking-[0.2em] px-4 py-3">Usuario</th>
                  <th className="text-left text-[10px] font-bold tracking-[0.2em] px-4 py-3">Rol</th>
                  <th className="text-right text-[10px] font-bold tracking-[0.2em] px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-xs font-light text-neutral-400 tracking-wider">Sin usuarios</td></tr>
                )}
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-neutral-100">
                    <td className="px-4 py-3 text-xs font-bold tracking-wider">{u.username}</td>
                    <td className="px-4 py-3 text-[11px] font-light tracking-[0.2em]">
                      {u.role === "admin" ? "Admin" : "Vendedor"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {u.username !== me?.username && (
                        <button
                          onClick={() => deleteUser(u.id)}
                          className="text-[10px] font-bold tracking-[0.2em] underline underline-offset-4 hover:no-underline"
                        >
                          Eliminar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form onSubmit={createUser} className="border border-black p-5 space-y-4">
            <p className="text-[10px] font-bold tracking-[0.2em] mb-2">Añadir Usuario</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-light tracking-[0.25em] text-neutral-500 mb-2">USUARIO</label>
                <input
                  type="text"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value.toLowerCase() })}
                  placeholder="vendedor1"
                  className="w-full bg-transparent border-0 border-b border-black py-2 text-xs tracking-widest focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-light tracking-[0.25em] text-neutral-500 mb-2">PIN · 4 DÍGITOS</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={newUser.pin}
                  onChange={(e) => setNewUser({ ...newUser, pin: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                  placeholder="0000"
                  className="w-full bg-transparent border-0 border-b border-black py-2 text-xs tracking-widest focus:outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-light tracking-[0.25em] text-neutral-500 mb-2">ROL</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value as "admin" | "vendedor" })}
                  className="w-full bg-transparent border-0 border-b border-black py-2 text-xs tracking-widest focus:outline-none"
                >
                  <option value="vendedor">Vendedor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            {userError && <p className="text-[11px] font-light tracking-wider">{userError}</p>}
            <button
              type="submit"
              className="text-[11px] font-bold tracking-[0.25em] underline underline-offset-[6px] hover:no-underline"
            >
              Crear Usuario
            </button>
          </form>
        </section>
      )}

      {/* ─── Admin-only: login customization ──────────────────────── */}
      {isAdmin && (
        <section className="mb-12 max-w-3xl">
          <h2 className="text-sm font-bold tracking-[0.2em] mb-6 border-b border-black pb-3">
            |02| Personalizar Inicio de Sesión
          </h2>
          <form onSubmit={saveLoginSettings} className="border border-black p-5 space-y-5">
            <div>
              <label className="block text-[10px] font-light tracking-[0.25em] text-neutral-500 mb-2">LOGO (TEXTO)</label>
              <input
                type="text"
                value={loginSettings.logoText}
                onChange={(e) => setLoginSettings({ ...loginSettings, logoText: e.target.value })}
                placeholder="PARROT"
                maxLength={40}
                className="w-full bg-transparent border-0 border-b border-black py-2 text-xs tracking-widest focus:outline-none"
              />
              <p className="text-[10px] font-light tracking-widest text-neutral-400 mt-2">
                Se muestra solo si no hay un logo SVG cargado.
              </p>
            </div>

            <div>
              <label className="block text-[10px] font-light tracking-[0.25em] text-neutral-500 mb-2">
                LOGO SVG (OPCIONAL · REEMPLAZA AL TEXTO)
              </label>
              <div className="flex flex-wrap items-center gap-4">
                <label className="text-[11px] font-bold tracking-[0.25em] underline underline-offset-[6px] hover:no-underline cursor-pointer">
                  Subir archivo .svg
                  <input
                    type="file"
                    accept=".svg,image/svg+xml"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleSvgFile(f);
                      e.target.value = "";
                    }}
                  />
                </label>
                {loginSettings.logoSvg && (
                  <button
                    type="button"
                    onClick={clearLogoSvg}
                    className="text-[11px] font-bold tracking-[0.25em] underline underline-offset-[6px] hover:no-underline text-neutral-500"
                  >
                    Quitar
                  </button>
                )}
              </div>
              <textarea
                value={loginSettings.logoSvg || ""}
                onChange={(e) => setLoginSettings({ ...loginSettings, logoSvg: e.target.value || null })}
                placeholder="<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 24'>…</svg>"
                rows={5}
                className="w-full mt-3 border border-neutral-300 p-2 text-[11px] font-mono tracking-tight focus:outline-none focus:border-black"
              />
              {logoSvgError && (
                <p className="text-[11px] font-light tracking-wider mt-2">{logoSvgError}</p>
              )}
              {loginSettings.logoSvg && (
                <div className="mt-3 border border-neutral-200 p-6 flex items-center justify-center bg-neutral-50">
                  <div
                    className="[&>svg]:h-16 [&>svg]:w-auto [&>svg]:max-w-full"
                    dangerouslySetInnerHTML={{ __html: loginSettings.logoSvg }}
                  />
                </div>
              )}
              <p className="text-[10px] font-light tracking-widest text-neutral-400 mt-2">
                Se sanitiza en el servidor (sin scripts). Máx. 64 KB.
              </p>
            </div>

            <div>
              <label className="block text-[10px] font-light tracking-[0.25em] text-neutral-500 mb-2">
                URL IMAGEN (MODELO / FONDO)
              </label>
              <input
                type="url"
                value={loginSettings.imageUrl}
                onChange={(e) => setLoginSettings({ ...loginSettings, imageUrl: e.target.value })}
                placeholder="https://..."
                className="w-full bg-transparent border-0 border-b border-black py-2 text-[11px] font-mono tracking-wider focus:outline-none"
              />
              {loginSettings.imageUrl && (
                <div className="mt-3 w-full max-w-sm aspect-[3/4] bg-neutral-100 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={loginSettings.imageUrl}
                    alt="preview"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
            </div>
            <div className="flex items-center gap-4 pt-2">
              <button
                type="submit"
                className="text-[11px] font-bold tracking-[0.25em] underline underline-offset-[6px] hover:no-underline"
              >
                Guardar
              </button>
              {loginSaved && (
                <span className="text-[10px] font-bold tracking-[0.2em]">✓ Guardado</span>
              )}
            </div>
          </form>
        </section>
      )}

      {/* ─── Marketplace credentials ──────────────────────────────── */}
      <section className="max-w-3xl">
        <h2 className="text-sm font-bold tracking-[0.2em] mb-6 border-b border-black pb-3">
          |{isAdmin ? "03" : "01"}| Marketplaces
        </h2>

        {shopifyBanner && (
          <div className="mb-6 p-4 border border-black text-[11px] font-light tracking-wider flex items-start justify-between gap-4">
            <span>{shopifyBanner.ok ? "✓ " : "✗ "}{shopifyBanner.message}</span>
            <button
              onClick={() => setShopifyBanner(null)}
              className="text-[10px] font-bold tracking-[0.2em] underline underline-offset-4 hover:no-underline shrink-0"
            >
              Cerrar
            </button>
          </div>
        )}
        <div className="space-y-6">
          {platforms.map((p) => {
            const test = testStatus[p.platform];
            return (
              <div key={p.platform} className="border border-black">
                <div className="px-4 lg:px-6 py-4 border-b border-black bg-neutral-50">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-sm lg:text-base font-bold tracking-[0.15em]">{p.label}</h3>
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

                <div className="px-4 lg:px-6 py-5 space-y-4">
                  {p.fields.map((field) => (
                    <div key={field.key}>
                      <label className="block text-[10px] font-bold tracking-[0.2em] mb-2">{field.label}</label>
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

                  <div className="border border-black p-4">
                    <p className="text-[10px] font-bold tracking-[0.2em] mb-2">URL de Webhook</p>
                    <code className="text-[11px] font-mono break-all text-neutral-700">
                      {typeof window !== "undefined" ? window.location.origin : "https://tu-app.railway.app"}{webhookPaths[p.platform]}
                    </code>
                  </div>

                  {test && !test.loading && (
                    <div className="p-3 border border-black text-[11px] font-light tracking-wider">
                      {test.ok ? "✓ " : "✗ "}{test.message}
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
                    <div className="flex flex-wrap items-center gap-5">
                      {/* Shopify: Verificar sólo tiene sentido después del OAuth (antes no hay token). */}
                      {!(p.platform === "shopify" && !activeStatus["shopify"]) && (
                        <button
                          onClick={() => handleTest(p.platform)}
                          disabled={test?.loading}
                          className="text-[11px] font-bold tracking-[0.25em] underline underline-offset-[6px] hover:no-underline disabled:opacity-40 flex items-center gap-2"
                        >
                          {test?.loading && (
                            <span className="w-3 h-3 border border-current border-t-transparent spinner-ring animate-spin inline-block" />
                          )}
                          {test?.loading ? "Verificando..." : "Verificar Conexión"}
                        </button>
                      )}
                      {p.platform === "shopify" && isAdmin && (
                        <button
                          onClick={connectShopify}
                          className="text-[11px] font-bold tracking-[0.25em] underline underline-offset-[6px] hover:no-underline"
                        >
                          {activeStatus["shopify"] ? "Reconectar con Shopify" : "Conectar con Shopify"}
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-4">
                      {saved === p.platform && (
                        <span className="text-[10px] font-bold tracking-[0.2em]">✓ Guardado</span>
                      )}
                      <button
                        onClick={() => handleSave(p.platform)}
                        disabled={saving === p.platform}
                        className="text-[11px] font-bold tracking-[0.25em] underline underline-offset-[6px] hover:no-underline disabled:opacity-40"
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
      </section>
    </div>
  );
}
