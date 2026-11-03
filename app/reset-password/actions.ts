"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { createResetSessionToken, hashResetCode, hashResetSessionToken, hashesMatch } from "@/app/lib/password-reset-code";

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

  const admin = createAdminClient();
  const { data, error: userError } = await admin.auth.admin.generateLink({ type: "recovery", email });
  if (userError || !data?.user) redirect(resetUrl(email, "invalid-otp"));

  const { data: resetCode, error: codeError } = await admin
    .from("crm_password_reset_codes")
    .select("code_hash, expires_at, attempt_count, verified_at")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (codeError || !resetCode || resetCode.verified_at || new Date(resetCode.expires_at).getTime() <= Date.now() || resetCode.attempt_count >= 5 || !hashesMatch(resetCode.code_hash, hashResetCode(email, otp))) {
    if (resetCode && !resetCode.verified_at && resetCode.attempt_count < 5)
      await admin.from("crm_password_reset_codes").update({ attempt_count: resetCode.attempt_count + 1, updated_at: new Date().toISOString() }).eq("user_id", data.user.id);
    redirect(resetUrl(email, "invalid-otp"));
  }

  const sessionToken = createResetSessionToken();
  const { error: verifyError } = await admin
    .from("crm_password_reset_codes")
    .update({ verified_at: new Date().toISOString(), verified_token_hash: hashResetSessionToken(sessionToken), updated_at: new Date().toISOString() })
    .eq("user_id", data.user.id)
    .is("verified_at", null);
  if (verifyError) redirect(resetUrl(email, "invalid-otp"));

  (await cookies()).set("crm_password_reset", sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });

  redirect(`${resetUrl(email)}&verified=1`);
}

export async function resetPassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!validPassword(password)) redirect("/reset-password?error=weak-password");
  if (password !== confirmPassword) redirect("/reset-password?error=password-mismatch");

  const cookieStore = await cookies();
  const resetToken = cookieStore.get("crm_password_reset")?.value;
  if (!resetToken) redirect("/forgot-password?error=recovery-link-invalid");

  const admin = createAdminClient();
  const { data: resetCode, error: resetCodeError } = await admin
    .from("crm_password_reset_codes")
    .select("user_id, email, expires_at, verified_token_hash")
    .eq("verified_token_hash", hashResetSessionToken(resetToken))
    .maybeSingle();
  if (resetCodeError || !resetCode?.verified_token_hash || new Date(resetCode.expires_at).getTime() <= Date.now() || !hashesMatch(resetCode.verified_token_hash, hashResetSessionToken(resetToken)))
    redirect("/forgot-password?error=recovery-link-invalid");

  // Supabase stores password hashes, so a safe password login check is the
  // only way to reject reusing the current password.
  const passwordCheck = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } },
  );
  const { error: currentPasswordError } = await passwordCheck.auth.signInWithPassword({
    email: resetCode.email,
    password,
  });
  if (!currentPasswordError) redirect("/reset-password?error=same-password");

  const { data: userResult, error: userError } = await admin.auth.admin.getUserById(resetCode.user_id);
  if (userError || !userResult.user) redirect("/forgot-password?error=recovery-link-invalid");
  const { error } = await admin.auth.admin.updateUserById(resetCode.user_id, { password });
  if (error) redirect("/reset-password?error=update-failed");

  await admin.auth.admin.updateUserById(resetCode.user_id, {
    app_metadata: { ...userResult.user.app_metadata, must_change_password: false },
  });
  await admin.from("crm_password_reset_codes").delete().eq("user_id", resetCode.user_id);
  cookieStore.delete("crm_password_reset");

  redirect("/login?password-reset=1");
}
