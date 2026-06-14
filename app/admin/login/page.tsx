"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { DASHBOARD_PASSWORD } from "@/lib/smartbox-constants";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isChecking, setIsChecking] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsChecking(true);

    setTimeout(() => {
      if (password === DASHBOARD_PASSWORD) {
        localStorage.setItem("smartbox_auth", "1");
        router.push("/admin");
      } else {
        setError("Password salah");
        setIsChecking(false);
      }
    }, 300);
  }

  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100 px-4 text-slate-950">
      <section className="w-full max-w-md rounded-3xl border border-slate-200/80 bg-white p-8 shadow-xl shadow-slate-200/50">
        <div className="mb-8 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-base font-black text-white shadow-lg shadow-blue-200">SB</div>
          <div>
            <h1 className="text-2xl font-black leading-7 text-slate-950">SmartBox</h1>
            <p className="text-base font-semibold text-slate-500">Dashboard Login</p>
          </div>
        </div>

        <form className="grid gap-5" onSubmit={handleSubmit}>
          <label className="grid gap-2.5">
            <span className="text-sm font-bold text-slate-700">Password</span>
            <input
              autoComplete="current-password"
              autoFocus
              className="h-14 rounded-2xl border border-slate-200 bg-white px-5 text-base font-semibold outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              disabled={isChecking}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Masukkan password"
              type="password"
              value={password}
            />
          </label>

          {error && <p className="rounded-2xl bg-red-50 px-5 py-4 text-sm font-bold text-red-600">{error}</p>}

          <button
            className="h-14 rounded-2xl bg-blue-600 px-5 text-base font-black text-white shadow-lg shadow-blue-100 transition hover:bg-blue-700 active:scale-[0.98] disabled:bg-slate-400 disabled:shadow-none"
            disabled={isChecking}
            type="submit"
          >
            {isChecking ? "Memeriksa..." : "Masuk"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400 font-medium">SmartBox Assistant IoT • ESP32-S3</p>
      </section>
    </main>
  );
}
