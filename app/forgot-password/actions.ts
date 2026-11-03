"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { sendPasswordResetOtp } from "@/app/lib/email";
import { createSixDigitResetCode, hashResetCode } from "@/app/lib/password-reset-code";

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email) redirect("/forgot-password?error=missing-email");

  try {
    const admin = createAdminClient();
    // generateLink gives us the account safely without emailing a Supabase
    // recovery link. Delivery uses our SMTP six-digit code only.
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
    });

    if (!error && data?.user) {
      const otp = createSixDigitResetCode();
      const { error: codeError } = await admin.from("crm_password_reset_codes").upsert({
        user_id: data.user.id,
        email,
        code_hash: hashResetCode(email, otp),
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        attempt_count: 0,
        verified_at: null,
        verified_token_hash: null,
        updated_at: new Date().toISOString(),
      });
      if (codeError) throw new Error(codeError.message);
      await sendPasswordResetOtp({
        email,
        fullName: data.user.user_metadata?.full_name ?? null,
        otp,
      });
    }
  } catch {
    // Keep the response identical for unknown accounts and mail failures so
    // this public form cannot be used to discover CRM email addresses.
  }

  // Deliberately do not disclose whether this email belongs to a CRM account.
  redirect(`/reset-password?email=${encodeURIComponent(email)}&sent=1`);
}
