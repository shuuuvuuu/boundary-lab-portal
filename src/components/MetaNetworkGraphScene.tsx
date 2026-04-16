"use client";

import { Html, Line, OrbitControls, Stars } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { PLATFORM_LABELS } from "@/lib/worlds/platforms";
import type { Platform, WorldLayoutEdge, WorldLayoutNode } from "@/types/worlds";
import { StarRating } from "./world/StarRating";

const PLATFORM_NODE_CLASSES: Record<Platform, string> = {
  hubs: "border-emerald-400/70 bg-emerald-400 shadow-[0_0_28px_rgba(52,211,153,0.55)]",
  vrchat: "border-rose-400/70 bg-rose-400 shadow-[0_0_28px_rgba(251,113,133,0.55)]",
  spatial: "border-violet-400/70 bg-violet-400 shadow-[0_0_28px_rgba(167,139,250,0.55)]",
  other: "border-amber-400/70 bg-amber-400 shadow-[0_0_28px_rgba(251,191,36,0.55)]",
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

  return (
    <div className="relative h-[620px] overflow-hidden rounded-[32px] border border-cyan-500/20 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.08),_transparent_40%),linear-gradient(180deg,_rgba(2,6,23,0.96),_rgba(2,6,23,1))] shadow-card">
      <Canvas camera={{ position: [0, 0, 20] }} className="relative h-full w-full overflow-hidden touch-none">
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
          <GraphNode key={node.id} node={node} />
        ))}
      </Canvas>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 border-t border-white/5 bg-slate-950/45 px-4 py-3 text-xs text-slate-300 backdrop-blur">
        <span>ドラッグで回転 / ホイールまたはピンチでズーム</span>
        <span>
          ノード {nodes.length} / エッジ {edges.length}
        </span>
      </div>
    </div>
  );
}

function GraphNode({ node }: { node: WorldLayoutNode }) {
  const addedByName = node.added_by_profile?.display_name?.trim() || "匿名";

  return (
    <>
      <Html center position={toPoint(node)} distanceFactor={8}>
        <button
          type="button"
          data-scene-interactive="true"
          onClick={() => window.open(node.url, "_blank", "noopener,noreferrer")}
          className="group relative cursor-pointer border-none bg-transparent p-0 text-left"
        >
          <span
            className={`block h-3.5 w-3.5 rounded-full border ${PLATFORM_NODE_CLASSES[node.platform]} transition-transform duration-200 group-hover:scale-125`}
          />
          <span className="mt-2 block whitespace-nowrap text-[11px] font-medium text-white/95 drop-shadow-[0_0_8px_rgba(15,23,42,0.9)]">
            {node.name}
          </span>

          <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-3 hidden w-72 -translate-x-1/2 rounded-2xl border border-white/10 bg-slate-950/95 p-3 text-sm text-slate-200 shadow-2xl backdrop-blur group-hover:block group-focus-visible:block">
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
