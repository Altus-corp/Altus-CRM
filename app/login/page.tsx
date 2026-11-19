import Link from "next/link";
import { CircleHelp } from "lucide-react";
import { LoginForm } from "./login-form";

export const instant = false;

type LoginPageProps = {
    searchParams: Promise<{ error?: string }>;
};

const errorMessages: Record<string, string> = {
    "missing-fields": "Enter your email and password.",
  "invalid-credentials": "Invalid email or password.",
  "not-authorized": "This account does not have a CRM role.",
  "account-suspended": "This account has been suspended. Contact an administrator.",
  "password-changed": "Your password has been changed. Please log in again with your new password.",
  "geo-required": "This account can only sign in from an approved location. Allow location access in your browser and try again.",
  "geo-outside": "This account can only sign in from an approved location, and you're currently outside it.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
    const { error } = await searchParams;

    return (
        <main className="min-h-[100svh] bg-white text-[#151d32] lg:grid lg:h-screen lg:min-h-0 lg:grid-cols-[minmax(0,1.08fr)_minmax(470px,0.92fr)] lg:overflow-hidden">
            <section className="relative hidden h-full min-h-0 overflow-hidden bg-[#0c1019] px-[clamp(2.5rem,5.5vw,6.5rem)] py-[clamp(2rem,4vw,3.5rem)] lg:flex lg:flex-col">
                <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(148,163,184,0.13)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.13)_1px,transparent_1px)] [background-size:38px_38px]" />
                <div className="absolute -right-44 top-[-120px] h-[470px] w-[470px] rounded-full bg-[radial-gradient(circle,rgba(225,0,41,0.48),rgba(100,0,26,0.23)_40%,transparent_70%)] blur-2xl" />
                <div className="relative z-10 my-auto max-w-[535px]">
                    <p className="mb-4 text-[11px] font-extrabold tracking-[0.2em] text-red-400">ALTUS CRM</p>
                    <h1 className="text-[clamp(2.55rem,4.2vw,4.7rem)] font-black leading-[0.98] tracking-[-0.075em] text-white">Everything your sales team needs, <span className="bg-gradient-to-r from-red-400 to-rose-500 bg-clip-text text-transparent">in one place</span></h1>
                    <p className="mt-6 max-w-[430px] text-[15px] font-medium leading-relaxed text-slate-300">A clear, connected workspace for customer relationships, campaigns, reports, and sales operations.</p>
                    <div className="mt-7 flex flex-wrap gap-2">{["Leads", "Products", "Reports", "Activities", "Follow-ups"].map((item) => <span key={item} className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-[11px] font-bold text-slate-200">{item}</span>)}</div>
                    <div className="mt-8 w-full max-w-[390px] rounded-2xl border border-white/10 bg-slate-900/65 p-4 shadow-2xl shadow-black/20">
                        <div className="flex items-end gap-2.5">{[36, 56, 84, 112, 142].map((height, index) => <span key={height} className="w-5 rounded-t-md bg-gradient-to-t from-[#a40000] to-[#fc3156]" style={{ height: `${height / 2}px`, opacity: 0.62 + index * 0.09 }} />)}<svg viewBox="0 0 205 78" className="ml-3 h-20 flex-1 text-slate-200" fill="none"><path d="m3 65 33-17 33 9 40-38 27 9 58-23" stroke="currentColor" strokeWidth="2.5" /><circle cx="194" cy="5" r="5" fill="#fb4768" /></svg></div>
                    </div>
                </div>
                <p className="relative z-10 mt-10 text-xs font-medium text-slate-500">© {new Date().getFullYear()} Altus CRM</p>
            </section>

            <section className="flex min-h-[100svh] items-center justify-center px-5 py-7 sm:px-10 lg:h-full lg:min-h-0 lg:px-[clamp(3rem,8vw,9rem)] lg:py-5">
                <div className="w-full max-w-[420px]">
                    {error && <p role="alert" className="mb-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessages[error] ?? "Unable to sign in."}</p>}
                    <LoginForm />
                    <Link href="/forgot-password" className="mt-4 flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 px-4 py-2.5 text-left transition hover:border-red-200 hover:bg-red-50/40"><CircleHelp aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" /><span><span className="block text-[12px] font-extrabold text-red-600">Forgot your password?</span><span className="mt-0.5 block text-[11px] font-medium text-slate-500">We’ll send a secure reset code to your email.</span></span></Link>
                    <div className="mt-5 border-t border-slate-200 pt-4 text-center text-[11px] font-medium text-slate-400">© {new Date().getFullYear()} Altus CRM</div>
                </div>
            </section>
        </main>
    );
}
