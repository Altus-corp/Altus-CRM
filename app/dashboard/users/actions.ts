"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/lib/auth";
import { sendAccountCredentials } from "@/app/lib/email";
import { APP_ROLES, type AppRole } from "@/app/lib/roles";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { indiaToday } from "@/app/lib/lead-event-schedule";

export type CreateUserState = {
  error?: string;
  success?: string;
};

export type UserDeletionPreview = {
  userId: string;
  name: string;
  allAssignments: number;
  activeAssignments: number;
  leadMaster: number;
  focusedLeads: number;
  ambassadors: number;
  directlyOwnedLeads: number;
  teamsManaged: number;
  seniorAmbassadorLinks: number;
};

export type UserLeadExport = {
  rows: Array<{
    leadNumber: string;
    fullName: string;
    email: string;
    phone: string;
    product: string;
    stage: string;
    resolution: string;
    assignedAt: string;
    focusedOn: string;
    status: string;
  }>;
  isTruncated: boolean;
};

export type DeleteUserState = {
  error?: string;
  success?: string;
};

const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CRM_SALES_ROLES: AppRole[] = ["sales_executive", "sales_manager", "consultant"];
const UNASSIGNED_POOL_VALUE = "__unassigned_pool__";

function isValidUserId(value: string) {
  return USER_ID_PATTERN.test(value);
}

function firstRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

async function loadDeletionPreview(userId: string): Promise<UserDeletionPreview> {
  const admin = createAdminClient();
  const { data: target, error: targetError } = await admin.auth.admin.getUserById(userId);
  if (targetError || !target.user) throw new Error("This user could not be found.");

  const [{ data: profile }, allAssignments, activeAssignments, leadMaster, focusedLeads, ambassadors, directlyOwnedLeads, teamsManaged, seniorAmbassadorLinks] = await Promise.all([
    admin.from("profiles").select("first_name, last_name, full_name").eq("id", userId).maybeSingle(),
    admin.from("lead_product_assignments").select("id", { count: "exact", head: true }).eq("assigned_to", userId),
    admin.from("lead_product_assignments").select("id", { count: "exact", head: true }).eq("assigned_to", userId).eq("is_active", true),
    admin.from("lead_product_assignments").select("id", { count: "exact", head: true }).eq("assigned_to", userId).eq("is_active", true).eq("is_closed", false).eq("is_ambassador", false),
    admin.from("lead_product_assignments").select("id", { count: "exact", head: true }).eq("assigned_to", userId).eq("is_active", true).eq("is_closed", false).eq("is_ambassador", false).eq("focused_on", indiaToday()),
    admin.from("lead_product_assignments").select("id", { count: "exact", head: true }).eq("assigned_to", userId).eq("is_active", true).eq("is_ambassador", true),
    admin.from("leads").select("id", { count: "exact", head: true }).eq("assigned_to", userId),
    admin.from("crm_teams").select("id", { count: "exact", head: true }).eq("manager_id", userId),
    admin.from("ambassador_hierarchy").select("junior_ambassador_id", { count: "exact", head: true }).eq("senior_ambassador_id", userId),
  ]);

  const countResults = [allAssignments, activeAssignments, leadMaster, focusedLeads, ambassadors, directlyOwnedLeads, teamsManaged, seniorAmbassadorLinks];
  if (countResults.some((result) => result.error)) throw new Error("Unable to load this user’s CRM impact.");

  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.full_name || target.user.email || "this user";
  return {
    userId,
    name,
    allAssignments: allAssignments.count ?? 0,
    activeAssignments: activeAssignments.count ?? 0,
    leadMaster: leadMaster.count ?? 0,
    focusedLeads: focusedLeads.count ?? 0,
    ambassadors: ambassadors.count ?? 0,
    directlyOwnedLeads: directlyOwnedLeads.count ?? 0,
    teamsManaged: teamsManaged.count ?? 0,
    seniorAmbassadorLinks: seniorAmbassadorLinks.count ?? 0,
  };
}

export async function getUserDeletionPreview(userId: string) {
  await requireAdmin();
  if (!isValidUserId(userId)) throw new Error("Invalid user.");
  return loadDeletionPreview(userId);
}

export async function exportUserLeadAssignments(userId: string): Promise<UserLeadExport> {
  await requireAdmin();
  if (!isValidUserId(userId)) throw new Error("Invalid user.");

  const admin = createAdminClient();
  const { data, error, count } = await admin
    .from("lead_product_assignments")
    .select("id, is_active, is_closed, assigned_at, focused_on, lead:leads(lead_number, first_name, last_name, email, phone), product:lead_products(code, name), stage:lead_stages(name), resolution:lead_resolutions(name)", { count: "exact" })
    .eq("assigned_to", userId)
    .order("assigned_at", { ascending: false, nullsFirst: false })
    .range(0, 4999);
  if (error) throw new Error("Unable to export this user’s lead data.");

  const rows = (data ?? []).map((assignment) => {
    const lead = firstRelation(assignment.lead) as { lead_number?: string | null; first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null } | null;
    const product = firstRelation(assignment.product) as { code?: string | null; name?: string | null } | null;
    const stage = firstRelation(assignment.stage) as { name?: string | null } | null;
    const resolution = firstRelation(assignment.resolution) as { name?: string | null } | null;
    return {
      leadNumber: lead?.lead_number ?? "",
      fullName: [lead?.first_name, lead?.last_name].filter(Boolean).join(" "),
      email: lead?.email ?? "",
      phone: lead?.phone ?? "",
      product: product?.code || product?.name || "",
      stage: stage?.name ?? "",
      resolution: resolution?.name ?? "",
      assignedAt: assignment.assigned_at ?? "",
      focusedOn: assignment.focused_on ?? "",
      status: assignment.is_active ? (assignment.is_closed ? "Closed" : "Active") : "Inactive",
    };
  });

  return { rows, isTruncated: (count ?? rows.length) > rows.length };
}

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

export async function deleteUserAccount(
  _previousState: DeleteUserState,
  formData: FormData,
): Promise<DeleteUserState> {
  const currentUser = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const transferToUserId = String(formData.get("transferToUserId") ?? "").trim();
  const returnToUnassignedPool = transferToUserId === UNASSIGNED_POOL_VALUE;

  if (!isValidUserId(userId)) return { error: "Invalid user." };
  if (userId === currentUser.userId) return { error: "You cannot delete your own account." };
  if (transferToUserId && !returnToUnassignedPool && (!isValidUserId(transferToUserId) || transferToUserId === userId)) {
    return { error: "Choose a different active CRM user to receive the leads." };
  }

  const admin = createAdminClient();
  const [{ data: target, error: targetError }, { data: targetRoles, error: targetRolesError }, preview] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from("user_roles").select("role").eq("user_id", userId),
    loadDeletionPreview(userId),
  ]);
  if (targetError || !target.user || targetRolesError) return { error: "This user could not be found." };

  if (preview.teamsManaged) {
    return { error: "Move or remove the sales team managed by this user before deleting the account." };
  }
  if (preview.seniorAmbassadorLinks) {
    return { error: "Reassign this user’s Junior Ambassadors before deleting the account." };
  }

  const { count: pendingSeniorSelections, error: seniorSelectionError } = await admin
    .from("lead_senior_ambassadors")
    .select("lead_id", { count: "exact", head: true })
    .eq("senior_ambassador_id", userId);
  if (seniorSelectionError) return { error: "Unable to verify Senior Ambassador links." };
  if (pendingSeniorSelections) {
    return { error: "Reassign this user’s selected Senior Ambassador leads before deleting the account." };
  }

  const { count: assignedWork, error: assignedWorkError } = await admin
    .from("lead_product_assignments")
    .select("id", { count: "exact", head: true })
    .eq("assigned_to", userId);
  const { count: relationshipManagerCount, error: relationshipManagerError } = await admin
    .from("ambassador_relationship_managers")
    .select("ambassador_id", { count: "exact", head: true })
    .eq("crm_user_id", userId);
  if (assignedWorkError || relationshipManagerError) return { error: "Unable to verify the user’s assigned CRM work." };

  const needsTransfer = Boolean(assignedWork || preview.directlyOwnedLeads || relationshipManagerCount);
  if (needsTransfer && !transferToUserId) {
    return { error: "Choose a CRM user or return the work to the unassigned pool before deletion." };
  }

  let replacementName = "";
  if (returnToUnassignedPool) {
    const [assignmentsUpdate, leadsUpdate, managerDelete] = await Promise.all([
      admin
        .from("lead_product_assignments")
        .update({ assigned_to: null, assigned_at: null, focused_on: null, assignment_origin: "manual" })
        .eq("assigned_to", userId),
      admin
        .from("leads")
        .update({ assigned_to: null, assigned_at: null, updated_at: new Date().toISOString() })
        .eq("assigned_to", userId),
      admin
        .from("ambassador_relationship_managers")
        .delete()
        .eq("crm_user_id", userId),
    ]);
    if (assignmentsUpdate.error || leadsUpdate.error || managerDelete.error) {
      return { error: "The work could not be returned to the unassigned pool. The user has not been deleted." };
    }
    replacementName = "the unassigned pool";
  } else if (transferToUserId) {
    const [{ data: replacement, error: replacementError }, { data: replacementRoles, error: replacementRolesError }] = await Promise.all([
      admin.from("profiles").select("id, first_name, last_name, full_name, is_suspended").eq("id", transferToUserId).maybeSingle(),
      admin.from("user_roles").select("role").eq("user_id", transferToUserId).in("role", CRM_SALES_ROLES),
    ]);
    if (replacementError || !replacement || replacement.is_suspended || replacementRolesError || !replacementRoles?.length) {
      return { error: "Choose an active Sales Executive, Sales Manager, or Consultant." };
    }
    replacementName = [replacement.first_name, replacement.last_name].filter(Boolean).join(" ") || replacement.full_name || "the selected CRM user";

    const reassignedAt = new Date().toISOString();
    const [assignmentsUpdate, leadsUpdate, managerUpdate] = await Promise.all([
      admin.from("lead_product_assignments").update({ assigned_to: transferToUserId, assigned_at: reassignedAt, assignment_origin: "manual" }).eq("assigned_to", userId),
      admin.from("leads").update({ assigned_to: transferToUserId, assigned_at: reassignedAt, updated_at: reassignedAt }).eq("assigned_to", userId),
      admin.from("ambassador_relationship_managers").update({ crm_user_id: transferToUserId, updated_at: reassignedAt }).eq("crm_user_id", userId),
    ]);
    if (assignmentsUpdate.error || leadsUpdate.error || managerUpdate.error) {
      return { error: "Leads could not be transferred. The user has not been deleted." };
    }
  }

  if ((targetRoles ?? []).some((role) => role.role === "admin")) {
    const { count: adminCount, error: adminCountError } = await admin
      .from("user_roles")
      .select("user_id", { count: "exact", head: true })
      .eq("role", "admin");
    if (adminCountError) return { error: "Unable to verify Admin accounts." };
    if ((adminCount ?? 0) <= 1) return { error: "You cannot delete the last Admin account." };
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    return { error: "The lead transfer completed, but this account could not be deleted. Check remaining team or meeting records and try again." };
  }

  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/users");
  revalidatePath("/dashboard/leads");
  revalidatePath("/dashboard/my-ambassador");
  return { success: `${preview.name} was deleted${replacementName ? ` after their CRM work was moved to ${replacementName}` : ""}.` };
}
