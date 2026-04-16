import type {
  UserFavoriteWorld,
  World,
  WorldAddedByProfile,
  WorldReview,
  WorldReviewDetail,
  WorldReviewProfile,
  WorldSummary,
} from "@/types/worlds";
import type { PublicProfileSummary } from "@/types/profiles";

export type WorldReviewRow = WorldReview & {
  profile?: WorldReviewProfile | null;
};

type WorldRow = Omit<World, "added_by_profile"> & {
  user_favorite_worlds?: UserFavoriteWorld[] | null;
  world_reviews?: WorldReviewRow[] | null;
};

export function normalizeNullableText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function normalizeTags(value: unknown) {
  const rawTags = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];

  return Array.from(
    new Set(
      rawTags
        .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
        .filter(Boolean),
    ),
  ).slice(0, 12);
}

export function normalizeWorldReviewRow(
  review: WorldReviewRow,
  reviewProfileMap?: Map<string, PublicProfileSummary>,
): WorldReviewDetail {
  return {
    ...review,
    profile: review.profile ?? reviewProfileMap?.get(review.user_id) ?? null,
  };
}

export function summarizeWorldRow(
  row: WorldRow,
  options: {
    userId: string;
    addedByProfile?: WorldAddedByProfile | null;
    reviewProfileMap?: Map<string, PublicProfileSummary>;
    currentUserVisitCount?: number;
    currentUserLastVisitedAt?: string | null;
    activeUserCount?: number;
    collectionIds?: string[];
    upcomingEvent?: WorldSummary["upcoming_event"];
  },
): WorldSummary {
  const favorites = row.user_favorite_worlds ?? [];
  const reviews = (row.world_reviews ?? []).map((review) =>
    normalizeWorldReviewRow(review, options.reviewProfileMap),
  );
  const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
  const currentUserReview = reviews.find((review) => review.user_id === options.userId) ?? null;
  const reviewsPreview = [...reviews]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)
    .map((review) => ({
      display_name: review.profile?.display_name ?? null,
      body: review.body,
      rating: review.rating,
    }));

  return {
    id: row.id,
    platform: row.platform,
    external_id: row.external_id,
    url: row.url,
    name: row.name,
    description: row.description,
    thumbnail_url: row.thumbnail_url,
    tags: row.tags,
    added_by: row.added_by,
    added_by_profile: options.addedByProfile ?? null,
    recurring_schedule: row.recurring_schedule,
    next_event_at: row.next_event_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    average_rating: reviews.length ? Number((totalRating / reviews.length).toFixed(1)) : null,
    review_count: reviews.length,
    recommendation_count: favorites.filter((favorite) => favorite.is_recommended).length,
    reviews_preview: reviewsPreview,
    current_user_favorite:
      favorites.find((favorite) => favorite.user_id === options.userId) ?? null,
    current_user_review: currentUserReview
      ? {
          id: currentUserReview.id,
          world_id: currentUserReview.world_id,
          user_id: currentUserReview.user_id,
          rating: currentUserReview.rating,
          body: currentUserReview.body,
          created_at: currentUserReview.created_at,
        }
      : null,
    current_user_visit_count: options.currentUserVisitCount ?? 0,
    current_user_last_visited_at: options.currentUserLastVisitedAt ?? null,
    active_user_count: options.activeUserCount ?? 0,
    collection_ids: options.collectionIds ?? [],
    upcoming_event: options.upcomingEvent ?? null,
    is_own: row.added_by === options.userId,
  };
}
