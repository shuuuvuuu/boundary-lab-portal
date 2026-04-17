import { getPreferredEmail } from "@/lib/auth/user-state";
import { getCurrentProfile } from "@/lib/profiles/current-profile";
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

  let profile: Profile | null = null;

  try {
    profile = await getCurrentProfile(supabase);
  } catch {
    profile = null;
  }

  return {
    profile,
    email: getPreferredEmail(user, profile) ?? "",
    canAccessAdmin: profile?.plan_tier === "enterprise",
  };
}
