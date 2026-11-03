"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { createClient } from "@/app/lib/supabase/server";

function validPassword(password: string) {
  return password.length >= 12 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}

function resetUrl(email: string, error?: string) {
  const params = new URLSearchParams({ email });
  if (error) params.set("error", error);
  return `/reset-password?${params.toString()}`;
}

export async function verifyPasswordResetOtp(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const otp = String(formData.get("otp") ?? "").replace(/\s/g, "");

  if (!email || !/^\d{6}$/.test(otp)) redirect(resetUrl(email, "invalid-otp"));

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email,
    token: otp,
    type: "recovery",
  });

  if (error) redirect(resetUrl(email, "invalid-otp"));

  redirect(`${resetUrl(email)}&verified=1`);
}

export async function resetPassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!validPassword(password)) redirect("/reset-password?error=weak-password");
  if (password !== confirmPassword) redirect("/reset-password?error=password-mismatch");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/forgot-password?error=recovery-link-invalid");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect("/reset-password?error=update-failed");

  const admin = createAdminClient();
  await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, must_change_password: false },
  });

  redirect("/dashboard");
}
