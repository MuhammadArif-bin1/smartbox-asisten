"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DASHBOARD_PASSWORD } from "@/lib/smartbox-constants";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isChecking, setIsChecking] = useState(false);

  // Redirect to admin if already authenticated
  useEffect(() => {
    const stored = sessionStorage.getItem("smartbox_auth");
    if (stored === "1") {
      router.replace("/admin");
    }
  }, [router]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsChecking(true);
    setError("");

    setTimeout(() => {
      if (password === DASHBOARD_PASSWORD) {
        sessionStorage.setItem("smartbox_auth", "1");
        router.push("/admin");
      } else {
        setError("Password salah");
        setIsChecking(false);
      }
    }, 400);
  }

  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 px-4 text-white">
      {/* Background decoration elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[40%] -left-[20%] w-[80%] h-[80%] rounded-full bg-blue-600/10 blur-[120px] animate-pulse duration-[6000ms]" />
        <div className="absolute -bottom-[40%] -right-[20%] w-[80%] h-[80%] rounded-full bg-emerald-600/5 blur-[120px] animate-pulse duration-[8000ms]" />
      </div>

      <section className="relative w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/60 p-8 shadow-2xl backdrop-blur-xl transition hover:border-white/15">
        <div className="mb-8 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-lg font-black text-white shadow-lg shadow-blue-500/20 ring-4 ring-blue-500/10">
            SB
          </div>
          <div>
            <h1 className="text-2xl font-black leading-7 text-white tracking-wide">SmartBox</h1>
            <p className="text-sm font-semibold text-slate-400">Assistant Login</p>
          </div>
        </div>

        <form className="grid gap-5" onSubmit={handleSubmit}>
          <label className="grid gap-2.5">
            <span className="text-sm font-bold text-slate-300">Password</span>
            <input
              autoComplete="current-password"
              autoFocus
              className="h-14 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-5 text-base font-semibold text-white placeholder-slate-600 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
              disabled={isChecking}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Masukkan password"
              type="password"
              value={password}
            />
          </label>

          {error && (
            <div className="flex items-center gap-3 rounded-2xl bg-red-950/40 border border-red-500/20 px-5 py-4 text-sm font-bold text-red-400">
              <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <button
            className="group relative h-14 w-full overflow-hidden rounded-2xl bg-blue-600 text-base font-black text-white shadow-lg shadow-blue-500/10 transition duration-300 hover:bg-blue-500 active:scale-[0.98] disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none"
            disabled={isChecking}
            type="submit"
          >
            {isChecking ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Memverifikasi...
              </span>
            ) : (
              "Masuk ke Monitoring"
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between text-xs text-slate-500 font-medium">
          <span>SmartBox Assistant IoT</span>
          <span className="font-mono">ESP32-S3</span>
        </div>
      </section>
    </main>
  );
}
