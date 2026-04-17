import type { SupabaseClient } from "@supabase/supabase-js";
import { signAvatarUrls } from "@/lib/avatars/signing";
import type { Profile } from "@/types/database";

export async function getCurrentProfile(supabase: SupabaseClient): Promise<Profile | null> {
  const { data, error } = await supabase.rpc("get_current_profile");

  if (error) {
    throw error;
  }

  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const [profile] = await signAvatarUrls(supabase, [data[0] as Profile]);
  return profile;
}
