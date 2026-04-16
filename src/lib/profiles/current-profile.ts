import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@/types/database";

export async function getCurrentProfile(supabase: SupabaseClient): Promise<Profile | null> {
  const { data, error } = await supabase.rpc("get_current_profile");

  if (error) {
    throw error;
  }

  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  return data[0] as Profile;
}
