"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { WorldCard } from "@/components/world/WorldCard";
import type { WorldLayoutNode, WorldLayoutResponse } from "@/types/worlds";

const DynamicMetaNetworkGraphScene = dynamic(
  () => import("./MetaNetworkGraphScene").then((module) => module.MetaNetworkGraphScene),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[620px] items-center justify-center rounded-[32px] border border-white/10 bg-slate-950/70 text-sm text-slate-400">
        グラフビューを初期化しています…
      </div>
    ),
  },
);

type RenderMode = "graph" | "list";

type MetaNetworkExplorerProps = {
  layoutUrl: string;
  eyebrow: string;
  title: string;
  description: string;
  emptyTitle: string;
  emptyHint: string;
  emptyActionHref?: string;
  emptyActionLabel?: string;
  onLayoutChange?: (layout: WorldLayoutResponse | null) => void;
  renderNodeCard?: (node: WorldLayoutNode) => React.ReactNode;
};

async function parseErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? `request failed (${response.status})`;
  } catch {
    return `request failed (${response.status})`;
  }
}

function detectWebGlSupport() {
  if (typeof window === "undefined") {
    return true;
  }

  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
  } catch {
    return false;
  }
}

function detectMobileDevice() {
  if (typeof window === "undefined") {
    return false;
  }

  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const narrowViewport = window.matchMedia("(max-width: 768px)").matches;
  const ua = window.navigator.userAgent.toLowerCase();
  return coarsePointer || narrowViewport || /iphone|ipad|android|mobile/.test(ua);
}

export function MetaNetworkExplorer({
  layoutUrl,
  eyebrow,
  title,
  description,
  emptyTitle,
  emptyHint,
  emptyActionHref,
  emptyActionLabel,
  onLayoutChange,
  renderNodeCard,
}: MetaNetworkExplorerProps) {
  const [layout, setLayout] = useState<WorldLayoutResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renderMode, setRenderMode] = useState<RenderMode>("graph");
  const [webGlSupported, setWebGlSupported] = useState(true);
  const [showMobileGate, setShowMobileGate] = useState(false);

  useEffect(() => {
    setWebGlSupported(detectWebGlSupport());
    setShowMobileGate(detectMobileDevice());

    const controller = new AbortController();
    fetch(layoutUrl, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await parseErrorMessage(response));
        }

        return (await response.json()) as WorldLayoutResponse;
      })
      .then((data) => {
        setLayout(data);
        setError(null);
        onLayoutChange?.(data);
      })
      .catch((nextError: Error) => {
        if (nextError.name !== "AbortError") {
          setError(nextError.message);
          onLayoutChange?.(null);
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [layoutUrl, onLayoutChange]);

  useEffect(() => {
    if (!webGlSupported) {
      setRenderMode("list");
    }
  }, [webGlSupported]);

  const nodes = useMemo(() => layout?.nodes ?? [], [layout]);
  const edges = useMemo(() => layout?.edges ?? [], [layout]);
  const shouldShowGraph = renderMode === "graph" && webGlSupported && !showMobileGate;
  const stats = useMemo(
    () => ({
      nodes: nodes.length,
      edges: edges.length,
      tags: new Set(nodes.flatMap((node) => node.tags)).size,
    }),
    [edges, nodes],
  );
  const renderCard =
    renderNodeCard ??
    ((node: WorldLayoutNode) => (
      <WorldCard
        key={node.id}
        world={node}
        footer={
          <a
            href={node.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100 transition hover:bg-cyan-500/20"
          >
            ワールドを開く
          </a>
        }
      />
    ));

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-cyan-500/20 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_35%),linear-gradient(135deg,_rgba(2,6,23,0.96),_rgba(15,23,42,0.94))] p-6 shadow-card">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">{eyebrow}</p>
            <h2 className="mt-2 text-2xl font-semibold text-white md:text-3xl">{title}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">{description}</p>
          </div>

          <div className="grid gap-3 rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-slate-200 sm:grid-cols-3">
            <StatBlock label="Nodes" value={stats.nodes} />
            <StatBlock label="Edges" value={stats.edges} />
            <StatBlock label="Tags" value={stats.tags} />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-full border border-white/10 bg-slate-950/50 p-1">
            <button
              type="button"
              onClick={() => setRenderMode("graph")}
              disabled={!webGlSupported}
              className={`rounded-full px-4 py-2 text-sm transition ${
                renderMode === "graph" && webGlSupported
                  ? "bg-cyan-500 text-slate-950"
                  : "text-slate-300 hover:bg-white/5"
              } ${!webGlSupported ? "cursor-not-allowed opacity-50" : ""}`}
            >
              3D グラフ
            </button>
            <button
              type="button"
              onClick={() => {
                setRenderMode("list");
                setShowMobileGate(false);
              }}
              className={`rounded-full px-4 py-2 text-sm transition ${
                renderMode === "list"
                  ? "bg-white text-slate-950"
                  : "text-slate-300 hover:bg-white/5"
              }`}
            >
              2D リスト
            </button>
          </div>

          {!webGlSupported ? (
            <p className="text-sm text-amber-200">
              WebGL を利用できないため 2D リスト表示に切り替えました。
            </p>
          ) : (
            <p className="text-sm text-slate-400">
              50 ノード未満を前提とした軽量表示です。モバイルでは 2D リストも選べます。
            </p>
          )}
        </div>
      </section>

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-slate-400">
          メタネットワークを生成しています…
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-4 text-sm text-rose-200">
          {error}
        </div>
      ) : nodes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-10 text-center">
          <p className="text-base font-medium text-white">{emptyTitle}</p>
          <p className="mt-2 text-sm text-slate-400">{emptyHint}</p>
          {emptyActionHref && emptyActionLabel ? (
            <Link
              href={emptyActionHref}
              className="mt-5 inline-flex rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/20"
            >
              {emptyActionLabel}
            </Link>
          ) : null}
        </div>
      ) : shouldShowGraph ? (
        <DynamicMetaNetworkGraphScene nodes={nodes} edges={edges} />
      ) : (
        <div className="space-y-4">
          {showMobileGate && webGlSupported && renderMode === "graph" ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-100">
              <p className="font-medium">この 3D 表示はモバイルでは高負荷になる可能性があります。</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowMobileGate(false)}
                  className="rounded-full border border-amber-300/30 bg-amber-300/15 px-4 py-2 text-xs font-medium text-amber-50 transition hover:bg-amber-300/25"
                >
                  続行して 3D を表示
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRenderMode("list");
                    setShowMobileGate(false);
                  }}
                  className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-medium text-white transition hover:bg-white/15"
                >
                  2D リストに切替
                </button>
              </div>
            </div>
          ) : null}

          {renderMode === "list" || !webGlSupported ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {nodes.map((node) => renderCard(node))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}
