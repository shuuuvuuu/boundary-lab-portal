import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicProfileSummary } from "@/types/profiles";

export async function getPublicProfileMap(
  supabase: SupabaseClient,
  profileIds: string[],
): Promise<Map<string, PublicProfileSummary>> {
  const uniqueIds = Array.from(new Set(profileIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase.rpc("get_public_profiles", {
    profile_ids: uniqueIds,
  });

  if (error) {
    throw error;
  }

  const rows = ((data ?? []) as PublicProfileSummary[]).map((row) => ({
    id: row.id,
    display_name: row.display_name ?? null,
    avatar_url: row.avatar_url ?? null,
  }));

  return new Map(rows.map((row) => [row.id, row]));
}
