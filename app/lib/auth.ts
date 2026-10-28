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

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/login");
    }

    if (user.app_metadata.must_change_password) {
        redirect("/change-password");
    }

    const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("is_suspended")
        .eq("id", userId)
        .single();

    if (profileError || profile?.is_suspended) {
        await supabase.auth.signOut();
        redirect("/login?error=account-suspended");
    }

    const { data: roles, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

    if (error || !roles?.length) {
        await supabase.auth.signOut();
        redirect("/login?error=not-authorized");
    }

    return {
        userId,
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
