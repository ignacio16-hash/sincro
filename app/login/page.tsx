"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface Settings {
  logoText: string;
  imageUrl: string;
}

function LoginInner() {
  const router = useRouter();
  const qs = useSearchParams();
  const next = qs.get("next") || "";

  const [settings, setSettings] = useState<Settings>({ logoText: "PARROT", imageUrl: "" });
  const [stage, setStage] = useState<"username" | "pin">("username");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState(["", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    fetch("/api/login-settings")
      .then((r) => r.json())
      .then((d: Settings) => setSettings(d))
      .catch(() => { /* keep defaults */ });
  }, []);

  async function handleContinue(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim()) { setError("Ingresa tu usuario"); return; }
    setStage("pin");
    setTimeout(() => pinRefs.current[0]?.focus(), 50);
  }

  async function submitPin(digits: string[]) {
    const fullPin = digits.join("");
    if (fullPin.length !== 4) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), pin: fullPin }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Credenciales incorrectas");
        setPin(["", "", "", ""]);
        setTimeout(() => pinRefs.current[0]?.focus(), 50);
        return;
      }
      const target = next || json.redirect || "/dashboard";
      router.push(target);
      router.refresh();
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }

  function handlePinDigit(i: number, v: string) {
    const digit = v.replace(/\D/g, "").slice(-1);
    const next = [...pin];
    next[i] = digit;
    setPin(next);
    if (digit && i < 3) pinRefs.current[i + 1]?.focus();
    if (digit && i === 3) submitPin(next);
  }

  function handlePinKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !pin[i] && i > 0) {
      pinRefs.current[i - 1]?.focus();
    }
  }

  function goBack() {
    setStage("username");
    setPin(["", "", "", ""]);
    setError(null);
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-white text-black">
      {/* ─── Left: form ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col px-6 sm:px-16 lg:px-24 py-10 lg:py-16">
        {/* Logo */}
        <div className="mb-12 lg:mb-20">
          <h1
            className="font-bold tracking-[0.02em] leading-none select-none"
            style={{ fontSize: "clamp(3rem, 7vw, 5.5rem)", letterSpacing: "-0.01em" }}
          >
            {settings.logoText || "PARROT"}
          </h1>
        </div>

        <div className="max-w-md w-full">
          <h2 className="text-xs font-bold tracking-[0.2em] mb-8">
            INICIA SESIÓN
          </h2>

          {stage === "username" && (
            <form onSubmit={handleContinue} className="space-y-8">
              <div>
                <label className="block text-[10px] font-light tracking-[0.25em] text-neutral-500 mb-2">
                  USUARIO
                </label>
                <input
                  autoFocus
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  className="w-full bg-transparent border-0 border-b border-black py-3 text-sm tracking-widest focus:outline-none"
                  style={{ textTransform: "lowercase" }}
                />
              </div>
              {error && <p className="text-xs font-light tracking-wider">{error}</p>}
              <button
                type="submit"
                className="w-full border border-black py-4 text-xs font-bold tracking-[0.25em] hover:bg-black hover:text-white"
              >
                Continuar
              </button>
            </form>
          )}

          {stage === "pin" && (
            <div className="space-y-8">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-[10px] font-light tracking-[0.25em] text-neutral-500">
                    PIN · 4 DÍGITOS
                  </label>
                  <button
                    type="button"
                    onClick={goBack}
                    className="text-[10px] font-light tracking-[0.2em] underline underline-offset-4"
                  >
                    CAMBIAR USUARIO
                  </button>
                </div>
                <div className="flex gap-3">
                  {pin.map((d, i) => (
                    <input
                      key={i}
                      ref={(el) => { pinRefs.current[i] = el; }}
                      type="password"
                      inputMode="numeric"
                      maxLength={1}
                      value={d}
                      onChange={(e) => handlePinDigit(i, e.target.value)}
                      onKeyDown={(e) => handlePinKey(i, e)}
                      className="w-14 h-16 border border-black text-center text-2xl font-bold tracking-[0.2em] focus:outline-none focus:bg-neutral-50"
                      disabled={loading}
                    />
                  ))}
                </div>
                <p className="text-[10px] font-light tracking-[0.2em] text-neutral-500 mt-4">
                  Usuario: <span className="font-bold">{username}</span>
                </p>
              </div>
              {error && <p className="text-xs font-light tracking-wider">{error}</p>}
              {loading && (
                <p className="text-[11px] font-light tracking-[0.2em] text-neutral-500">
                  Verificando...
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mt-auto pt-10">
          <p className="text-[10px] font-light tracking-[0.25em] text-neutral-500">AYUDA</p>
        </div>
      </div>

      {/* ─── Right: model image ─────────────────────────────────── */}
      <div className="hidden lg:block w-[45%] xl:w-1/2 relative bg-neutral-100">
        {settings.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={settings.imageUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : null}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <LoginInner />
    </Suspense>
  );
}
