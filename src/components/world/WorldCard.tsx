import { PLATFORM_BADGE_CLASSNAMES, PLATFORM_LABELS } from "@/lib/worlds/platforms";
import type {
  Platform,
  WorldAddedByProfile,
  WorldReviewPreview,
  WorldSummary,
} from "@/types/worlds";
import { CollectionAddControl } from "./CollectionAddControl";
import { StarRating } from "./StarRating";

type CardWorld = {
  id: string;
  url: string;
  name: string;
  description: string | null;
  thumbnail_url: string | null;
  tags: string[];
  platform: Platform;
  added_by_profile?: WorldAddedByProfile | null;
  average_rating?: number | null;
  review_count?: number;
  recommendation_count?: number;
  reviews_preview?: WorldReviewPreview[];
  current_user_visit_count?: number;
  current_user_last_visited_at?: string | null;
  active_user_count?: number;
  present_portal_users?: { display_name: string | null; avatar_url: string | null }[];
  upcoming_event?: WorldSummary["upcoming_event"];
};

function truncateReviewText(value: string | null, maxLength = 60) {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return "レビュー本文はまだありません。";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}…`;
}

export function WorldCard({
  world,
  actions,
  footer,
  onOpenReviews,
  allowCollectionAdd = false,
}: {
  world: CardWorld | WorldSummary;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  onOpenReviews?: () => void;
  allowCollectionAdd?: boolean;
}) {
  const platformLabel = PLATFORM_LABELS[world.platform];
  const rating = typeof world.average_rating === "number" ? world.average_rating : null;
  const reviewCount = typeof world.review_count === "number" ? world.review_count : 0;
  const recommendationCount =
    typeof world.recommendation_count === "number" ? world.recommendation_count : 0;
  const reviewsPreview = Array.isArray(world.reviews_preview) ? world.reviews_preview : [];
  const addedByName = world.added_by_profile?.display_name?.trim() || "匿名";
  const canOpenReviews = Boolean(onOpenReviews) && reviewCount > 0;
  const visitCount = typeof world.current_user_visit_count === "number" ? world.current_user_visit_count : 0;
  const activeUserCount = typeof world.active_user_count === "number" ? world.active_user_count : 0;
  const presentPortalUsers = world.present_portal_users ?? [];
  const upcomingEvent = world.upcoming_event ?? null;
  const isUpcomingSoon =
    upcomingEvent !== null &&
    new Date(upcomingEvent.starts_at).getTime() - Date.now() <= 7 * 24 * 60 * 60 * 1000;

  return (
    <article className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/50 shadow-card">
      <a
        href={world.url}
        target="_blank"
        rel="noreferrer"
        className="block aspect-[16/9] overflow-hidden bg-slate-900"
      >
        {world.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={world.thumbnail_url}
            alt={world.name}
            className="h-full w-full object-cover transition duration-300 hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-end bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.2),_transparent_50%),linear-gradient(135deg,_rgba(15,23,42,1),_rgba(30,41,59,1))] p-4">
            <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs uppercase tracking-[0.25em] text-slate-200">
              {platformLabel}
            </span>
          </div>
        )}
      </a>

      <div className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${PLATFORM_BADGE_CLASSNAMES[world.platform]}`}
              >
                {platformLabel}
              </span>
              {activeUserCount >= 1 ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-100">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  </span>
                  {activeUserCount} 人入室中
                </span>
              ) : null}
              {presentPortalUsers.length > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  {presentPortalUsers.slice(0, 3).map((user, idx) =>
                    user.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={idx}
                        src={user.avatar_url}
                        alt={user.display_name ?? "ユーザー"}
                        title={user.display_name ?? "ユーザー"}
                        className="h-5 w-5 rounded-full border border-emerald-400/70 object-cover"
                      />
                    ) : (
                      <span
                        key={idx}
                        title={user.display_name ?? "ユーザー"}
                        className="flex h-5 w-5 items-center justify-center rounded-full border border-emerald-400/70 bg-emerald-500/20 text-[9px] font-semibold text-emerald-100"
                      >
                        {user.display_name?.charAt(0).toUpperCase() ?? "?"}
                      </span>
                    ),
                  )}
                  <span className="text-[10px] text-emerald-200/90">
                    {presentPortalUsers
                      .slice(0, 3)
                      .map((u) => u.display_name ?? "匿名")
                      .join(" / ")}
                    {presentPortalUsers.length > 3
                      ? ` 他 ${presentPortalUsers.length - 3} 名`
                      : ""}
                  </span>
                </span>
              ) : null}
              {rating !== null ? (
                <span className="inline-flex items-center gap-2 text-xs text-slate-300">
                  <StarRating value={rating} readonly size="sm" />
                  <span>{rating.toFixed(1)}</span>
                  <span>({reviewCount}件の平均)</span>
                </span>
              ) : (
                <span className="text-xs text-slate-500">未評価</span>
              )}
            </div>

            <a
              href={world.url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block text-lg font-semibold text-white transition hover:text-cyan-200"
            >
              {world.name}
            </a>

            {world.description ? (
              <p className="mt-2 text-sm leading-6 text-slate-300">{world.description}</p>
            ) : (
              <p className="mt-2 text-sm text-slate-500">説明はまだありません。</p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
              <span>訪問 {visitCount} 回</span>
              <span>
                最終訪問{" "}
                {world.current_user_last_visited_at
                  ? new Date(world.current_user_last_visited_at).toLocaleString("ja-JP")
                  : "なし"}
              </span>
            </div>

            {upcomingEvent ? (
              <div
                className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-medium ${isUpcomingSoon ? "border border-amber-400/30 bg-amber-400/15 text-amber-50" : "border border-white/10 bg-white/5 text-slate-200"}`}
              >
                <span>次回開催</span>
                <span>{new Date(upcomingEvent.starts_at).toLocaleString("ja-JP")}</span>
              </div>
            ) : null}
          </div>

          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {world.tags.length > 0 ? (
            world.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-xs text-cyan-100"
              >
                #{tag}
              </span>
            ))
          ) : (
            <span className="text-xs text-slate-500">タグ未設定</span>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            {world.added_by_profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={world.added_by_profile.avatar_url}
                alt={`${addedByName} avatar`}
                className="h-6 w-6 rounded-full object-cover"
              />
            ) : null}
            <span>登録者 by {addedByName}</span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span>レビュー {reviewCount} 件</span>
            <span>おすすめ {recommendationCount} 件</span>
          </div>
        </div>

        <CollectionAddControl worldId={world.id} enabled={allowCollectionAdd} />

        <div
          role={canOpenReviews ? "button" : undefined}
          tabIndex={canOpenReviews ? 0 : undefined}
          onClick={canOpenReviews ? onOpenReviews : undefined}
          onKeyDown={
            canOpenReviews
              ? (event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpenReviews?.();
                  }
                }
              : undefined
          }
          className={`rounded-xl border border-white/10 px-3 py-3 ${
            canOpenReviews
              ? "cursor-pointer bg-white/[0.03] transition hover:border-cyan-500/30 hover:bg-cyan-500/5"
              : "bg-white/[0.02]"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              最近のレビュー
            </p>
            {canOpenReviews ? <span className="text-xs text-cyan-200">一覧を見る</span> : null}
          </div>

          {reviewsPreview.length > 0 ? (
            <ul className="mt-3 space-y-2 text-sm text-slate-300">
              {reviewsPreview.map((review, index) => {
                const displayName = review.display_name?.trim() || "匿名";
                return (
                  <li key={`${displayName}-${index}`} className="ml-4 list-disc pl-1">
                    {displayName}: {truncateReviewText(review.body)} / ★{review.rating}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-500">最近のレビューはまだありません。</p>
          )}
        </div>

        {footer ? <div className="border-t border-white/5 pt-4">{footer}</div> : null}
      </div>
    </article>
  );
}
