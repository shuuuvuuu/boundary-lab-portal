import type { PublicProfileSummary } from "./profiles";

export type Platform = "hubs" | "vrchat" | "spatial" | "other";

export type WorldAddedByProfile = PublicProfileSummary;
export type WorldReviewProfile = PublicProfileSummary;

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
  added_by_profile: WorldAddedByProfile | null;
  recurring_schedule: string | null;
  next_event_at: string | null;
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

export interface WorldReviewPreview {
  display_name: string | null;
  body: string | null;
  rating: number;
}

export interface WorldReviewDetail extends WorldReview {
  profile: WorldReviewProfile | null;
}

export interface WorldSummary extends World {
  average_rating: number | null;
  review_count: number;
  recommendation_count: number;
  reviews_preview: WorldReviewPreview[];
  current_user_favorite: UserFavoriteWorld | null;
  current_user_review: WorldReview | null;
  current_user_visit_count: number;
  current_user_last_visited_at: string | null;
  active_user_count: number;
  collection_ids: string[];
  upcoming_event: {
    title: string | null;
    starts_at: string;
    ends_at: string | null;
    is_public: boolean;
    source: "calendar" | "world";
  } | null;
  is_own: boolean;
}

export interface WorldLayoutPosition {
  x: number;
  y: number;
  z: number;
}

export interface WorldLayoutNode {
  id: string;
  name: string;
  platform: Platform;
  url: string;
  thumbnail_url: string | null;
  description: string | null;
  tags: string[];
  added_by_profile: WorldAddedByProfile | null;
  average_rating: number | null;
  review_count: number;
  current_user_visit_count: number;
  current_user_last_visited_at: string | null;
  active_user_count: number;
  collection_ids: string[];
  upcoming_event: WorldSummary["upcoming_event"];
  position: WorldLayoutPosition;
}

export interface WorldLayoutEdge {
  from_id: string;
  to_id: string;
  similarity: number;
}

export interface WorldLayoutResponse {
  nodes: WorldLayoutNode[];
  edges: WorldLayoutEdge[];
}
