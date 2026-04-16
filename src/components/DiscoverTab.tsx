"use client";

import { useEffect, useState } from "react";
import { TagFilter } from "@/components/world/TagFilter";
import { WorldCard } from "@/components/world/WorldCard";
import { PLATFORM_LABELS, PLATFORM_OPTIONS } from "@/lib/worlds/platforms";
import type { Platform, WorldSummary } from "@/types/worlds";

function collectTags(worlds: WorldSummary[]) {
  return Array.from(new Set(worlds.flatMap((world) => world.tags))).sort((a, b) =>
    a.localeCompare(b, "ja"),
  );
}

export function DiscoverTab() {
  const [worlds, setWorlds] = useState<WorldSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState<"all" | Platform>("all");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [tagQuery, setTagQuery] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch("/api/worlds?recommended_only=true", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json()) as { error?: string };
          throw new Error(payload.error ?? String(response.status));
        }
        setWorlds((await response.json()) as WorldSummary[]);
        setError(null);
      })
      .catch((nextError: Error) => setError(nextError.message))
      .finally(() => setLoading(false));
  }, []);

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
              Hubs Foundation / VRChat / Spatial を横断して、公開おすすめ済みのワールドだけを一覧します。
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-200">
            表示中 {visibleWorlds.length} / 総数 {worlds.length}
          </div>
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
            <WorldCard
              key={world.id}
              world={world}
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
          ))}
        </div>
      )}
    </div>
  );
}
