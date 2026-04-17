"use client";

import { useEffect, useState } from "react";
import type { CollectionSummary } from "@/types/collections";

async function parseErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? `request failed (${response.status})`;
  } catch {
    return `request failed (${response.status})`;
  }
}

export function CollectionAddControl({
  worldId,
  enabled,
}: {
  worldId: string;
  enabled: boolean;
}) {
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    fetch("/api/collections?scope=mine", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await parseErrorMessage(response));
        }
        return (await response.json()) as CollectionSummary[];
      })
      .then((data) => setCollections(data))
      .catch(() => setCollections([]));
  }, [enabled]);

  if (!enabled) {
    return null;
  }

  const availableCollections = collections.filter(
    (collection) => !collection.worlds.some((world) => world.id === worldId),
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <select
          value={selectedCollectionId}
          onChange={(event) => setSelectedCollectionId(event.target.value)}
          className="min-w-[168px] rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white outline-none transition focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
        >
          <option value="">コレクションに追加</option>
          {availableCollections.map((collection) => (
            <option key={collection.id} value={collection.id}>
              {collection.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!selectedCollectionId || loading}
          onClick={async () => {
            if (!selectedCollectionId) {
              return;
            }

            setLoading(true);
            setMessage(null);
            const response = await fetch(
              `/api/collections/${selectedCollectionId}/worlds/${worldId}`,
              { method: "POST" },
            );
            setLoading(false);

            if (!response.ok) {
              setMessage(await parseErrorMessage(response));
              return;
            }

            const nextCollections = collections.map((collection) =>
              collection.id === selectedCollectionId
                ? {
                    ...collection,
                    worlds: [
                      ...collection.worlds,
                      { id: worldId, name: "", platform: "other" as const, thumbnail_url: null },
                    ],
                  }
                : collection,
            );
            setCollections(nextCollections);
            setSelectedCollectionId("");
            setMessage("追加しました。");
          }}
          className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100 transition hover:bg-cyan-500/20 disabled:opacity-50"
        >
          追加
        </button>
      </div>
      {message ? <p className="text-[11px] text-slate-400">{message}</p> : null}
    </div>
  );
}
