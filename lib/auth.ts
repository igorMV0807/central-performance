import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAllowedEmails } from "@/lib/env";

export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const allowed = getAllowedEmails();
  const email = user.email?.toLowerCase() || "";

  if (allowed.length > 0 && !allowed.includes(email)) {
    await supabase.auth.signOut();
    redirect("/login?error=unauthorized");
  }

  return user;
}
