"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Mail, LockKeyhole } from "lucide-react";
import { PasswordField } from "@/components/auth/password-field";
import { login } from "./actions";

// A geofenced user's login depends on their device's current location, so
// submission has to request it from the browser first — a plain
// <form action={login}> can't do that itself.
export function LoginForm() {
  const [isPending, startTransition] = useTransition();
  const [locating, setLocating] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setLocating(true);
    const finish = (coords?: GeolocationCoordinates) => {
      if (coords) {
        formData.set("lat", String(coords.latitude));
        formData.set("lng", String(coords.longitude));
      } else {
        formData.set("geoDenied", "1");
      }
      setLocating(false);
      startTransition(() => {
        void login(formData);
      });
    };
    if (!navigator.geolocation) { finish(undefined); return; }
    navigator.geolocation.getCurrentPosition(
      (position) => finish(position.coords),
      () => finish(undefined),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  const busy = isPending || locating;

  return (
    <form onSubmit={submit} className="w-full max-w-[420px]">
      <p className="text-[11px] font-extrabold tracking-[0.18em] text-red-600">WELCOME BACK</p>
      <h2 className="mt-2 text-[clamp(1.8rem,2.6vw,2.35rem)] font-black tracking-[-0.055em] text-[#111a30]">Sign in to your account</h2>
      <p className="mt-2 text-sm font-medium text-slate-500">Use the email address on your CRM account.</p>
      <div className="mt-6 space-y-4">
        <label className="block text-[12px] font-extrabold text-slate-700">Email<span className="relative mt-2 block"><Mail aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input name="email" type="email" required autoComplete="email" placeholder="you@company.com" className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-10 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-red-400 focus:bg-white focus:ring-4 focus:ring-red-50" /></span></label>
        <label className="block text-[12px] font-extrabold text-slate-700">Password<span className="relative mt-2 block"><LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" /><PasswordField name="password" required autoComplete="current-password" placeholder="Enter your password" className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-10 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-red-400 focus:bg-white focus:ring-4 focus:ring-red-50" /></span></label>
      </div>
      <button type="submit" disabled={busy} aria-disabled={busy} className="mt-6 h-11 w-full rounded-xl bg-gradient-to-b from-[#f90b26] to-[#da000e] text-sm font-extrabold text-white shadow-[0_9px_18px_rgba(224,0,19,0.24)] transition hover:brightness-105 active:translate-y-px disabled:cursor-wait disabled:opacity-65 disabled:hover:brightness-100 disabled:active:translate-y-0">
        {locating ? "Checking your location…" : isPending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
