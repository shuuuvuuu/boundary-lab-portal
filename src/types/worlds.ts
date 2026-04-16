export type Platform = "hubs" | "vrchat" | "spatial" | "other";

export interface World {
  id: string;
  platform: Platform;
  external_id: string | null;
  url: string;
  name: string;
  description: string | null;
  thumbnail_url: string | null;
  tags: string[];
  added_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserFavoriteWorld {
  user_id: string;
  world_id: string;
  note: string | null;
  is_recommended: boolean;
  created_at: string;
}

export interface WorldReview {
  id: string;
  world_id: string;
  user_id: string;
  rating: number;
  body: string | null;
  created_at: string;
}

export interface WorldSummary extends World {
  average_rating: number | null;
  review_count: number;
  recommendation_count: number;
  current_user_favorite: UserFavoriteWorld | null;
  current_user_review: WorldReview | null;
}
