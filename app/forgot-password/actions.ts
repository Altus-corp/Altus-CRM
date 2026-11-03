"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { sendPasswordResetOtp } from "@/app/lib/email";

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email) redirect("/forgot-password?error=missing-email");

  try {
    const admin = createAdminClient();
    // Supabase generates the short-lived OTP only. Delivery is exclusively
    // through the CRM SMTP settings in .env.
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
    });

    if (!error && data?.properties.email_otp) {
      await sendPasswordResetOtp({
        email,
        fullName: data.user.user_metadata?.full_name ?? null,
        otp: data.properties.email_otp,
      });
    }
  } catch {
    // Keep the response identical for unknown accounts and mail failures so
    // this public form cannot be used to discover CRM email addresses.
  }

  // Deliberately do not disclose whether this email belongs to a CRM account.
  redirect(`/reset-password?email=${encodeURIComponent(email)}&sent=1`);
}
