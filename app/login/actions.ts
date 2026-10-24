"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/app/lib/supabase/server";

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

    if (user.app_metadata.must_change_password) {
        redirect("/change-password");
    }

    redirect("/dashboard");
}
