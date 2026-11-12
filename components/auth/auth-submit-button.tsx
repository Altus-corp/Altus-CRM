"use client";

import { useFormStatus } from "react-dom";

export function AuthSubmitButton({ idleLabel, pendingLabel }: { idleLabel: string; pendingLabel: string }) {
  const { pending } = useFormStatus();

  return <button
    type="submit"
    disabled={pending}
    aria-disabled={pending}
    aria-busy={pending}
    className="w-full rounded-lg bg-[#d90000] py-3 text-sm font-bold text-white transition disabled:cursor-wait disabled:bg-red-300 disabled:text-red-50"
  >
    {pending ? pendingLabel : idleLabel}
  </button>;
}
