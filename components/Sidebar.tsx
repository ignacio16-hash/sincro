"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Role = "admin" | "vendedor";
interface SessionUser { username: string; role: Role }

// Full nav + minimum role
const NAV = [
  { href: "/dashboard",  label: "Dashboard",     roles: ["admin"] as Role[] },
  { href: "/stock",      label: "Stock",         roles: ["admin"] as Role[] },
  { href: "/orders",     label: "Pedidos",       roles: ["admin", "vendedor"] as Role[] },
  { href: "/guia",       label: "Guía",          roles: ["vendedor"] as Role[] },
  { href: "/sku-match",  label: "Match SKUs",    roles: ["admin"] as Role[] },
  { href: "/logs",       label: "Logs",          roles: ["admin"] as Role[] },
  { href: "/settings",   label: "Configuración", roles: ["admin"] as Role[] },
];

function num(i: number): string {
  return String(i + 1).padStart(2, "0");
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  // Logo de la app — mismo asset que se muestra en /login. Cualquiera de los
  // dos campos vale: data URL (PNG/SVG subido) o el SVG inline legacy.
  const [appLogo, setAppLogo] = useState<string | null>(null);
  const [logoSvg, setLogoSvg] = useState<string | null>(null);
  const [logoText, setLogoText] = useState<string>("Parrot");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d: { user: SessionUser | null }) => setUser(d.user))
      .catch(() => setUser(null));
  }, [pathname]);

  useEffect(() => {
    fetch("/api/login-settings")
      .then((r) => r.json())
      .then((d: { appLogoDataUrl?: string | null; logoSvg?: string | null; logoText?: string }) => {
        setAppLogo(d.appLogoDataUrl ?? null);
        setLogoSvg(d.logoSvg ?? null);
        if (d.logoText && d.logoText.trim()) setLogoText(d.logoText);
      })
      .catch(() => {
        setAppLogo(null);
        setLogoSvg(null);
      });
  }, [pathname]);

  // Body scroll lock when mobile drawer is open
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const visible = NAV.filter((n) => !user || n.roles.includes(user.role));

  return (
    <>
      {/* ─── Mobile top bar ────────────────────────────────────────────── */}
      <header className="lg:hidden sticky top-0 z-40 flex items-center justify-between border-b border-black bg-white px-4 h-14">
        <Link
          href={user?.role === "vendedor" ? "/orders" : "/dashboard"}
          className="font-bold text-lg tracking-[0.02em] flex items-center"
        >
          {appLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={appLogo} alt={logoText} className="h-7 w-auto max-w-[140px] object-contain" />
          ) : logoSvg ? (
            <span
              aria-label={logoText}
              className="block [&>svg]:h-7 [&>svg]:w-auto [&>svg]:max-w-[140px]"
              dangerouslySetInnerHTML={{ __html: logoSvg }}
            />
          ) : (
            logoText
          )}
        </Link>
        <div className="flex items-center gap-3">
          {user && (
            <span className="text-[10px] font-light tracking-[0.2em] text-neutral-500">
              {user.username}
            </span>
          )}
          <button
            aria-label="Menú"
            onClick={() => setOpen((v) => !v)}
            className="w-10 h-10 flex items-center justify-center"
          >
            {open ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="square" strokeWidth={1.5} d="M6 6L18 18M6 18L18 6" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="square" strokeWidth={1.5} d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* ─── Mobile drawer ─────────────────────────────────────────────── */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 bg-white slide-in flex flex-col">
          <div className="flex items-center justify-between border-b border-black px-4 h-14">
            <span className="font-bold text-lg tracking-[0.02em] flex items-center">
              {appLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={appLogo} alt={logoText} className="h-7 w-auto max-w-[140px] object-contain" />
              ) : logoSvg ? (
                <span
                  aria-label={logoText}
                  className="block [&>svg]:h-7 [&>svg]:w-auto [&>svg]:max-w-[140px]"
                  dangerouslySetInnerHTML={{ __html: logoSvg }}
                />
              ) : (
                logoText
              )}
            </span>
            <button
              onClick={() => setOpen(false)}
              aria-label="Cerrar"
              className="w-10 h-10 flex items-center justify-center"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="square" strokeWidth={1.5} d="M6 6L18 18M6 18L18 6" />
              </svg>
            </button>
          </div>
          <nav className="flex-1 flex flex-col px-6 py-10">
            {visible.map((item, i) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  data-active={active}
                  className={cn(
                    "flex items-center gap-4 py-4 text-base tracking-[0.1em]",
                    active ? "font-bold" : "font-light"
                  )}
                >
                  <span className="text-neutral-400 font-light">|{num(i)}|</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-black px-6 py-5 flex items-center justify-between">
            <div>
              {user && (
                <>
                  <p className="text-[10px] font-light tracking-[0.25em] text-neutral-500">
                    {user.role === "admin" ? "ADMIN" : "VENDEDOR"}
                  </p>
                  <p className="text-xs font-bold tracking-[0.1em] mt-1">{user.username}</p>
                </>
              )}
            </div>
            <button
              onClick={handleLogout}
              className="text-[11px] font-bold tracking-[0.2em] underline underline-offset-4"
            >
              Cerrar Sesión
            </button>
          </div>
        </div>
      )}

      {/* ─── Desktop sidebar ───────────────────────────────────────────── */}
      <aside className="hidden lg:flex w-60 xl:w-64 shrink-0 min-h-screen bg-white border-r border-black flex-col">
        <div className="px-8 pt-10 pb-8">
          <Link href={user?.role === "vendedor" ? "/orders" : "/dashboard"}>
            {appLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={appLogo}
                alt={logoText}
                className="h-12 xl:h-14 w-auto max-w-full object-contain"
              />
            ) : logoSvg ? (
              <span
                aria-label={logoText}
                className="block [&>svg]:h-12 [&>svg]:xl:h-14 [&>svg]:w-auto [&>svg]:max-w-full"
                dangerouslySetInnerHTML={{ __html: logoSvg }}
              />
            ) : (
              <>
                <p className="font-bold text-2xl xl:text-3xl tracking-[0.02em] leading-none">
                  {logoText}
                </p>
                <div className="mt-2 w-10 h-[1.5px] bg-black" />
              </>
            )}
          </Link>
        </div>

        <nav className="flex-1 flex flex-col px-8">
          {visible.map((item, i) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                data-active={active}
                className={cn(
                  "flex items-center gap-3 py-2 text-[11px] tracking-[0.15em]",
                  active ? "font-bold" : "font-light text-neutral-600 hover:text-black"
                )}
              >
                <span className="text-neutral-400 font-light">|{num(i)}|</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-8 py-6 border-t border-neutral-200">
          {user && (
            <div className="mb-4">
              <p className="text-[9px] font-light tracking-[0.25em] text-neutral-500">
                {user.role === "admin" ? "ADMIN" : "VENDEDOR"}
              </p>
              <p className="text-[11px] font-bold tracking-[0.1em] mt-1 truncate">{user.username}</p>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="text-[10px] font-bold tracking-[0.2em] underline underline-offset-4 hover:no-underline"
          >
            Cerrar Sesión
          </button>
        </div>
      </aside>
    </>
  );
}
