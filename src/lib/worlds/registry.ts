import type {
  UserFavoriteWorld,
  World,
  WorldAddedByProfile,
  WorldReview,
  WorldSummary,
} from "@/types/worlds";

type WorldRow = Omit<World, "added_by_profile"> & {
  added_by_profile?: WorldAddedByProfile | WorldAddedByProfile[] | null;
  user_favorite_worlds?: UserFavoriteWorld[] | null;
  world_reviews?: WorldReview[] | null;
};

export function normalizeNullableText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function normalizeTags(value: unknown) {
  const rawTags = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return Array.from(
    new Set(
      rawTags
        .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
        .filter(Boolean),
    ),
  ).slice(0, 12);
}

export function summarizeWorldRow(row: WorldRow, userId: string): WorldSummary {
  const favorites = row.user_favorite_worlds ?? [];
  const reviews = row.world_reviews ?? [];
  const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
  const addedByProfile = Array.isArray(row.added_by_profile)
    ? row.added_by_profile[0] ?? null
    : row.added_by_profile ?? null;

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
    added_by_profile: addedByProfile,
    created_at: row.created_at,
    updated_at: row.updated_at,
    average_rating: reviews.length ? Number((totalRating / reviews.length).toFixed(1)) : null,
    review_count: reviews.length,
    recommendation_count: favorites.filter((favorite) => favorite.is_recommended).length,
    current_user_favorite: favorites.find((favorite) => favorite.user_id === userId) ?? null,
    current_user_review: reviews.find((review) => review.user_id === userId) ?? null,
    is_own: row.added_by === userId,
  };
}
