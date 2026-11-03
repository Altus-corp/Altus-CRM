import Link from "next/link";
import { requestPasswordReset } from "./actions";

export const instant = false;

type ForgotPasswordPageProps = {
  searchParams: Promise<{ error?: string; sent?: string }>;
};

const errors: Record<string, string> = {
  "missing-email": "Enter the email address for your CRM account.",
  "request-failed": "We could not send the recovery email. Please try again.",
  "recovery-link-invalid": "That recovery link is invalid or has expired. Request a new one.",
};

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const { error, sent } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <form action={requestPasswordReset} className="w-full max-w-md space-y-5 rounded-2xl bg-white p-7 shadow-sm">
        <div>
          <p className="text-xs font-extrabold tracking-[0.16em] text-red-600">ALTUS CRM</p>
          <h1 className="mt-2 text-2xl font-extrabold text-slate-900">Reset your password</h1>
          <p className="mt-2 text-sm font-medium text-slate-500">
            Enter your email and we&apos;ll send a secure password-reset link.
          </p>
        </div>

        {sent === "1" && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
            If that email belongs to a CRM account, a password-reset link has been sent.
          </p>
        )}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{errors[error] ?? "Unable to request a password reset."}</p>}

        <label className="block text-sm font-bold text-slate-700">
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-red-500"
          />
        </label>

        <button className="w-full rounded-lg bg-[#d90000] py-3 text-sm font-bold text-white">Send reset link</button>
        <Link href="/login" className="block text-center text-sm font-semibold text-slate-600 hover:text-red-600">Back to sign in</Link>
      </form>
    </main>
  );
}
