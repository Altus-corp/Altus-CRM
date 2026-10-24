import { login } from "./actions";

export const instant = false;

type LoginPageProps = {
    searchParams: Promise<{ error?: string }>;
};

const errorMessages: Record<string, string> = {
    "missing-fields": "Enter your email and password.",
  "invalid-credentials": "Invalid email or password.",
  "not-authorized": "This account does not have a CRM role.",
  "account-suspended": "This account has been suspended. Contact an administrator.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
    const { error } = await searchParams;

    return (
        <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
            <form
                action={login}
                className="w-full max-w-md space-y-6 rounded-xl bg-white p-8 shadow-sm"
            >
                <div>
                    <p className="text-sm font-semibold text-blue-600">ALTUS CRM</p>

                    <h1 className="mt-1 text-3xl font-bold text-slate-900">
                        Sign in
                    </h1>

                    <p className="mt-2 text-sm text-slate-500">
                        Sign in with an account created by an administrator.
                    </p>
                </div>

                {error && (
                    <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                        {errorMessages[error] ?? "Unable to sign in."}
                    </p>
                )}

                <label className="block text-sm font-medium text-slate-700">
                    Email
                    <input
                        name="email"
                        type="email"
                        required
                        autoComplete="email"
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-blue-600"
                    />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                    Password
                    <input
                        name="password"
                        type="password"
                        required
                        autoComplete="current-password"
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-blue-600"
                    />
                </label>

                <button
                    type="submit"
                    className="w-full rounded-md bg-blue-600 px-4 py-2.5 font-semibold text-white transition hover:bg-blue-700"
                >
                    Sign in
                </button>
            </form>
        </main>
    );
}
