"use client";

import { useFormStatus } from "react-dom";

export function LoginSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="mt-6 h-11 w-full rounded-xl bg-gradient-to-b from-[#f90b26] to-[#da000e] text-sm font-extrabold text-white shadow-[0_9px_18px_rgba(224,0,19,0.24)] transition hover:brightness-105 active:translate-y-px disabled:cursor-wait disabled:opacity-65 disabled:hover:brightness-100 disabled:active:translate-y-0"
    >
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}
