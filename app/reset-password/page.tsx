import { redirect } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { resetPassword, verifyPasswordResetOtp } from "./actions";

export const instant = false;

type ResetPasswordPageProps = {
  searchParams: Promise<{ email?: string; error?: string; sent?: string; verified?: string }>;
};

const errors: Record<string, string> = {
  "weak-password": "Use at least 12 characters with uppercase, lowercase, a number, and a symbol.",
  "password-mismatch": "The passwords do not match.",
  "update-failed": "We could not update your password. Please try again.",
  "invalid-otp": "That verification code is invalid or has expired. Request a new one.",
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const resetSession = (await cookies()).get("crm_password_reset")?.value;
  const { email = "", error, sent } = await searchParams;

  if (!resetSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <form action={verifyPasswordResetOtp} className="w-full max-w-md space-y-5 rounded-2xl bg-white p-7 shadow-sm">
          <div>
            <p className="text-xs font-extrabold tracking-[0.16em] text-red-600">ALTUS CRM</p>
            <h1 className="mt-2 text-2xl font-extrabold text-slate-900">Verify reset code</h1>
            <p className="mt-2 text-sm font-medium text-slate-500">Enter the six-digit code sent to your email before choosing a new password.</p>
          </div>
          {sent === "1" && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">If that email belongs to a CRM account, a verification code has been sent.</p>}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{errors[error] ?? "Unable to verify the code."}</p>}
          <label className="block text-sm font-bold text-slate-700">Email<input name="email" type="email" required defaultValue={email} autoComplete="email" className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-red-500" /></label>
          <label className="block text-sm font-bold text-slate-700">Verification code<input name="otp" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoComplete="one-time-code" className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 tracking-[0.3em] outline-none focus:border-red-500" /></label>
          <button className="w-full rounded-lg bg-[#d90000] py-3 text-sm font-bold text-white">Verify code</button>
          <Link href="/forgot-password" className="block text-center text-sm font-semibold text-slate-600 hover:text-red-600">Request a new code</Link>
        </form>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <form action={resetPassword} className="w-full max-w-md space-y-5 rounded-2xl bg-white p-7 shadow-sm">
        <div>
          <p className="text-xs font-extrabold tracking-[0.16em] text-red-600">ALTUS CRM</p>
          <h1 className="mt-2 text-2xl font-extrabold text-slate-900">Choose a new password</h1>
          <p className="mt-2 text-sm font-medium text-slate-500">Your email code was verified. Use a strong password that you do not use elsewhere.</p>
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{errors[error] ?? "Unable to update your password."}</p>}
        <label className="block text-sm font-bold text-slate-700">New password<input name="password" type="password" required minLength={12} autoComplete="new-password" className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-red-500" /></label>
        <label className="block text-sm font-bold text-slate-700">Confirm new password<input name="confirmPassword" type="password" required minLength={12} autoComplete="new-password" className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-red-500" /></label>
        <button className="w-full rounded-lg bg-[#d90000] py-3 text-sm font-bold text-white">Reset password</button>
      </form>
    </main>
  );
}
