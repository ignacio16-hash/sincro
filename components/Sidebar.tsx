"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/stock", label: "Stock" },
  { href: "/orders", label: "Pedidos" },
  { href: "/sku-match", label: "Match SKUs" },
  { href: "/logs", label: "Logs" },
  { href: "/settings", label: "Configuración" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Lock body scroll when drawer is open (mobile)
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* ─── Mobile top bar ────────────────────────────────────────────── */}
      <header className="lg:hidden sticky top-0 z-40 flex items-center justify-between border-b border-black bg-white px-4 h-14">
        <Link href="/dashboard" className="font-bold text-sm tracking-widest">
          SINCROSTOCK
        </Link>
        <button
          aria-label="Menú"
          onClick={() => setOpen((v) => !v)}
          className="w-10 h-10 flex items-center justify-center border border-black"
        >
          {open ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="square" strokeWidth={2} d="M6 6L18 18M6 18L18 6" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="square" strokeWidth={2} d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          )}
        </button>
      </header>

      {/* ─── Mobile drawer ─────────────────────────────────────────────── */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-white slide-in flex flex-col"
          role="dialog"
        >
          <div className="flex items-center justify-between border-b border-black px-4 h-14">
            <span className="font-bold text-sm tracking-widest">MENÚ</span>
            <button
              onClick={() => setOpen(false)}
              aria-label="Cerrar"
              className="w-10 h-10 flex items-center justify-center border border-black"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="square" strokeWidth={2} d="M6 6L18 18M6 18L18 6" />
              </svg>
            </button>
          </div>
          <nav className="flex-1 flex flex-col">
            {nav.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  data-active={active}
                  className={cn(
                    "border-b border-neutral-200 px-6 py-5 text-base tracking-widest",
                    active ? "bg-black text-white font-bold" : "font-light"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-black px-6 py-4 text-[10px] tracking-widest text-neutral-500">
            SYNC CADA 15 MIN
          </div>
        </div>
      )}

      {/* ─── Desktop sidebar ───────────────────────────────────────────── */}
      <aside className="hidden lg:flex w-56 xl:w-64 shrink-0 min-h-screen bg-white border-r border-black flex-col">
        <div className="px-6 h-20 flex items-center border-b border-black">
          <Link href="/dashboard" className="block">
            <p className="font-bold text-base tracking-[0.25em] leading-tight">SINCROSTOCK</p>
            <p className="text-[10px] font-light tracking-[0.25em] text-neutral-500 mt-1">
              MULTI-MARKETPLACE
            </p>
          </Link>
        </div>

        <nav className="flex-1 flex flex-col">
          {nav.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                data-active={active}
                className={cn(
                  "px-6 py-4 text-xs tracking-[0.2em] border-b border-neutral-100 transition-colors",
                  active
                    ? "bg-black text-white font-bold"
                    : "font-light text-black hover:bg-neutral-100"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-6 py-4 border-t border-black">
          <p className="text-[10px] font-light tracking-[0.25em] text-neutral-500">
            SYNC CADA 15 MIN
          </p>
        </div>
      </aside>
    </>
  );
}
