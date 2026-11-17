import { redirect } from "next/navigation";
import { cache } from "react";
import type { AppRole } from "@/app/lib/roles";
import { createClient } from "@/app/lib/supabase/server";

export const requireUser = cache(async () => {
    const supabase = await createClient();

    const { data } = await supabase.auth.getClaims();
    const userId = data?.claims.sub;

    if (!userId) {
        redirect("/login");
    }

    // getUser() (session revocation check), the profile row, and the role
    // list each depend only on userId above, not on each other, so they run
    // as one round trip instead of three sequential ones. This runs on every
    // dashboard page load, so the latency here is felt everywhere.
    const [
        {
            data: { user },
        },
        { data: profile, error: profileError },
        { data: roles, error },
    ] = await Promise.all([
        supabase.auth.getUser(),
        supabase
            .from("profiles")
            .select("is_suspended, first_name, last_name, full_name")
            .eq("id", userId)
            .single(),
        supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", userId),
    ]);

    if (!user) {
        redirect("/login");
    }

    if (user.app_metadata.must_change_password) {
        redirect("/change-password");
    }

    if (profileError || profile?.is_suspended) {
        await supabase.auth.signOut();
        redirect("/login?error=account-suspended");
    }

    if (error || !roles?.length) {
        await supabase.auth.signOut();
        redirect("/login?error=not-authorized");
    }

    return {
        userId,
        email: user.email?.trim().toLowerCase() ?? "",
        displayName: [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.full_name?.trim() || user.user_metadata.full_name?.trim() || user.email?.split("@")[0] || "CRM User",
        roles: roles.map((item) => item.role as AppRole),
    };
});

export async function requireAdmin() {
    const user = await requireUser();

    if (!user.roles.includes("admin")) {
        redirect("/dashboard?error=admin-only");
    }

    return user;
}
