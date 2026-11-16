"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/lib/auth";
import { createAdminClient } from "@/app/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DND_RESOLUTIONS = ["DND", "Not Interested", "Lost", "I will get Back", "I Will Get Back", "Wrong Number", "Junk Lead", "Abandoned"];

export async function setDndArchiveStatus(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const { userId } = await requireAdmin();
  const assignmentIds = [...new Set(formData.getAll("assignmentId").map(String))];
  const archiveValue = formData.get("archive");
  if (!assignmentIds.length || assignmentIds.length > 100 || assignmentIds.some((id) => !UUID.test(id))) {
    return { ok: false, message: "Select between 1 and 100 lead work records." };
  }
  if (archiveValue !== "true" && archiveValue !== "false") return { ok: false, message: "Choose Archive or Restore." };
  const archive = archiveValue === "true";
  const admin = createAdminClient();
  const { data: resolutions, error: resolutionsError } = await admin.from("lead_resolutions").select("id").in("name", DND_RESOLUTIONS);
  if (resolutionsError) return { ok: false, message: "Unable to load Do Not Call statuses." };
  if (!resolutions?.length) return { ok: false, message: "No Do Not Call statuses are configured." };

  // Read every matching history entry before writing, including entries beyond
  // Supabase's default row limit. Archive only DND history, never product work.
  const records: { id: string; metadata: Record<string, unknown> }[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    let query = admin.from("lead_activities").select("id, metadata")
      .eq("activity_type", "resolution_updated")
      .in("lead_product_assignment_id", assignmentIds)
      .in("metadata->>resolution_id", resolutions.map((resolution) => resolution.id));
    query = archive ? query.is("metadata->>dnd_archived_at", null) : query.not("metadata->>dnd_archived_at", "is", null);
    const { data, error } = await query.order("id").range(offset, offset + pageSize - 1);
    if (error) return { ok: false, message: "Unable to load the selected Do Not Call records." };
    records.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  if (!records.length) return { ok: false, message: "The selected Do Not Call records are no longer available in this view. Refresh and retry." };

  const archivedAt = new Date().toISOString();
  let completed = 0;
  for (let offset = 0; offset < records.length; offset += 25) {
    const results = await Promise.allSettled(records.slice(offset, offset + 25).map(async (record) => {
      const metadata = { ...record.metadata };
      if (archive) {
        metadata.dnd_archived_at = archivedAt;
        metadata.dnd_archived_by = userId;
      } else {
        delete metadata.dnd_archived_at;
        delete metadata.dnd_archived_by;
      }
      // Do not overwrite metadata changed by another request after the read.
      const { data, error } = await admin.from("lead_activities").update({ metadata })
        .eq("id", record.id).eq("metadata", JSON.stringify(record.metadata)).select("id");
      return !error && data?.length === 1;
    }));
    completed += results.filter((result) => result.status === "fulfilled" && result.value).length;
  }
  revalidatePath("/dashboard/dnd-master");
  revalidatePath("/dashboard/team-dnd-master");
  const verb = archive ? "archived" : "restored";
  if (completed !== records.length) return { ok: false, message: `${completed} Do Not Call history records ${verb}. Some records changed or could not be saved. Refresh and retry the remaining records.` };
  return { ok: true, message: `Selected Do Not Call records ${verb}. Lead data and history have been kept.` };
}
