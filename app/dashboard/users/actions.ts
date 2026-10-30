"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/lib/auth";
import { sendAccountCredentials } from "@/app/lib/email";
import { APP_ROLES, type AppRole } from "@/app/lib/roles";
import { createAdminClient } from "@/app/lib/supabase/admin";

export type CreateUserState = {
  error?: string;
  success?: string;
};

function generatePassword() {
  return `Altus!${randomBytes(9).toString("base64url")}`;
}

function isValidPassword(password: string) {
  return (
    password.length >= 12 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

export async function createUser(
  _previousState: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  await requireAdmin();

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const selectedRoles = formData.getAll("roles").map(String);
  const passwordMode = String(formData.get("passwordMode") ?? "manual");
  const manualPassword = String(formData.get("password") ?? "");

  if (!firstName || !lastName || !email || !phone) {
    return { error: "Complete all required fields." };
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return { error: "Enter a valid email address." };
  }

  if (!/^[+\d][\d\s()-]{6,19}$/.test(phone)) {
    return { error: "Enter a valid phone number with country code." };
  }

  if (!selectedRoles.length || selectedRoles.some((role) => !APP_ROLES.includes(role as AppRole))) {
    return { error: "Choose at least one valid role." };
  }

  const password = passwordMode === "generated" ? generatePassword() : manualPassword;

  if (!isValidPassword(password)) {
    return {
      error:
        "Use at least 12 characters, including uppercase, lowercase, a number, and a symbol.",
    };
  }

  const admin = createAdminClient();
  const fullName = `${firstName} ${lastName}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: {
      must_change_password: true,
    },
    user_metadata: {
      first_name: firstName,
      last_name: lastName,
      full_name: fullName,
      phone,
    },
  });

  if (error || !data.user) {
    return { error: error?.message ?? "Unable to create this user." };
  }

  const { error: profileError } = await admin
    .from("profiles")
    .upsert(
      {
        id: data.user.id,
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
        phone,
      },
      { onConflict: "id" },
    );

  const { error: roleError } = await admin.from("user_roles").insert(
    selectedRoles.map((role) => ({
      user_id: data.user.id,
      role: role as AppRole,
    })),
  );

  if (profileError || roleError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: "User creation could not be completed. Please try again." };
  }

  try {
    await sendAccountCredentials({ email, password, fullName });
  } catch {
    await admin.auth.admin.deleteUser(data.user.id);
    return {
      error:
        "The user was not created because the account email could not be sent. Check the SMTP configuration.",
    };
  }

  revalidatePath("/dashboard/users");

  return {
    success: `${fullName} has been added and their temporary login details were emailed.`,
  };
}

export async function updateUserRoles(
  _previousState: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  const currentUser = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const roles = [...new Set(formData.getAll("roles").map(String))];

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return { error: "Invalid user." };
  }
  if (!roles.length || roles.some((role) => !APP_ROLES.includes(role as AppRole))) {
    return { error: "Choose at least one valid role." };
  }
  if (userId === currentUser.userId && !roles.includes("admin")) {
    return { error: "You cannot remove your own Admin role." };
  }

  const admin = createAdminClient();
  const { data: target, error: userError } = await admin.auth.admin.getUserById(userId);
  if (userError || !target.user) return { error: "This user could not be found." };

  const { data: existing, error: readError } = await admin
    .from("user_roles").select("role").eq("user_id", userId);
  if (readError) return { error: "Unable to load this user's roles. Please try again." };

  // Add new access before removing old access so a failed insert preserves existing roles.
  const additions = roles.filter((role) => !existing?.some((item) => item.role === role));
  if (additions.length) {
    const { error } = await admin.from("user_roles").insert(
      additions.map((role) => ({ user_id: userId, role: role as AppRole })),
    );
    if (error) return { error: "Unable to assign roles. Please try again." };
  }
  const removals = (existing ?? []).map((item) => item.role).filter((role) => !roles.includes(role));
  if (removals.length) {
    const { error } = await admin.from("user_roles").delete().eq("user_id", userId).in("role", removals);
    if (error) {
      revalidatePath("/dashboard", "layout");
      return { error: "New roles were assigned, but previous roles could not be removed. Please retry saving." };
    }
  }
  revalidatePath("/dashboard", "layout");
  return { success: "Roles updated successfully." };
}

export async function toggleUserSuspension(formData: FormData) {
  const currentUser = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const shouldSuspend = formData.get("suspend") === "true";

  if (!/^[0-9a-f-]{36}$/i.test(userId)) {
    throw new Error("Invalid user.");
  }

  if (userId === currentUser.userId) {
    throw new Error("You cannot suspend your own account.");
  }

  const admin = createAdminClient();
  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: shouldSuspend ? "876000h" : "none",
  });

  if (authError) {
    throw new Error("Unable to update this user.");
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({ is_suspended: shouldSuspend })
    .eq("id", userId);

  if (profileError) {
    await admin.auth.admin.updateUserById(userId, {
      ban_duration: shouldSuspend ? "none" : "876000h",
    });
    throw new Error("Unable to update this user.");
  }

  revalidatePath("/dashboard/users");
}
