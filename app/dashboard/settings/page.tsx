import { connection } from "next/server";
import { requireUser } from "@/app/lib/auth";
import { getUserSmtpSettings } from "@/app/lib/smtp-settings";
import { SmtpSettingsForm } from "@/components/settings/smtp-settings-form";

export const instant = false;

export default async function SettingsPage() {
  await connection();
  const { userId, email, displayName } = await requireUser();
  const saved = await getUserSmtpSettings(userId);

  return <section className="mx-auto max-w-3xl">
    <header><p className="text-[10px] font-extrabold tracking-[0.12em] text-red-600">SETTINGS</p><h1 className="mt-0.5 text-[22px] font-extrabold tracking-[-0.04em] text-slate-900">Settings</h1></header>
    <SmtpSettingsForm configured={Boolean(saved)} defaults={{ host: saved?.host ?? process.env.SMTP_HOST ?? "", port: saved?.port ?? Number(process.env.SMTP_PORT ?? 587), username: saved?.username ?? email, fromEmail: saved?.from_email ?? email, fromName: saved?.from_name ?? displayName }} />
  </section>;
}
