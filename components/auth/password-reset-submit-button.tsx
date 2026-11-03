"use client";

import { useFormStatus } from "react-dom";

export function PasswordResetSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-[#d90000] py-3 text-sm font-bold text-white disabled:cursor-wait disabled:bg-red-300"
    >
      {pending ? "Sending code..." : "Send verification code"}
    </button>
  );
}
