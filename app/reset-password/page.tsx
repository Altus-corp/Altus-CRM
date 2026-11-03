import { redirect } from "next/navigation";
import { createClient } from "@/app/lib/supabase/server";
import { resetPassword } from "./actions";

export const instant = false;

type ResetPasswordPageProps = {
  searchParams: Promise<{ error?: string }>;
};

const errors: Record<string, string> = {
  "weak-password": "Use at least 12 characters with uppercase, lowercase, a number, and a symbol.",
  "password-mismatch": "The passwords do not match.",
  "update-failed": "We could not update your password. Please try again.",
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/forgot-password?error=recovery-link-invalid");

  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <form action={resetPassword} className="w-full max-w-md space-y-5 rounded-2xl bg-white p-7 shadow-sm">
        <div>
          <p className="text-xs font-extrabold tracking-[0.16em] text-red-600">ALTUS CRM</p>
          <h1 className="mt-2 text-2xl font-extrabold text-slate-900">Choose a new password</h1>
          <p className="mt-2 text-sm font-medium text-slate-500">Use a strong password that you do not use elsewhere.</p>
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{errors[error] ?? "Unable to update your password."}</p>}
        <label className="block text-sm font-bold text-slate-700">New password<input name="password" type="password" required minLength={12} autoComplete="new-password" className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-red-500" /></label>
        <label className="block text-sm font-bold text-slate-700">Confirm new password<input name="confirmPassword" type="password" required minLength={12} autoComplete="new-password" className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-red-500" /></label>
        <button className="w-full rounded-lg bg-[#d90000] py-3 text-sm font-bold text-white">Reset password</button>
      </form>
    </main>
  );
}
