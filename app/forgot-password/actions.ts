"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { sendPasswordResetEmail } from "@/app/lib/email";

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email) redirect("/forgot-password?error=missing-email");

  const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
  if (!appUrl) redirect("/forgot-password?error=request-failed");

  try {
    const admin = createAdminClient();
    // This generates Supabase's single-use recovery token but does not send an
    // email. Delivery is exclusively through the CRM SMTP settings in .env.
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${appUrl}/auth/callback?next=/reset-password` },
    });

    if (!error && data?.properties.action_link) {
      await sendPasswordResetEmail({
        email,
        fullName: data.user.user_metadata?.full_name ?? null,
        resetUrl: data.properties.action_link,
      });
    }
  } catch {
    // Keep the response identical for unknown accounts and mail failures so
    // this public form cannot be used to discover CRM email addresses.
  }

  // Deliberately do not disclose whether this email belongs to a CRM account.
  redirect("/forgot-password?sent=1");
}
