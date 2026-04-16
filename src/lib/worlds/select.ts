import type { UserFavoriteWorld, World, WorldAddedByProfile } from "@/types/worlds";
import type { WorldReviewRow } from "./registry";

export type WorldSelectRow = Omit<World, "added_by_profile"> & {
  added_by_profile?: WorldAddedByProfile | WorldAddedByProfile[] | null;
  user_favorite_worlds?: UserFavoriteWorld[] | null;
  world_reviews?: WorldReviewRow[] | null;
};

export const WORLD_SELECT = `
  id,
  platform,
  external_id,
  url,
  name,
  description,
  thumbnail_url,
  tags,
  added_by,
  added_by_profile:profiles!worlds_added_by_fkey(display_name, avatar_url),
  created_at,
  updated_at,
  user_favorite_worlds(user_id, world_id, note, is_recommended, created_at),
  world_reviews(
    id,
    world_id,
    user_id,
    rating,
    body,
    created_at,
    profile:profiles!world_reviews_user_id_fkey(display_name, avatar_url)
  )
`;
