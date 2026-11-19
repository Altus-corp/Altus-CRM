"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/lib/auth";
import { createAdminClient } from "@/app/lib/supabase/admin";

export type GeoFenceAssignment = {
  id: string;
  user_id: string;
  label: string | null;
  center_lat: number;
  center_lng: number;
  radius_meters: number;
  is_active: boolean;
};

export async function listGeoFences(): Promise<GeoFenceAssignment[]> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("geo_fence_assignments")
    .select("id, user_id, label, center_lat, center_lng, radius_meters, is_active")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function saveGeoFence(formData: FormData): Promise<{ ok: boolean; message: string }> {
  try {
    const user = await requireAdmin();
    const userId = String(formData.get("userId") ?? "").trim();
    const label = String(formData.get("label") ?? "").trim().slice(0, 120);
    const lat = Number(formData.get("lat"));
    const lng = Number(formData.get("lng"));
    const radius = Number(formData.get("radiusMeters"));
    if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("Choose a CRM user.");
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error("Enter a valid latitude between -90 and 90.");
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error("Enter a valid longitude between -180 and 180.");
    if (!Number.isInteger(radius) || radius < 10 || radius > 50_000) throw new Error("Enter a radius between 10 and 50,000 meters.");

    const admin = createAdminClient();
    const { error } = await admin.from("geo_fence_assignments").upsert({
      user_id: userId,
      label: label || null,
      center_lat: lat,
      center_lng: lng,
      radius_meters: radius,
      is_active: true,
      created_by: user.userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);

    revalidatePath("/dashboard/geo-settings");
    return { ok: true, message: "Geofence saved." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Unable to save the geofence." };
  }
}

export async function toggleGeoFence(formData: FormData): Promise<{ ok: boolean; message: string }> {
  try {
    await requireAdmin();
    const id = String(formData.get("id") ?? "");
    const isActive = formData.get("isActive") === "true";
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid geofence.");
    const admin = createAdminClient();
    const { error } = await admin.from("geo_fence_assignments").update({ is_active: isActive, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(error.message);
    revalidatePath("/dashboard/geo-settings");
    return { ok: true, message: isActive ? "Geofence enabled." : "Geofence disabled." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Unable to update the geofence." };
  }
}

export async function deleteGeoFence(formData: FormData): Promise<{ ok: boolean; message: string }> {
  try {
    await requireAdmin();
    const id = String(formData.get("id") ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid geofence.");
    const admin = createAdminClient();
    const { error } = await admin.from("geo_fence_assignments").delete().eq("id", id);
    if (error) throw new Error(error.message);
    revalidatePath("/dashboard/geo-settings");
    return { ok: true, message: "Geofence removed." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Unable to remove the geofence." };
  }
}
