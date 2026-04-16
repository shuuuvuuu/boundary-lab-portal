"use client";

import { useEffect, useState } from "react";
import type { WorldReviewDetail } from "@/types/worlds";
import { StarRating } from "./StarRating";

async function parseErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? `request failed (${response.status})`;
  } catch {
    return `request failed (${response.status})`;
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function ReviewsModal({
  worldId,
  worldName,
  onClose,
}: {
  worldId: string;
  worldName: string;
  onClose: () => void;
}) {
  const [reviews, setReviews] = useState<WorldReviewDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadReviews() {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/worlds/${worldId}/reviews`, { cache: "no-store" });

      if (!response.ok) {
        if (!cancelled) {
          setError(await parseErrorMessage(response));
          setLoading(false);
        }
        return;
      }

      const data = (await response.json()) as WorldReviewDetail[];
      if (!cancelled) {
        setReviews(data);
        setLoading(false);
      }
    }

    loadReviews();

    return () => {
      cancelled = true;
    };
  }, [worldId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${worldName} のレビュー`}
        className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-3xl border border-white/10 bg-slate-900 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/70">Reviews</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{worldName}</h2>
            <p className="mt-2 text-sm text-slate-400">
              このワールドに投稿されたレビュー一覧です。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10"
          >
            Close
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5">
          {loading ? (
            <p className="text-sm text-slate-400">レビューを読み込み中…</p>
          ) : error ? (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-4 text-sm text-rose-200">
              {error}
            </div>
          ) : reviews.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center text-sm text-slate-400">
              レビューはまだありません。
            </div>
          ) : (
            <div className="space-y-4">
              {reviews.map((review) => {
                const displayName = review.profile?.display_name?.trim() || "匿名";

                return (
                  <article
                    key={review.id}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        {review.profile?.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={review.profile.avatar_url}
                            alt=""
                            className="h-10 w-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-500/15 text-sm font-semibold text-cyan-100">
                            {displayName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-medium text-white">{displayName}</p>
                          <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                            <StarRating value={review.rating} readonly size="sm" />
                            <span>{formatDate(review.created_at)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-200">
                      {review.body?.trim() || "本文なし"}
                    </p>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-white/10 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
