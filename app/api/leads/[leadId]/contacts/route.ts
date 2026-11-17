import { requireUser } from "@/app/lib/auth";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { getSalesManagerTeamMemberIds } from "@/app/lib/sales-manager-team";

export async function GET(request: Request, context: { params: Promise<{ leadId: string }> }) {
  try {
    const user = await requireUser();
    const { leadId } = await context.params;
    const assignmentId = new URL(request.url).searchParams.get("assignmentId");
    if (!assignmentId) return Response.json({ ok: false, error: "Product assignment is required." }, { status: 400 });
    const admin = createAdminClient();
    const { data: assignment, error: assignmentError } = await admin
      .from("lead_product_assignments")
      .select("id, assigned_to")
      .eq("id", assignmentId)
      .eq("lead_id", leadId)
      .maybeSingle();
    if (assignmentError || !assignment) return Response.json({ ok: false, error: "This lead is not available." }, { status: 404 });
    let allowed = user.roles.includes("admin") || assignment.assigned_to === user.userId;
    if (!allowed && user.roles.includes("sales_manager")) {
      allowed = (await getSalesManagerTeamMemberIds(user.userId)).includes(assignment.assigned_to ?? "");
    }
    if (!allowed && user.roles.includes("ambassador")) {
      const { data: partner } = await admin.from("lead_channel_partners").select("lead_id").eq("lead_id", leadId).eq("ambassador_id", user.userId).maybeSingle();
      allowed = Boolean(partner);
    }
    if (!allowed) return Response.json({ ok: false, error: "You do not have access to this lead's contacts." }, { status: 403 });
    const [{ data, error }, { data: lead, error: leadError }, { data: fields }] = await Promise.all([
      admin.from("lead_contacts").select("id, first_name, last_name, email, phone, designation, department_function, contact_type, created_at").eq("lead_id", leadId).order("created_at", { ascending: true }),
      admin.from("leads").select("first_name, last_name, email, phone, custom_data, created_at").eq("id", leadId).single(),
      admin.from("lead_table_columns").select("field_key, label").eq("source", "custom").eq("field_type", "dropdown"),
    ]);
    if (error || leadError || !lead) return Response.json({ ok: false, error: "Contacts are not available. Run the latest database migration." }, { status: 400 });
    const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
    const customData = lead.custom_data && typeof lead.custom_data === "object" && !Array.isArray(lead.custom_data) ? lead.custom_data as Record<string, unknown> : {};
    const designationKey = (fields ?? []).find((field) => normalize(field.label) === "designation")?.field_key;
    const departmentKey = (fields ?? []).find((field) => normalize(field.label) === "departmentfunction")?.field_key;
    const primary = {
      id: `lead-${leadId}`,
      first_name: lead.first_name,
      last_name: lead.last_name,
      email: lead.email,
      phone: lead.phone,
      designation: designationKey ? String(customData[designationKey] ?? "") || null : null,
      department_function: departmentKey ? String(customData[departmentKey] ?? "") || null : null,
      contact_type: "primary",
      created_at: lead.created_at,
    };
    const contacts = [primary, ...(data ?? []).map((contact) => ({ ...contact, contact_type: "secondary" as const }))];
    return Response.json({ ok: true, contacts });
  } catch {
    return Response.json({ ok: false, error: "Unable to load lead contacts." }, { status: 401 });
  }
}
