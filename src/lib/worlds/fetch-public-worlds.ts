import { createClient } from "@supabase/supabase-js";
import { isPlatform } from "@/lib/worlds/platforms";
import type { Platform, WorldSummary } from "@/types/worlds";

type PublicRecommendedWorldRow = {
  id: string;
  platform: string;
  url: string;
  name: string;
  description: string | null;
  thumbnail_url: string | null;
  tags: string[] | null;
};

export async function fetchPublicWorlds(): Promise<WorldSummary[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  const { data, error } = await supabase.rpc("get_public_recommended_worlds");
  if (error) {
    throw error;
  }

  return ((data ?? []) as PublicRecommendedWorldRow[])
    .filter(
      (row): row is PublicRecommendedWorldRow & { platform: Platform } => isPlatform(row.platform),
    )
    .map((row) => ({
      id: row.id,
      platform: row.platform,
      external_id: null,
      url: row.url,
      name: row.name,
      description: row.description,
      thumbnail_url: row.thumbnail_url,
      tags: row.tags ?? [],
      added_by: null,
      added_by_profile: null,
      recurring_schedule: null,
      next_event_at: null,
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString(),
      average_rating: null,
      review_count: 0,
      recommendation_count: 1,
      reviews_preview: [],
      current_user_favorite: null,
      current_user_review: null,
      current_user_visit_count: 0,
      current_user_last_visited_at: null,
      active_user_count: 0,
      present_portal_users: [],
      collection_ids: [],
      upcoming_event: null,
      is_own: false,
    }));
}
