import { PLATFORM_BADGE_CLASSNAMES, PLATFORM_LABELS } from "@/lib/worlds/platforms";
import type { Platform, WorldSummary } from "@/types/worlds";
import { StarRating } from "./StarRating";

type CardWorld = {
  id: string;
  url: string;
  name: string;
  description: string | null;
  thumbnail_url: string | null;
  tags: string[];
  platform: Platform;
  average_rating?: number | null;
  review_count?: number;
  recommendation_count?: number;
};

export function WorldCard({
  world,
  actions,
  footer,
}: {
  world: CardWorld | WorldSummary;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const platformLabel = PLATFORM_LABELS[world.platform];
  const rating = typeof world.average_rating === "number" ? world.average_rating : null;
  const reviewCount = typeof world.review_count === "number" ? world.review_count : 0;
  const recommendationCount =
    typeof world.recommendation_count === "number" ? world.recommendation_count : 0;

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
              {rating !== null ? (
                <span className="inline-flex items-center gap-2 text-xs text-slate-300">
                  <StarRating value={rating} readonly size="sm" />
                  <span>{rating.toFixed(1)}</span>
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

        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <span>レビュー {reviewCount} 件</span>
          <span>おすすめ {recommendationCount} 件</span>
        </div>

        {footer ? <div className="border-t border-white/5 pt-4">{footer}</div> : null}
      </div>
    </article>
  );
}
