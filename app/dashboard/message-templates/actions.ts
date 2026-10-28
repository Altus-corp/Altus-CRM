"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/app/lib/auth";
import { createAdminClient } from "@/app/lib/supabase/admin";

async function requireTemplateEditor() {
  const user = await requireUser();
  if (!user.roles.some((role) => role === "admin" || role === "sales_executive" || role === "sales_manager")) throw new Error("You do not have permission to manage templates.");
  return user;
}

export async function saveMessageTemplate(formData: FormData): Promise<{ ok: boolean; message: string }> {
  try {
    const user = await requireTemplateEditor();
    const id = String(formData.get("id") ?? "");
    const productId = String(formData.get("productId") ?? "");
    const stageId = String(formData.get("stageId") ?? "") || null;
    const channel = String(formData.get("channel") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    const subject = String(formData.get("subject") ?? "").trim();
    const body = String(formData.get("body") ?? "").trim();
    if (!productId || (channel !== "email" && channel !== "whatsapp")) return { ok: false, message: "Choose a product and channel." };
    if (!name || !body) return { ok: false, message: "A template needs a name and a message." };
    if (channel === "email" && !subject) return { ok: false, message: "An email template needs a subject." };
    if (name.length > 100 || subject.length > 200 || body.length > 10000) return { ok: false, message: "The name, subject or message is too long." };
    const supabase = createAdminClient();
    if (stageId) {
      const { data: stage } = await supabase.from("lead_stages").select("id").eq("id", stageId).eq("product_id", productId).maybeSingle();
      if (!stage) return { ok: false, message: "Choose a stage that belongs to this product." };
    }
    const values = { product_id: productId, stage_id: stageId, channel, name, subject: channel === "email" ? subject : null, body, updated_at: new Date().toISOString() };
    const { error } = id
      ? await supabase.from("lead_message_templates").update(values).eq("id", id)
      : await supabase.from("lead_message_templates").insert({ ...values, created_by: user.userId });
    if (error) return { ok: false, message: error.message };
    revalidatePath("/dashboard/message-templates");
    return { ok: true, message: id ? "Template updated." : "Template created." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "The template could not be saved." };
  }
}

export async function deleteMessageTemplate(formData: FormData): Promise<{ ok: boolean; message: string }> {
  try {
    const user = await requireTemplateEditor();
    const id = String(formData.get("id") ?? "");
    const supabase = createAdminClient();
    const { data: template } = await supabase.from("lead_message_templates").select("created_by").eq("id", id).maybeSingle();
    if (!template) return { ok: false, message: "This template no longer exists." };
    if (!user.roles.includes("admin") && template.created_by !== user.userId) return { ok: false, message: "Only the creator or an admin can delete this template." };
    const { error } = await supabase.from("lead_message_templates").delete().eq("id", id);
    if (error) return { ok: false, message: error.message };
    revalidatePath("/dashboard/message-templates");
    return { ok: true, message: "Template deleted." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "The template could not be deleted." };
  }
}
