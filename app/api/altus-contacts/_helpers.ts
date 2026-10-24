import { requireUser } from "@/app/lib/auth";
import { createClient } from "@/app/lib/supabase/server";
import { AltusContactsError } from "@/app/lib/altus-contacts";

export async function requireAltusContactsIdentity() {
  const { userId } = await requireUser();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email?.trim().toLowerCase();
  if (!email) throw new AltusContactsError("Your CRM account does not have an email address.", 422);
  return { userId, email, supabase };
}

export function apiNumber(value: unknown) {
  const number = typeof value === "string" ? value.trim() : "";
  if (!/^\+?[0-9()\-\s]{7,24}$/.test(number)) throw new AltusContactsError("Enter a valid phone number.", 400);
  return number;
}
