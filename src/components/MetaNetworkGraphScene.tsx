"use client";

import { useEffect, useState } from "react";
import { Html, Line, OrbitControls, Stars } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { PLATFORM_LABELS } from "@/lib/worlds/platforms";
import type { Platform, WorldLayoutEdge, WorldLayoutNode } from "@/types/worlds";
import { StarRating } from "./world/StarRating";

const PLATFORM_NODE_CLASSES: Record<Platform, string> = {
  hubs: "border-emerald-300 bg-emerald-300 shadow-[0_0_14px_rgba(52,211,153,0.95),0_0_42px_rgba(52,211,153,0.8),0_0_90px_rgba(52,211,153,0.45)]",
  vrchat: "border-rose-300 bg-rose-300 shadow-[0_0_14px_rgba(251,113,133,0.95),0_0_42px_rgba(251,113,133,0.8),0_0_90px_rgba(251,113,133,0.45)]",
  spatial: "border-violet-300 bg-violet-300 shadow-[0_0_14px_rgba(167,139,250,0.95),0_0_42px_rgba(167,139,250,0.8),0_0_90px_rgba(167,139,250,0.45)]",
  other: "border-amber-300 bg-amber-300 shadow-[0_0_14px_rgba(251,191,36,0.95),0_0_42px_rgba(251,191,36,0.8),0_0_90px_rgba(251,191,36,0.45)]",
};

const PLATFORM_HALO_CLASSES: Record<Platform, string> = {
  hubs: "bg-emerald-400/25",
  vrchat: "bg-rose-400/25",
  spatial: "bg-violet-400/25",
  other: "bg-amber-400/25",
};

const PLATFORM_PANEL_CLASSES: Record<Platform, string> = {
  hubs: "border-emerald-500/30 bg-emerald-500/15 text-emerald-100",
  vrchat: "border-rose-500/30 bg-rose-500/15 text-rose-100",
  spatial: "border-violet-500/30 bg-violet-500/15 text-violet-100",
  other: "border-amber-500/30 bg-amber-500/15 text-amber-100",
};

type Vec3 = [number, number, number];

function truncateText(value: string | null, maxLength: number) {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "説明はまだありません。";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}…`;
}

function toPoint(node: WorldLayoutNode): Vec3 {
  return [node.position.x, node.position.y, node.position.z];
}

export function MetaNetworkGraphScene({
  nodes,
  edges,
}: {
  nodes: WorldLayoutNode[];
  edges: WorldLayoutEdge[];
}) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId) return undefined;
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [selectedId]);

  const selectedNode = selectedId ? nodeMap.get(selectedId) ?? null : null;
  const focus = selectedNode
    ? { position: [selectedNode.position.x, selectedNode.position.y, selectedNode.position.z] as [number, number, number] }
    : null;

  function handleNodeClick(node: WorldLayoutNode) {
    if (selectedId === node.id) {
      window.open(node.url, "_blank", "noopener,noreferrer");
      return;
    }
    setSelectedId(node.id);
  }

  return (
    <div className="relative h-[620px] overflow-hidden rounded-[32px] border border-cyan-500/20 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.08),_transparent_40%),linear-gradient(180deg,_rgba(2,6,23,0.96),_rgba(2,6,23,1))] shadow-card">
      <Canvas
        camera={{ position: [0, 0, 20] }}
        className="relative h-full w-full overflow-hidden touch-none"
        focus={focus}
      >
        <Stars />
        <OrbitControls enableDamping />

        {edges.map((edge) => {
          const fromNode = nodeMap.get(edge.from_id);
          const toNode = nodeMap.get(edge.to_id);
          if (!fromNode || !toNode) {
            return null;
          }

          return (
            <Line
              key={`${edge.from_id}-${edge.to_id}`}
              points={[toPoint(fromNode), toPoint(toNode)]}
              color="#06b6d4"
              opacity={0.18 + edge.similarity * 0.35}
              lineWidth={1 + edge.similarity}
            />
          );
        })}

        {nodes.map((node) => (
          <GraphNode
            key={node.id}
            node={node}
            selected={selectedId === node.id}
            onClick={() => handleNodeClick(node)}
          />
        ))}
      </Canvas>

      {selectedNode ? (
        <FocusPanel node={selectedNode} onClose={() => setSelectedId(null)} onOpenUrl={() => window.open(selectedNode.url, "_blank", "noopener,noreferrer")} />
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 border-t border-white/5 bg-slate-950/45 px-4 py-3 text-xs text-slate-300 backdrop-blur">
        <span>
          {selectedNode
            ? "もう一度球をクリックするとワールドへ / × または ESC で戻る"
            : "球をクリックで接近 / ドラッグ回転 / ホイールでズーム"}
        </span>
        <span>
          ノード {nodes.length} / エッジ {edges.length}
        </span>
      </div>
    </div>
  );
}

function FocusPanel({
  node,
  onClose,
  onOpenUrl,
}: {
  node: WorldLayoutNode;
  onClose: () => void;
  onOpenUrl: () => void;
}) {
  const addedByName = node.added_by_profile?.display_name?.trim() || "匿名";

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center">
      <button
        type="button"
        onClick={onClose}
        aria-label="閉じる"
        className="pointer-events-auto absolute right-4 top-4 rounded-full border border-white/15 bg-slate-950/70 p-2 text-slate-200 backdrop-blur transition hover:bg-slate-800"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
      <div className="pointer-events-auto ml-auto h-full w-[360px] max-w-[90%] overflow-y-auto border-l border-white/10 bg-slate-950/70 p-5 text-sm text-slate-100 backdrop-blur-xl">
        <div className="mb-4 overflow-hidden rounded-2xl border border-white/10 bg-slate-900">
          {node.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={node.thumbnail_url} alt={node.name} className="h-40 w-full object-cover" />
          ) : (
            <div className="flex h-40 w-full items-end bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.22),_transparent_45%),linear-gradient(135deg,_rgba(15,23,42,1),_rgba(30,41,59,1))] p-3">
              <span className="text-[11px] uppercase tracking-[0.25em] text-slate-200">
                {PLATFORM_LABELS[node.platform]}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <span
            className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${PLATFORM_PANEL_CLASSES[node.platform]}`}
          >
            {PLATFORM_LABELS[node.platform]}
          </span>
          {node.average_rating !== null ? (
            <span className="inline-flex items-center gap-2 text-xs text-slate-200">
              <StarRating value={node.average_rating} readonly size="sm" />
              <span>
                {node.average_rating.toFixed(1)} / {node.review_count}件
              </span>
            </span>
          ) : (
            <span className="text-xs text-slate-500">未評価</span>
          )}
        </div>

        <h3 className="mt-4 text-lg font-semibold text-white">{node.name}</h3>
        <p className="mt-2 text-xs leading-6 text-slate-300">
          {truncateText(node.description, 220)}
        </p>

        <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
          {node.added_by_profile?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={node.added_by_profile.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover" />
          ) : (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[10px] font-semibold text-white">
              {addedByName.charAt(0).toUpperCase()}
            </span>
          )}
          <span>登録者 {addedByName}</span>
        </div>

        {node.tags.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {node.tags.slice(0, 8).map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-100"
              >
                #{tag}
              </span>
            ))}
          </div>
        ) : null}

        <button
          type="button"
          onClick={onOpenUrl}
          className="mt-6 w-full rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-400"
        >
          このワールドへ移動
        </button>
        <p className="mt-2 text-[11px] text-slate-500">または中央の光の球をもう一度クリック</p>
      </div>
    </div>
  );
}

function GraphNode({
  node,
  selected,
  onClick,
}: {
  node: WorldLayoutNode;
  selected: boolean;
  onClick: () => void;
}) {
  const addedByName = node.added_by_profile?.display_name?.trim() || "匿名";

  return (
    <>
      <Html center position={toPoint(node)} distanceFactor={8}>
        <button
          type="button"
          data-scene-interactive="true"
          onClick={onClick}
          className={`group relative cursor-pointer border-none bg-transparent p-0 text-left ${selected ? "z-30" : ""}`}
        >
          <span className="relative block h-4 w-4">
            <span
              aria-hidden
              className={`absolute inset-[-14px] rounded-full blur-xl ${PLATFORM_HALO_CLASSES[node.platform]} transition-transform duration-200 ${selected ? "scale-150" : "group-hover:scale-125"}`}
            />
            <span
              className={`relative block h-4 w-4 rounded-full border ${PLATFORM_NODE_CLASSES[node.platform]} transition-transform duration-200 ${selected ? "scale-125" : "group-hover:scale-125"}`}
            />
          </span>
          <span className={`mt-2 block whitespace-nowrap text-[11px] font-medium text-white/95 drop-shadow-[0_0_8px_rgba(15,23,42,0.9)] ${selected ? "opacity-0" : ""}`}>
            {node.name}
          </span>

          <span className={`pointer-events-none absolute left-1/2 top-full z-10 mt-3 w-72 -translate-x-1/2 rounded-2xl border border-white/10 bg-slate-950/95 p-3 text-sm text-slate-200 shadow-2xl backdrop-blur ${selected ? "hidden" : "hidden group-hover:block group-focus-visible:block"}`}>
            <span className="block overflow-hidden rounded-xl border border-white/10 bg-slate-900">
              {node.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={node.thumbnail_url}
                  alt={node.name}
                  className="h-32 w-full object-cover"
                />
              ) : (
                <span className="flex h-32 w-full items-end bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_45%),linear-gradient(135deg,_rgba(15,23,42,1),_rgba(30,41,59,1))] p-3">
                  <span className="text-xs uppercase tracking-[0.25em] text-slate-200">
                    {PLATFORM_LABELS[node.platform]}
                  </span>
                </span>
              )}
            </span>

            <span className="mt-3 flex items-center justify-between gap-3">
              <span
                className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${PLATFORM_PANEL_CLASSES[node.platform]}`}
              >
                {PLATFORM_LABELS[node.platform]}
              </span>
              {node.average_rating !== null ? (
                <span className="inline-flex items-center gap-2 text-xs text-slate-200">
                  <StarRating value={node.average_rating} readonly size="sm" />
                  <span>
                    {node.average_rating.toFixed(1)} / {node.review_count}件
                  </span>
                </span>
              ) : (
                <span className="text-xs text-slate-500">未評価</span>
              )}
            </span>

            <span className="mt-3 block text-sm font-semibold text-white">{node.name}</span>
            <span className="mt-2 block text-xs leading-5 text-slate-300">
              {truncateText(node.description, 92)}
            </span>

            <span className="mt-3 flex items-center gap-2 text-xs text-slate-400">
              {node.added_by_profile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={node.added_by_profile.avatar_url}
                  alt=""
                  className="h-6 w-6 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[10px] font-semibold text-white">
                  {addedByName.charAt(0).toUpperCase()}
                </span>
              )}
              <span>登録者 {addedByName}</span>
            </span>

            <span className="mt-3 flex flex-wrap gap-2">
              {node.tags.length > 0 ? (
                node.tags.slice(0, 5).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-100"
                  >
                    #{tag}
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-500">タグ未設定</span>
              )}
            </span>
          </span>
        </button>
      </Html>
    </>
  );
}
