"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/lib/auth";
import { createClient } from "@/app/lib/supabase/server";

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function refresh() {
  revalidatePath("/dashboard/lead-settings");
  revalidatePath("/dashboard/leads");
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

export async function createLeadProduct(formData: FormData) {
  await requireAdmin();
  const code = slugify(String(formData.get("code") ?? "")).toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  if (!code || !name) throw new Error("Product code and name are required.");
  const supabase = await createClient();
  const { error } = await supabase.from("lead_products").insert({ code, name });
  if (error) throw new Error(error.message);
  refresh();
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
