"use client";

import { useEffect, useState } from "react";
import type { WorldSummary } from "@/types/worlds";
import { ReviewsModal } from "./ReviewsModal";
import { StarRating } from "./StarRating";
import { WorldCard } from "./WorldCard";
import { WorldForm, type WorldFormValues } from "./WorldForm";

type Message = {
  kind: "success" | "error";
  text: string;
};

async function parseErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? `request failed (${response.status})`;
  } catch {
    return `request failed (${response.status})`;
  }
}

export function FavoriteWorldsPanel() {
  const [worlds, setWorlds] = useState<WorldSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [addNote, setAddNote] = useState("");
  const [addRecommended, setAddRecommended] = useState(false);
  const [addRating, setAddRating] = useState(0);
  const [addReviewBody, setAddReviewBody] = useState("");
  const [reviewingWorld, setReviewingWorld] = useState<WorldSummary | null>(null);

  async function loadFavorites() {
    setLoading(true);
    const response = await fetch("/api/worlds", { cache: "no-store" });
    if (response.ok) {
      const data = (await response.json()) as WorldSummary[];
      setWorlds(data.filter((world) => world.current_user_favorite));
      setMessage(null);
    } else {
      setMessage({ kind: "error", text: await parseErrorMessage(response) });
    }
    setLoading(false);
  }

  useEffect(() => {
    loadFavorites();
  }, []);

  async function handleAddWorld(values: WorldFormValues) {
    const createResponse = await fetch("/api/worlds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!createResponse.ok) {
      return parseErrorMessage(createResponse);
    }

    const world = (await createResponse.json()) as { id: string };
    const favoriteResponse = await fetch(`/api/worlds/${world.id}/favorite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        note: addNote,
        is_recommended: addRecommended,
      }),
    });

    if (!favoriteResponse.ok) {
      return parseErrorMessage(favoriteResponse);
    }

    if (addRating > 0 || addReviewBody.trim()) {
      if (addRating < 1) {
        return "レビュー本文を保存する場合は星評価も入力してください。";
      }

      const reviewResponse = await fetch(`/api/worlds/${world.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating: addRating,
          body: addReviewBody,
        }),
      });

      if (!reviewResponse.ok) {
        return parseErrorMessage(reviewResponse);
      }
    }

    setAddNote("");
    setAddRecommended(false);
    setAddRating(0);
    setAddReviewBody("");
    setShowForm(false);
    setMessage({ kind: "success", text: "お気に入りワールドを追加しました。" });
    await loadFavorites();
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-300">
          自分のお気に入りを保存し、必要ならおすすめとして公開できます。
        </p>
        <button
          type="button"
          onClick={() => setShowForm((current) => !current)}
          className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/20"
        >
          {showForm ? "フォームを閉じる" : "ワールドを追加"}
        </button>
      </div>

      {showForm ? (
        <WorldForm onSubmit={handleAddWorld} submitLabel="追加して保存">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs text-slate-400">メモ</span>
              <textarea
                value={addNote}
                onChange={(event) => setAddNote(event.target.value)}
                rows={3}
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                placeholder="おすすめしたい理由や覚え書き"
              />
            </label>

            <div className="space-y-3 rounded-xl border border-white/10 bg-black/10 p-3">
              <label className="flex items-center gap-3 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={addRecommended}
                  onChange={(event) => setAddRecommended(event.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
                />
                Discover におすすめとして表示する
              </label>

              <div className="space-y-2">
                <span className="text-xs text-slate-400">最初の星評価</span>
                <StarRating value={addRating} onChange={setAddRating} />
              </div>

              <label className="space-y-2">
                <span className="text-xs text-slate-400">最初のレビュー</span>
                <textarea
                  value={addReviewBody}
                  onChange={(event) => setAddReviewBody(event.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                  placeholder="任意"
                />
              </label>
            </div>
          </div>
        </WorldForm>
      ) : null}

      {message ? (
        <p
          className={
            message.kind === "success" ? "text-sm text-emerald-300" : "text-sm text-rose-300"
          }
        >
          {message.text}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-400">読み込み中…</p>
      ) : worlds.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-sm text-slate-400">
          お気に入りワールドはまだありません。
        </div>
      ) : (
        <div className="space-y-4">
          {worlds.map((world) => (
            <FavoriteWorldItem
              key={world.id}
              world={world}
              onRefresh={loadFavorites}
              onOpenReviews={() => setReviewingWorld(world)}
            />
          ))}
        </div>
      )}

      {reviewingWorld ? (
        <ReviewsModal
          worldId={reviewingWorld.id}
          worldName={reviewingWorld.name}
          onClose={() => setReviewingWorld(null)}
        />
      ) : null}
    </div>
  );
}

function FavoriteWorldItem({
  world,
  onRefresh,
  onOpenReviews,
}: {
  world: WorldSummary;
  onRefresh: () => Promise<void>;
  onOpenReviews: () => void;
}) {
  const [note, setNote] = useState(world.current_user_favorite?.note ?? "");
  const [isRecommended, setIsRecommended] = useState(
    world.current_user_favorite?.is_recommended ?? false,
  );
  const [rating, setRating] = useState(world.current_user_review?.rating ?? 0);
  const [reviewBody, setReviewBody] = useState(world.current_user_review?.body ?? "");
  const [message, setMessage] = useState<Message | null>(null);
  const [savingFavorite, setSavingFavorite] = useState(false);
  const [savingReview, setSavingReview] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function saveFavorite() {
    setSavingFavorite(true);
    setMessage(null);

    const response = await fetch(`/api/worlds/${world.id}/favorite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        note,
        is_recommended: isRecommended,
      }),
    });

    setSavingFavorite(false);
    if (!response.ok) {
      setMessage({ kind: "error", text: await parseErrorMessage(response) });
      return;
    }

    setMessage({ kind: "success", text: "お気に入り設定を更新しました。" });
    await onRefresh();
  }

  async function saveReview() {
    if (rating < 1 || rating > 5) {
      setMessage({ kind: "error", text: "星評価を 1〜5 で選択してください。" });
      return;
    }

    setSavingReview(true);
    setMessage(null);
    const response = await fetch(`/api/worlds/${world.id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rating,
        body: reviewBody,
      }),
    });
    setSavingReview(false);

    if (!response.ok) {
      setMessage({ kind: "error", text: await parseErrorMessage(response) });
      return;
    }

    setMessage({ kind: "success", text: "レビューを保存しました。" });
    await onRefresh();
  }

  async function removeFavorite() {
    setRemoving(true);
    setMessage(null);
    const response = await fetch(`/api/worlds/${world.id}/favorite`, {
      method: "DELETE",
    });
    setRemoving(false);

    if (!response.ok) {
      setMessage({ kind: "error", text: await parseErrorMessage(response) });
      return;
    }

    await onRefresh();
  }

  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/30 p-4">
      <WorldCard
        world={world}
        onOpenReviews={onOpenReviews}
        actions={
          <a
            href={world.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10"
          >
            開く
          </a>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-xs text-slate-400">お気に入りメモ</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={4}
            className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
          />
        </label>

        <div className="space-y-4 rounded-xl border border-white/10 bg-black/10 p-4">
          <label className="flex items-center gap-3 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={isRecommended}
              onChange={(event) => setIsRecommended(event.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
            />
            Discover におすすめとして公開する
          </label>

          <div className="space-y-2">
            <span className="text-xs text-slate-400">あなたの星評価</span>
            <StarRating value={rating} onChange={setRating} />
          </div>
        </div>
      </div>

      <label className="space-y-2">
        <span className="text-xs text-slate-400">レビュー本文</span>
        <textarea
          value={reviewBody}
          onChange={(event) => setReviewBody(event.target.value)}
          rows={4}
          className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={saveFavorite}
          disabled={savingFavorite}
          className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-cyan-500 disabled:opacity-50"
        >
          {savingFavorite ? "保存中…" : "お気に入り設定を保存"}
        </button>
        <button
          type="button"
          onClick={saveReview}
          disabled={savingReview}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
        >
          {savingReview ? "保存中…" : "レビューを保存"}
        </button>
        <button
          type="button"
          onClick={removeFavorite}
          disabled={removing}
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-50"
        >
          {removing ? "解除中…" : "お気に入り解除"}
        </button>
      </div>

      {message ? (
        <p
          className={
            message.kind === "success" ? "text-sm text-emerald-300" : "text-sm text-rose-300"
          }
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
