"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireAdmin } from "@/app/lib/auth";
import { createClient } from "@/app/lib/supabase/server";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { attendanceAvailability, attendanceForEmail, getWmsAttendance } from "@/app/lib/wms-attendance";

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function refresh() {
  updateTag("lead-shared-config");
  revalidatePath("/dashboard/lead-settings");
  revalidatePath("/dashboard/leads");
  revalidatePath("/dashboard/products", "layout");
}

export async function updateLeadDatabasePriority(formData: FormData) {
  await requireAdmin();
  const databaseKey = String(formData.get("databaseKey") ?? "");
  const priority = Number(formData.get("priority"));
  const allowedKeys = ["reference_leads", "qualified_leads", "leads", "database_leads"];
  if (!allowedKeys.includes(databaseKey) || !Number.isInteger(priority) || priority < 1 || priority > 4) throw new Error("Invalid lead database priority.");

  const supabase = await createClient();
  const { data: priorities, error: readError } = await supabase.from("lead_database_priorities").select("database_key, priority");
  if (readError || !priorities) throw new Error(readError?.message ?? "Lead database priorities are unavailable.");
  const current = priorities.find((item) => item.database_key === databaseKey);
  const swapped = priorities.find((item) => item.priority === priority);
  if (!current || current.priority === priority) return;

  const updates = [{ database_key: databaseKey, priority, updated_at: new Date().toISOString() }];
  if (swapped) updates.push({ database_key: swapped.database_key, priority: current.priority, updated_at: new Date().toISOString() });
  const results = await Promise.all(updates.map((item) => supabase.from("lead_database_priorities").update({ priority: item.priority, updated_at: item.updated_at }).eq("database_key", item.database_key)));
  const error = results.find((result) => result.error)?.error;
  if (error) throw new Error(error.message);
  refresh();
}

export async function updateRoundRobinWeeklyTargets(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const targets = Array.from({ length: 7 }, (_, index) => Number(formData.get(`day${index + 1}`)));
  if (!userId || !productId || targets.some((target) => !Number.isInteger(target) || target < 0 || target > 100000)) throw new Error("Each daily lead target must be a whole number from 0 to 100000.");

  const supabase = await createClient();
  const [{ data: roles, error: rolesError }, { data: profile, error: profileError }, { data: product, error: productError }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId).in("role", ["sales_executive", "sales_manager", "consultant"]),
    supabase.from("profiles").select("id, is_suspended").eq("id", userId).single(),
    supabase.from("lead_products").select("id").eq("id", productId).eq("is_active", true).single(),
  ]);
  if (rolesError || !roles?.length || profileError || !profile || profile.is_suspended) throw new Error("This user is unavailable for lead round-robin assignment.");
  if (productError || !product) throw new Error("This lead product is unavailable.");

  const { error } = await supabase.from("lead_round_robin_weekly_targets").upsert(targets.map((target, index) => ({ user_id: userId, product_id: productId, day_of_week: index + 1, target_count: target, updated_at: new Date().toISOString() })), { onConflict: "user_id,product_id,day_of_week" });
  if (error) throw new Error(error.message);
  refresh();
}

function indiaToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const weekDay = get("weekday").toLowerCase();
  const dayOfWeek = ({ mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 } as Record<string, number>)[weekDay];
  return { date: `${get("year")}-${get("month")}-${get("day")}`, dayOfWeek };
}

const releasedResolutionNames = new Set(["dnd", "not interested"]);

function relatedName(value: unknown) {
  const related = Array.isArray(value) ? value[0] : value;
  return related && typeof related === "object" && "name" in related && typeof related.name === "string" ? related.name : "";
}

export async function runRoundRobinForToday(): Promise<{ ok: boolean; message: string; focused: number; newlyAssigned: number; skippedUsers: { name: string; reason: string }[] }> {
  try {
    const { userId } = await requireAdmin();
    const { date: today, dayOfWeek } = indiaToday();
    const supabase = createAdminClient();
    const [{ data: targets, error: targetsError }, { data: priorities, error: prioritiesError }] = await Promise.all([
      supabase.from("lead_round_robin_weekly_targets").select("user_id, product_id, target_count").eq("day_of_week", dayOfWeek).gt("target_count", 0),
      supabase.from("lead_database_priorities").select("database_key, priority").order("priority"),
    ]);
    if (targetsError) throw new Error(targetsError.message);
    if (prioritiesError) throw new Error(prioritiesError.message);
    if (!targets?.length) return { ok: true, message: "No round-robin targets are configured for today.", focused: 0, newlyAssigned: 0, skippedUsers: [] };

    const targetUserIds = [...new Set(targets.map((target) => target.user_id))];
    const [{ data: profiles, error: profilesError }, { data: roles, error: rolesError }, { data: authUsers, error: authUsersError }, attendance] = await Promise.all([
      supabase.from("profiles").select("id, first_name, last_name, full_name, is_suspended").in("id", targetUserIds),
      supabase.from("user_roles").select("user_id, role").in("user_id", targetUserIds).in("role", ["sales_executive", "sales_manager", "consultant"]),
      supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      getWmsAttendance(),
    ]);
    if (profilesError || rolesError || authUsersError) throw new Error(profilesError?.message ?? rolesError?.message ?? authUsersError?.message ?? "Unable to validate the round-robin team.");
    const userNames = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name || [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "a sales user"]));
    const userEmails = new Map((authUsers?.users ?? []).map((user) => [user.id, user.email?.trim().toLowerCase() ?? ""]));
    const skippedUsers = new Map<string, { name: string; reason: string }>();
    const eligibleUsers = new Set<string>();
    for (const profile of profiles ?? []) {
      const name = userNames.get(profile.id) ?? "a sales user";
      if (profile.is_suspended) { skippedUsers.set(profile.id, { name, reason: "CRM account is suspended" }); continue; }
      if (!(roles ?? []).some((role) => role.user_id === profile.id)) { skippedUsers.set(profile.id, { name, reason: "does not have an eligible CRM role" }); continue; }
      const email = userEmails.get(profile.id);
      if (!email) { skippedUsers.set(profile.id, { name, reason: "CRM email is missing" }); continue; }
      const availability = attendanceAvailability(attendanceForEmail(attendance, email), today);
      if (!availability.available) { skippedUsers.set(profile.id, { name, reason: availability.reason }); continue; }
      eligibleUsers.add(profile.id);
    }
    const priorityByDatabase = new Map((priorities ?? []).map((priority) => [priority.database_key, priority.priority]));
    let focused = 0;
    let newlyAssigned = 0;
    let skippedTargets = 0;

    for (const target of targets) {
      if (!eligibleUsers.has(target.user_id)) { skippedTargets += 1; continue; }
      const { data: owned, error: ownedError } = await supabase
        .from("lead_product_assignments")
        .select("id, lead_id, focused_on, assigned_to, created_at, resolution:lead_resolutions(name)")
        .eq("product_id", target.product_id)
        .eq("assigned_to", target.user_id)
        .eq("is_active", true)
        .eq("is_closed", false)
        .order("assigned_at", { ascending: true })
        .limit(100000);
      if (ownedError) throw new Error(ownedError.message);
      const selectableOwned = (owned ?? []).filter((assignment) => !releasedResolutionNames.has(relatedName(assignment.resolution).toLowerCase()));
      const focusedAlready = selectableOwned.filter((assignment) => assignment.focused_on === today);
      const needed = Math.max(0, target.target_count - focusedAlready.length);
      const fromMaster = selectableOwned.filter((assignment) => assignment.focused_on !== today).slice(0, needed);
      if (fromMaster.length) {
        const { error } = await supabase.from("lead_product_assignments").update({ focused_on: today }).in("id", fromMaster.map((assignment) => assignment.id));
        if (error) throw new Error(error.message);
        const { error: activityError } = await supabase.from("lead_activities").insert(fromMaster.map((assignment) => ({ lead_id: assignment.lead_id, lead_product_assignment_id: assignment.id, activity_type: "round_robin_focused", note: `Added to today's focused calling list for ${userNames.get(target.user_id)}.`, metadata: { focused_on: today, source: "owned_lead_master" }, created_by: userId })));
        if (activityError) throw new Error(activityError.message);
      }
      focused += fromMaster.length;
      const remaining = needed - fromMaster.length;
      if (!remaining) continue;

      const { data: unassigned, error: poolError } = await supabase
        .from("lead_product_assignments")
        .select("id, lead_id, created_at, resolution:lead_resolutions(name), lead:leads(lead_database)")
        .eq("product_id", target.product_id)
        .is("assigned_to", null)
        .eq("is_active", true)
        .eq("is_closed", false)
        .order("created_at", { ascending: true })
        .limit(100000);
      if (poolError) throw new Error(poolError.message);
      const fromPool = (unassigned ?? []).filter((assignment) => {
        if (releasedResolutionNames.has(relatedName(assignment.resolution).toLowerCase())) return false;
        const lead = (Array.isArray(assignment.lead) ? assignment.lead[0] : assignment.lead) as { lead_database?: string } | null;
        return Boolean(lead?.lead_database);
      }).sort((left, right) => {
        const leftLead = (Array.isArray(left.lead) ? left.lead[0] : left.lead) as { lead_database?: string } | null;
        const rightLead = (Array.isArray(right.lead) ? right.lead[0] : right.lead) as { lead_database?: string } | null;
        return (priorityByDatabase.get(leftLead?.lead_database ?? "") ?? Number.MAX_SAFE_INTEGER) - (priorityByDatabase.get(rightLead?.lead_database ?? "") ?? Number.MAX_SAFE_INTEGER)
          || new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
      }).slice(0, remaining);
      if (!fromPool.length) continue;
      const now = new Date().toISOString();
      for (const assignment of fromPool) {
        const { data: claimed, error: claimError } = await supabase.from("lead_product_assignments").update({ assigned_to: target.user_id, assigned_at: now, focused_on: today, assignment_origin: "round_robin" }).eq("id", assignment.id).is("assigned_to", null).select("id").maybeSingle();
        if (claimError) throw new Error(claimError.message);
        if (!claimed) continue;
        newlyAssigned += 1;
        focused += 1;
        const { error: activityError } = await supabase.from("lead_activities").insert({ lead_id: assignment.lead_id, lead_product_assignment_id: assignment.id, activity_type: "round_robin_assigned", note: `Round-robin assigned to ${userNames.get(target.user_id)} and added to today's focused list.`, metadata: { assigned_to: target.user_id, focused_on: today, source: "admin_unassigned_pool" }, created_by: userId });
        if (activityError) throw new Error(activityError.message);
      }
    }
    revalidatePath("/dashboard/leads");
    revalidatePath("/dashboard/lead-settings");
    const skipped = [...skippedUsers.values()];
    return { ok: true, message: `Round robin completed for ${today}.${skippedTargets ? ` ${skipped.length} user${skipped.length === 1 ? " was" : "s were"} skipped because they are unavailable.` : ""}`, focused, newlyAssigned, skippedUsers: skipped };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Unable to run round robin.", focused: 0, newlyAssigned: 0, skippedUsers: [] };
  }
}

export async function createLeadProduct(formData: FormData) {
  await requireAdmin();
  const code = slugify(String(formData.get("code") ?? "")).toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  if (!code || !name) throw new Error("Product code and name are required.");
  const supabase = await createClient();
  const { data: product, error } = await supabase.from("lead_products").insert({ code, name }).select("id, code, name").single();
  if (error || !product) throw new Error(error?.message ?? "Unable to create product.");
  refresh();
  return product;
}

export async function createLeadStage(formData: FormData) {
  await requireAdmin();
  const productId = String(formData.get("productId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!productId || !name) throw new Error("Stage name is required.");
  const supabase = await createClient();
  const { count } = await supabase.from("lead_stages").select("id", { count: "exact", head: true }).eq("product_id", productId);
  const { error } = await supabase.from("lead_stages").insert({ product_id: productId, name, position: (count ?? 0) + 1 });
  if (error) throw new Error(error.message);
  refresh();
}

export async function createLeadResolution(formData: FormData) {
  await requireAdmin();
  const productId = String(formData.get("productId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!productId || !name) throw new Error("Resolution name is required.");
  const supabase = await createClient();
  const { data: resolution, error: resolutionError } = await supabase
    .from("lead_resolutions")
    .upsert({ name }, { onConflict: "name" })
    .select("id")
    .single();
  if (resolutionError || !resolution) throw new Error(resolutionError?.message ?? "Unable to create resolution.");
  const { error } = await supabase.from("lead_product_resolutions").insert({ product_id: productId, resolution_id: resolution.id });
  if (error && error.code !== "23505") throw new Error(error.message);
  refresh();
}

export async function deleteLeadStage(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("stageId") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.from("lead_stages").delete().eq("id", id);
  if (error) throw new Error(error.message);
  refresh();
}

export async function updateLeadStage(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("stageId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) throw new Error("Stage name is required.");

  const supabase = await createClient();
  const { error } = await supabase.from("lead_stages").update({ name }).eq("id", id);
  if (error) throw new Error(error.message);
  refresh();
}

export async function updateLeadTableColumn(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("columnId") ?? "");
  const isVisible = formData.get("isVisible") === "true";
  if (!id) throw new Error("Lead table column is required.");

  const supabase = await createClient();
  const { error } = await supabase.from("lead_table_columns").update({ is_visible: isVisible }).eq("id", id);
  if (error) throw new Error(error.message);
  refresh();
}

export async function updateLeadTableColumnRequired(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("columnId") ?? "");
  const isRequired = formData.get("isRequired") === "true";
  if (!id) throw new Error("Lead table column is required.");

  const supabase = await createClient();
  const { error } = await supabase.from("lead_table_columns").update({ is_required: isRequired }).eq("id", id);
  if (error) throw new Error(error.message);
  refresh();
}

export async function editLeadTableColumn(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("columnId") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const fieldType = String(formData.get("fieldType") ?? "");
  const options = String(formData.get("options") ?? "").split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
  const isRequired = formData.get("isRequired") === "on";
  const allowedTypes = ["text", "number", "date", "dropdown", "checkbox", "textarea"];
  if (!id || !label || !allowedTypes.includes(fieldType)) throw new Error("A column name and valid field type are required.");
  if (fieldType === "dropdown" && !options.length) throw new Error("Add at least one dropdown option.");

  const supabase = await createClient();
  const { error } = await supabase.from("lead_table_columns").update({
    label,
    field_type: fieldType,
    options: fieldType === "dropdown" ? options : [],
    is_required: isRequired,
  }).eq("id", id);
  if (error) throw new Error(error.message);
  refresh();
}

export async function moveLeadTableColumn(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("columnId") ?? "");
  const direction = String(formData.get("direction") ?? "");
  if (!id || !["up", "down"].includes(direction)) throw new Error("Invalid column move.");

  const supabase = await createClient();
  const { data: current, error: currentError } = await supabase.from("lead_table_columns").select("id, position").eq("id", id).single();
  if (currentError || !current) throw new Error("Lead table column was not found.");
  const comparison = direction === "up" ? "lt" : "gt";
  const ascending = direction === "down";
  const query = supabase.from("lead_table_columns").select("id, position").order("position", { ascending }).limit(1);
  const { data: neighbor, error: neighborError } = comparison === "lt" ? await query.lt("position", current.position).maybeSingle() : await query.gt("position", current.position).maybeSingle();
  if (neighborError || !neighbor) return;

  const [{ error: currentUpdateError }, { error: neighborUpdateError }] = await Promise.all([
    supabase.from("lead_table_columns").update({ position: neighbor.position }).eq("id", current.id),
    supabase.from("lead_table_columns").update({ position: current.position }).eq("id", neighbor.id),
  ]);
  if (currentUpdateError || neighborUpdateError) throw new Error(currentUpdateError?.message ?? neighborUpdateError?.message ?? "Unable to move column.");
  refresh();
}

export async function reorderLeadTableColumns(formData: FormData) {
  await requireAdmin();
  const draggedId = String(formData.get("draggedId") ?? "");
  const targetId = String(formData.get("targetId") ?? "");
  if (!draggedId || !targetId || draggedId === targetId) return;

  const supabase = await createClient();
  const { data: columns, error } = await supabase.from("lead_table_columns").select("id").order("position");
  if (error || !columns) throw new Error(error?.message ?? "Unable to load lead table columns.");
  const draggedIndex = columns.findIndex((column) => column.id === draggedId);
  const targetIndex = columns.findIndex((column) => column.id === targetId);
  if (draggedIndex < 0 || targetIndex < 0) throw new Error("Lead table column was not found.");

  const nextColumns = [...columns];
  const [dragged] = nextColumns.splice(draggedIndex, 1);
  nextColumns.splice(draggedIndex < targetIndex ? targetIndex - 1 : targetIndex, 0, dragged);
  const updates = await Promise.all(nextColumns.map((column, index) => supabase.from("lead_table_columns").update({ position: index + 1 }).eq("id", column.id)));
  const updateError = updates.find((result) => result.error)?.error;
  if (updateError) throw new Error(updateError.message);
  refresh();
}

export async function deleteLeadTableColumn(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("columnId") ?? "");
  if (!id) throw new Error("Lead table column is required.");
  const supabase = await createClient();
  const { data: column, error: readError } = await supabase.from("lead_table_columns").select("source, is_required").eq("id", id).single();
  if (readError || !column) throw new Error("Lead table column was not found.");
  if (column.source !== "custom" || column.is_required) throw new Error("Only optional custom columns can be deleted.");
  const { error } = await supabase.from("lead_table_columns").delete().eq("id", id);
  if (error) throw new Error(error.message);
  refresh();
}

export async function createLeadTableColumn(formData: FormData) {
  await requireAdmin();
  const label = String(formData.get("label") ?? "").trim();
  const fieldType = String(formData.get("fieldType") ?? "");
  const options = String(formData.get("options") ?? "").split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
  const isRequired = formData.get("isRequired") === "on";
  const allowedTypes = ["text", "number", "date", "dropdown", "checkbox", "textarea"];
  if (!label || !allowedTypes.includes(fieldType)) throw new Error("A column name and valid field type are required.");
  if (fieldType === "dropdown" && !options.length) throw new Error("Add at least one dropdown option.");

  const supabase = await createClient();
  const { count } = await supabase.from("lead_table_columns").select("id", { count: "exact", head: true });
  const fieldKey = `${slugify(label)}_${crypto.randomUUID().slice(0, 6)}`;
  const { error } = await supabase.from("lead_table_columns").insert({
    field_key: fieldKey,
    label,
    source: "custom",
    field_type: fieldType,
    options: fieldType === "dropdown" ? options : [],
    is_required: isRequired,
    position: (count ?? 0) + 1,
  });
  if (error) throw new Error(error.message);
  refresh();
}

export async function createLeadFullNameColumn(formData: FormData) {
  await requireAdmin();
  const label = String(formData.get("label") ?? "Full Name").trim();
  if (!label) throw new Error("A column name is required.");

  const supabase = await createClient();
  const { count } = await supabase.from("lead_table_columns").select("id", { count: "exact", head: true });
  const { error } = await supabase.from("lead_table_columns").insert({
    field_key: `${slugify(label)}_${crypto.randomUUID().slice(0, 6)}`,
    label,
    source: "custom",
    field_type: "text",
    options: [],
    is_required: false,
    is_visible: true,
    computed_from: ["first_name", "last_name"],
    position: (count ?? 0) + 1,
  });
  if (error) throw new Error(error.message);
  refresh();
}

export async function deleteLeadProductResolution(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("productResolutionId") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.from("lead_product_resolutions").delete().eq("id", id);
  if (error) throw new Error(error.message);
  refresh();
}

export async function saveResolutionFlow(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("productResolutionId") ?? "");
  const nextStageId = String(formData.get("nextStageId") ?? "") || null;
  const followUpHours = String(formData.get("followUpHours") ?? "");
  const requiresFollowUp = formData.get("requiresFollowUp") === "on";
  const closesLead = formData.get("closesLead") === "on";
  const followUpAfterHours = followUpHours ? Number(followUpHours) : null;
  if (!id || (followUpAfterHours !== null && (!Number.isInteger(followUpAfterHours) || followUpAfterHours < 0))) throw new Error("Invalid flow rule.");
  const supabase = await createClient();
  const { error } = await supabase.from("lead_product_resolutions").update({ next_stage_id: nextStageId, requires_follow_up: requiresFollowUp, follow_up_after_hours: requiresFollowUp ? followUpAfterHours : null, closes_lead: closesLead }).eq("id", id);
  if (error) throw new Error(error.message);
  refresh();
}

export async function createLeadCustomField(formData: FormData) {
  await requireAdmin();
  const productId = String(formData.get("productId") ?? "") || null;
  const label = String(formData.get("label") ?? "").trim();
  const fieldType = String(formData.get("fieldType") ?? "");
  const options = String(formData.get("options") ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  const showWhenFieldId = String(formData.get("showWhenFieldId") ?? "") || null;
  const showWhenValue = String(formData.get("showWhenValue") ?? "") || null;
  const allowedTypes = ["text", "number", "date", "dropdown", "checkbox", "textarea"];
  if (!label || !allowedTypes.includes(fieldType)) throw new Error("A field label and valid field type are required.");
  if (fieldType === "dropdown" && !options.length) throw new Error("Dropdown fields need at least one option.");
  if ((showWhenFieldId && !showWhenValue) || (!showWhenFieldId && showWhenValue)) throw new Error("A field condition needs both a field and value.");
  const supabase = await createClient();
  const { count } = await supabase.from("lead_custom_fields").select("id", { count: "exact", head: true }).eq("product_id", productId ?? "00000000-0000-0000-0000-000000000000");
  const fieldKey = `${slugify(label)}_${crypto.randomUUID().slice(0, 6)}`;
  const { error } = await supabase.from("lead_custom_fields").insert({ product_id: productId, field_key: fieldKey, label, field_type: fieldType, options, show_when_field_id: showWhenFieldId, show_when_value: showWhenValue, position: (count ?? 0) + 1 });
  if (error) throw new Error(error.message);
  refresh();
}

export async function createStageDropdown(formData: FormData) {
  await requireAdmin();
  const stageId = String(formData.get("stageId") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  if (!stageId || !label) throw new Error("Choose a stage and enter a dropdown name.");
  if (label.length > 80) throw new Error("Dropdown names can be up to 80 characters.");
  const supabase = await createClient();
  const { data: stage, error: stageError } = await supabase.from("lead_stages").select("id, product_id").eq("id", stageId).single();
  if (stageError || !stage) throw new Error("This stage is no longer available.");
  const { count } = await supabase.from("lead_stage_dropdowns").select("id", { count: "exact", head: true }).eq("stage_id", stageId);
  const { error } = await supabase.from("lead_stage_dropdowns").insert({ product_id: stage.product_id, stage_id: stageId, label, position: (count ?? 0) + 1 });
  if (error) throw new Error(error.code === "23505" ? "This stage already has a dropdown with that name." : error.message);
  refresh();
}

export async function renameStageDropdown(formData: FormData) {
  await requireAdmin();
  const dropdownId = String(formData.get("dropdownId") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  if (!dropdownId || !label || label.length > 80) throw new Error("Enter a dropdown name of up to 80 characters.");
  const supabase = await createClient();
  const { error } = await supabase.from("lead_stage_dropdowns").update({ label }).eq("id", dropdownId);
  if (error) throw new Error(error.code === "23505" ? "This stage already has a dropdown with that name." : error.message);
  refresh();
}

export async function deleteStageDropdown(formData: FormData) {
  await requireAdmin();
  const dropdownId = String(formData.get("dropdownId") ?? "");
  if (!dropdownId) throw new Error("Choose a dropdown to delete.");
  const supabase = await createClient();
  const { error } = await supabase.from("lead_stage_dropdowns").delete().eq("id", dropdownId);
  if (error) throw new Error(error.message);
  refresh();
}

export async function createStageDropdownOption(formData: FormData) {
  await requireAdmin();
  const dropdownId = String(formData.get("dropdownId") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  if (!dropdownId || !label) throw new Error("Enter an option name.");
  if (label.length > 100) throw new Error("Options can be up to 100 characters.");
  const supabase = await createClient();
  const { count } = await supabase.from("lead_stage_dropdown_options").select("id", { count: "exact", head: true }).eq("dropdown_id", dropdownId);
  const { error } = await supabase.from("lead_stage_dropdown_options").insert({ dropdown_id: dropdownId, label, position: (count ?? 0) + 1 });
  if (error) throw new Error(error.code === "23505" ? "This dropdown already has that option." : error.message);
  refresh();
}

export async function deleteStageDropdownOption(formData: FormData) {
  await requireAdmin();
  const optionId = String(formData.get("optionId") ?? "");
  if (!optionId) throw new Error("Choose an option to remove.");
  const supabase = await createClient();
  const { error } = await supabase.from("lead_stage_dropdown_options").delete().eq("id", optionId);
  if (error) throw new Error(error.message);
  refresh();
}
