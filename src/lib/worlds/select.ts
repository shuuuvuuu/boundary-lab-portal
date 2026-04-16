import type { UserFavoriteWorld, World } from "@/types/worlds";
import type { WorldReviewRow } from "./registry";

export type WorldSelectRow = Omit<World, "added_by_profile"> & {
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
  recurring_schedule,
  next_event_at,
  created_at,
  updated_at,
  user_favorite_worlds(user_id, world_id, note, is_recommended, created_at),
  world_reviews(
    id,
    world_id,
    user_id,
    rating,
    body,
    created_at
  )
`;
