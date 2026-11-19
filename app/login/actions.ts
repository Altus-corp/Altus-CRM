"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/app/lib/supabase/server";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { distanceMeters } from "@/app/lib/geo-fence";

export async function login(formData: FormData) {
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (!email || !password) {
        redirect("/login?error=missing-fields");
    }

    const supabase = await createClient();

    const {
        data: { user },
        error,
    } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error || !user) {
        redirect("/login?error=invalid-credentials");
    }

    const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

    if (!roles?.length) {
        await supabase.auth.signOut();
        redirect("/login?error=not-authorized");
    }

    // A geofenced user can only sign in from within their admin-configured
    // radius. Users with no row here, or an inactive one, are unrestricted.
    const admin = createAdminClient();
    const { data: fence } = await admin
        .from("geo_fence_assignments")
        .select("center_lat, center_lng, radius_meters")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
    if (fence) {
        const lat = Number(formData.get("lat"));
        const lng = Number(formData.get("lng"));
        const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
        if (!hasCoords) {
            await supabase.auth.signOut();
            redirect("/login?error=geo-required");
        }
        const distance = distanceMeters(lat, lng, fence.center_lat, fence.center_lng);
        if (distance > fence.radius_meters) {
            await supabase.auth.signOut();
            redirect("/login?error=geo-outside");
        }
    }

    if (user.app_metadata.must_change_password) {
        redirect("/change-password");
    }

    redirect("/dashboard");
}
