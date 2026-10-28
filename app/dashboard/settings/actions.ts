"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/app/lib/auth";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { createSmtpTransport, encryptSmtpPassword, getUserSmtpPassword } from "@/app/lib/smtp-settings";

export async function saveSmtpSettings(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const { userId } = await requireUser();
  const host = String(formData.get("host") ?? "").trim();
  const port = Number(formData.get("port") ?? 587);
  const username = String(formData.get("username") ?? "").trim();
  const fromEmail = String(formData.get("fromEmail") ?? "").trim().toLowerCase();
  const fromName = String(formData.get("fromName") ?? "").trim();
  const enteredPassword = String(formData.get("password") ?? "");
  if (!host || !username || !fromEmail) return { ok: false, message: "Host, username and email are required." };
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, message: "Enter a valid port." };
  try {
    const password = enteredPassword || await getUserSmtpPassword(userId);
    if (!password) return { ok: false, message: "Enter your email password." };
    await createSmtpTransport({ host, port, username, password }).verify();
    const { error } = await createAdminClient().from("user_smtp_settings").upsert({ user_id: userId, host, port, username, from_email: fromEmail, from_name: fromName || null, password_encrypted: encryptSmtpPassword(password), updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) return { ok: false, message: error.message };
    revalidatePath("/dashboard/settings");
    return { ok: true, message: "Connection verified and email settings saved." };
  } catch (error) {
    return { ok: false, message: `Could not connect with these settings: ${error instanceof Error ? error.message : "unknown error"}` };
  }
}

export async function removeSmtpSettings(): Promise<{ ok: boolean; message: string }> {
  const { userId } = await requireUser();
  const { error } = await createAdminClient().from("user_smtp_settings").delete().eq("user_id", userId);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/dashboard/settings");
  return { ok: true, message: "Email settings removed." };
}
