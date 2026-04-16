"use client";

import { useEffect, useState } from "react";
import { ReviewsModal } from "@/components/world/ReviewsModal";
import { TagFilter } from "@/components/world/TagFilter";
import { WorldCard } from "@/components/world/WorldCard";
import { WorldEditModal } from "@/components/world/WorldEditModal";
import { WorldForm, type WorldFormValues } from "@/components/world/WorldForm";
import { PLATFORM_LABELS, PLATFORM_OPTIONS } from "@/lib/worlds/platforms";
import type { Platform, WorldSummary } from "@/types/worlds";

type Message = {
  kind: "success" | "error";
  text: string;
};

function collectTags(worlds: WorldSummary[]) {
  return Array.from(new Set(worlds.flatMap((world) => world.tags))).sort((a, b) =>
    a.localeCompare(b, "ja"),
  );
}

async function parseErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? `request failed (${response.status})`;
  } catch {
    return `request failed (${response.status})`;
  }
}

async function fetchRecommendedWorlds() {
  const response = await fetch("/api/worlds?recommended_only=true", { cache: "no-store" });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  return (await response.json()) as WorldSummary[];
}

export function DiscoverTab({ canDeleteWorlds = false }: { canDeleteWorlds?: boolean }) {
  const [worlds, setWorlds] = useState<WorldSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState<"all" | Platform>("all");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [tagQuery, setTagQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [editingWorld, setEditingWorld] = useState<WorldSummary | null>(null);
  const [reviewingWorld, setReviewingWorld] = useState<WorldSummary | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchRecommendedWorlds()
      .then((data) => {
        setWorlds(data);
        setError(null);
      })
      .catch((nextError: Error) => setError(nextError.message))
      .finally(() => setLoading(false));
  }, []);

  async function refreshRecommendedWorlds() {
    try {
      const data = await fetchRecommendedWorlds();
      setWorlds(data);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "読み込みに失敗しました。");
    }
  }

  async function handleAddWorld(values: WorldFormValues) {
    setMessage(null);

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
        is_recommended: true,
      }),
    });

    if (!favoriteResponse.ok) {
      return parseErrorMessage(favoriteResponse);
    }

    setShowForm(false);
    setMessage({
      kind: "success",
      text: "ワールドを登録して Discover に公開しました。",
    });
    await refreshRecommendedWorlds();
    return null;
  }

  const platformWorlds =
    platform === "all" ? worlds : worlds.filter((world) => world.platform === platform);
  const availableTags = collectTags(platformWorlds);
  const visibleWorlds = platformWorlds.filter((world) =>
    selectedTag ? world.tags.includes(selectedTag) : true,
  );

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-cyan-500/20 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_35%),linear-gradient(135deg,_rgba(15,23,42,0.95),_rgba(17,24,39,0.9))] p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">Discover</p>
            <h2 className="mt-2 text-2xl font-semibold text-white md:text-3xl">
              クロスプラットフォームのおすすめワールド
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Hubs Foundation / VRChat / Spatial
              を横断して、公開おすすめ済みのワールドだけを一覧します。
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-200">
            表示中 {visibleWorlds.length} / 総数 {worlds.length}
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-300">
              気に入ったワールドを登録すると、Discover に即時公開されます。
            </p>
            <button
              type="button"
              onClick={() => setShowForm((current) => !current)}
              className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/20"
            >
              {showForm ? "フォームを閉じる" : "+ ワールドを追加"}
            </button>
          </div>

          {showForm ? <WorldForm onSubmit={handleAddWorld} submitLabel="登録して公開" /> : null}

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
      </section>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setPlatform("all")}
          className={`rounded-full px-4 py-2 text-sm transition ${
            platform === "all"
              ? "bg-cyan-600 text-white"
              : "bg-white/5 text-slate-300 hover:bg-white/10"
          }`}
        >
          すべて
        </button>
        {PLATFORM_OPTIONS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => {
              setPlatform(item);
              setSelectedTag(null);
            }}
            className={`rounded-full px-4 py-2 text-sm transition ${
              platform === item
                ? "bg-cyan-600 text-white"
                : "bg-white/5 text-slate-300 hover:bg-white/10"
            }`}
          >
            {PLATFORM_LABELS[item]}
          </button>
        ))}
      </div>

      <TagFilter
        tags={availableTags}
        selectedTag={selectedTag}
        query={tagQuery}
        onQueryChange={setTagQuery}
        onSelect={setSelectedTag}
      />

      {loading ? (
        <p className="text-sm text-slate-400">おすすめワールドを読み込み中…</p>
      ) : error ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-4 text-sm text-rose-200">
          {error}
        </div>
      ) : visibleWorlds.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center text-sm text-slate-400">
          条件に一致するおすすめワールドはまだありません。
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleWorlds.map((world) => (
            <DiscoverCard
              key={world.id}
              world={world}
              onEdit={() => setEditingWorld(world)}
              onOpenReviews={() => setReviewingWorld(world)}
            />
          ))}
        </div>
      )}

      {editingWorld ? (
        <WorldEditModal
          key={editingWorld.id}
          world={editingWorld}
          canDelete={canDeleteWorlds}
          onClose={() => setEditingWorld(null)}
          onSaved={async () => {
            setEditingWorld(null);
            await refreshRecommendedWorlds();
          }}
        />
      ) : null}

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

function DiscoverCard({
  world,
  onEdit,
  onOpenReviews,
}: {
  world: WorldSummary;
  onEdit: () => void;
  onOpenReviews: () => void;
}) {
  const isOwn = world.is_own;
  const isPublished = world.recommendation_count >= 1;
  const isPublic = isPublished || (isOwn && world.current_user_favorite?.is_recommended === true);

  return (
    <div className="relative">
      {isOwn && !isPublic ? (
        <span className="absolute right-3 top-3 z-10 rounded-full bg-amber-500/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-200">
          非公開（自分のみ表示）
        </span>
      ) : null}
      <WorldCard
        world={world}
        onOpenReviews={onOpenReviews}
        actions={
          <div className="flex flex-col gap-2">
            {isOwn ? (
              <button
                type="button"
                onClick={onEdit}
                className="rounded-xl border border-cyan-500/30 bg-cyan-500/20 px-3 py-2 text-xs text-cyan-100 transition hover:bg-cyan-500/30"
              >
                編集
              </button>
            ) : null}
            <a
              href={world.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center text-xs text-slate-200 transition hover:bg-white/10"
            >
              開く
            </a>
          </div>
        }
      />
    </div>
  );
}
