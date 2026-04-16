import { getPreferredEmail, hasVerifiedEmailIdentity } from "@/lib/auth/user-state";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";

export async function loadPortalShellData() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  return {
    profile,
    email: getPreferredEmail(user, profile) ?? "",
    canAccessAdmin: hasVerifiedEmailIdentity(user),
  };
}
