"use client";

import Link from "next/link";
import { useState } from "react";
import { MetaNetworkExplorer } from "@/components/MetaNetworkExplorer";
import { PLATFORM_LABELS } from "@/lib/worlds/platforms";
import type { WorldLayoutNode, WorldLayoutResponse } from "@/types/worlds";

export function PublicMetaNetworkShell({
  isAuthenticated,
}: {
  isAuthenticated: boolean;
}) {
  const [layout, setLayout] = useState<WorldLayoutResponse | null>(null);
  const featuredWorlds = layout?.nodes.slice(0, 6) ?? [];

  return (
    <div className="relative overflow-hidden bg-bg-primary">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(8,145,178,0.18),_transparent_26%),linear-gradient(180deg,_rgba(15,23,42,1),_rgba(2,6,23,1))]" />
      <div className="absolute inset-x-0 top-0 h-[540px] bg-[linear-gradient(120deg,_rgba(34,211,238,0.12),_transparent_35%,_rgba(15,23,42,0)_70%),radial-gradient(circle_at_20%_20%,_rgba(255,255,255,0.06),_transparent_18%)]" />

      <div className="relative">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/70 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 md:px-8">
            <Link href="/" className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-200">
                <LogoMark />
              </span>
              <span>
                <span className="block text-sm font-semibold text-white">境界設計室</span>
                <span className="block text-xs uppercase tracking-[0.24em] text-slate-400">
                  Boundary LAB
                </span>
              </span>
            </Link>

            <nav className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
              <a href="#about" className="transition hover:text-white">
                About
              </a>
              <a href="#works" className="transition hover:text-white">
                Works
              </a>
              <a href="#metanetwork" className="transition hover:text-white">
                Metanetwork
              </a>
              <a href="#contact" className="transition hover:text-white">
                Contact
              </a>
            </nav>

            <Link
              href={isAuthenticated ? "/app" : "/login"}
              className="inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/20"
            >
              {isAuthenticated ? "マイページへ" : "ログイン"}
            </Link>
          </div>
        </header>

        <main>
          <section id="hero" className="mx-auto max-w-7xl px-4 pb-16 pt-14 md:px-8 md:pb-24 md:pt-24">
            <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-cyan-200/80">
                  Boundary LAB Portal
                </p>
                <h1 className="mt-5 max-w-4xl text-4xl font-semibold leading-tight text-white md:text-6xl">
                  境界を越える体験を
                  <span className="block text-cyan-200">設計する</span>
                </h1>
                <p className="mt-6 max-w-2xl text-base leading-8 text-slate-300 md:text-lg">
                  境界設計室 / Boundary LAB は、メタバース空間の体験設計と事業化支援を通じて、
                  複数プラットフォームを横断する参加導線と運用体験を再設計します。
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    href={isAuthenticated ? "/app" : "/login"}
                    className="inline-flex rounded-full bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
                  >
                    {isAuthenticated ? "マイページへ" : "ログインして参加する"}
                  </Link>
                  <a
                    href="#contact"
                    className="inline-flex rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-white transition hover:bg-white/10"
                  >
                    お問い合わせ
                  </a>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-1">
                <MetricCard value="3D" label="世界のつながりを可視化" />
                <MetricCard value="Cross-Platform" label="Hubs / VRChat / Spatial を横断" />
                <MetricCard value="Live Ops" label="導線設計から運用観測まで接続" />
              </div>
            </div>
          </section>

          <section id="metanetwork" className="mx-auto max-w-7xl px-4 py-16 md:px-8 md:py-24">
            <MetaNetworkExplorer
              layoutUrl="/api/public/worlds/layout"
              eyebrow="Metanetwork"
              title="境界設計室が繋ぐメタバースの世界"
              description="Boundary LAB が推奨するワールドの接続を公開メタネットワークとして可視化しています。匿名訪問でも構造を俯瞰でき、ログイン後はポータル内で継続的に探索できます。"
              emptyTitle="公開メタネットワークは準備中です。"
              emptyHint="おすすめワールドが公開されると、このエリアに接続グラフが表示されます。"
              emptyActionHref={isAuthenticated ? "/app/metanetwork" : "/login"}
              emptyActionLabel={isAuthenticated ? "マイページで開く" : "ログインして参加する"}
              onLayoutChange={setLayout}
              renderNodeCard={(node) => <PublicWorldCard key={node.id} node={node} />}
            />

            {featuredWorlds.length > 0 ? (
              <section className="mt-10">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
                      Recommended Worlds
                    </p>
                    <h3 className="mt-2 text-2xl font-semibold text-white">
                      おすすめワールド
                    </h3>
                  </div>
                  <Link
                    href={isAuthenticated ? "/app/discover" : "/login"}
                    className="hidden text-sm text-cyan-200 transition hover:text-cyan-100 md:inline-flex"
                  >
                    {isAuthenticated ? "Discover を開く" : "ログインして続きを見る"}
                  </Link>
                </div>
                <div className="mt-6 hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-3">
                  {featuredWorlds.map((node) => (
                    <PublicWorldCard key={node.id} node={node} />
                  ))}
                </div>
              </section>
            ) : null}
          </section>

          <section id="about" className="border-y border-white/10 bg-white/[0.03]">
            <div className="mx-auto max-w-7xl px-4 py-16 md:px-8 md:py-24">
              <div className="max-w-3xl">
                <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/70">About</p>
                <h2 className="mt-3 text-3xl font-semibold text-white md:text-4xl">
                  体験設計を事業運用までつなぐ
                </h2>
                <p className="mt-4 text-base leading-8 text-slate-300">
                  境界設計室 / Boundary LAB は、空間演出だけで終わらず、参加導線、継続率、
                  運営視点の可観測性まで含めて設計対象に置きます。
                </p>
              </div>

              <div className="mt-10 grid gap-4 md:grid-cols-3">
                <PillarCard
                  title="体験設計"
                  body="ワールド構成、回遊導線、ブランド表現を一つの体験として再設計します。"
                />
                <PillarCard
                  title="事業化支援"
                  body="イベント、コミュニティ、継続施策を運用可能な導線として組み込みます。"
                />
                <PillarCard
                  title="可視化と改善"
                  body="メタネットワーク、運営ダッシュボード、データ観測を改善ループに接続します。"
                />
              </div>
            </div>
          </section>

          <section id="works" className="mx-auto max-w-7xl px-4 py-16 md:px-8 md:py-24">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/70">Works</p>
                <h2 className="mt-3 text-3xl font-semibold text-white md:text-4xl">
                  支援領域
                </h2>
              </div>
              <p className="max-w-2xl text-sm leading-7 text-slate-400">
                複数プラットフォームを横断するポータル、イベント導線、ワールドレジストリを同時に扱い、
                断片化した参加体験を一つのブランド体験に束ねます。
              </p>
            </div>

            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              <WorkCard
                number="01"
                title="Portal Experience"
                body="認証、個人導線、イベント、コレクションを一つの参加導線に統合。"
              />
              <WorkCard
                number="02"
                title="Metaverse Mapping"
                body="おすすめワールドの関係性を可視化し、発見体験をブランド資産に変換。"
              />
              <WorkCard
                number="03"
                title="Operational Visibility"
                body="Enterprise 向け運営ダッシュボードとログ基盤で改善余地を見える化。"
              />
            </div>
          </section>
        </main>

        <footer
          id="contact"
          className="border-t border-white/10 bg-slate-950/80"
        >
          <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-3 md:px-8">
            <div>
              <p className="text-sm font-semibold text-white">境界設計室 / Boundary LAB</p>
              <p className="mt-2 text-sm leading-7 text-slate-400">
                メタバース空間の体験設計と事業化支援。
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Contact</p>
              <p className="mt-2 text-sm text-slate-400">
                portal.boundarylabo.com
              </p>
              <Link
                href={isAuthenticated ? "/app" : "/login"}
                className="mt-3 inline-flex text-sm text-cyan-200 transition hover:text-cyan-100"
              >
                {isAuthenticated ? "ポータルを開く" : "ログインページへ"}
              </Link>
            </div>
            <div>
              <p className="text-sm font-semibold text-white">SNS</p>
              <p className="mt-2 text-sm text-slate-400">公開準備中</p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

function MetricCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-card">
      <p className="text-sm uppercase tracking-[0.22em] text-cyan-200/70">{value}</p>
      <p className="mt-3 text-sm leading-7 text-slate-300">{label}</p>
    </div>
  );
}

function PillarCard({ title, body }: { title: string; body: string }) {
  return (
    <article className="rounded-[28px] border border-white/10 bg-slate-950/40 p-6 shadow-card">
      <p className="text-lg font-semibold text-white">{title}</p>
      <p className="mt-3 text-sm leading-7 text-slate-300">{body}</p>
    </article>
  );
}

function WorkCard({
  number,
  title,
  body,
}: {
  number: string;
  title: string;
  body: string;
}) {
  return (
    <article className="rounded-[28px] border border-cyan-500/20 bg-[linear-gradient(180deg,_rgba(8,145,178,0.14),_rgba(15,23,42,0.9))] p-6 shadow-card">
      <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/70">{number}</p>
      <h3 className="mt-3 text-xl font-semibold text-white">{title}</h3>
      <p className="mt-4 text-sm leading-7 text-slate-300">{body}</p>
    </article>
  );
}

function PublicWorldCard({ node }: { node: WorldLayoutNode }) {
  const platformLabel = PLATFORM_LABELS[node.platform];

  return (
    <article className="overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/55 shadow-card">
      <a href={node.url} target="_blank" rel="noreferrer" className="block aspect-[16/9] bg-slate-900">
        {node.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={node.thumbnail_url} alt={node.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-end bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_45%),linear-gradient(135deg,_rgba(15,23,42,1),_rgba(30,41,59,1))] p-4">
            <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs uppercase tracking-[0.24em] text-slate-200">
              {platformLabel}
            </span>
          </div>
        )}
      </a>
      <div className="space-y-3 p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-100">
            {platformLabel}
          </span>
          <span className="text-[11px] text-slate-500">公開おすすめ</span>
        </div>
        <h3 className="text-lg font-semibold text-white">{node.name}</h3>
        <p className="text-sm leading-7 text-slate-300">
          {node.description?.trim() || "説明は準備中です。"}
        </p>
        <div className="flex flex-wrap gap-2">
          {node.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-slate-300"
            >
              #{tag}
            </span>
          ))}
        </div>
        <a
          href={node.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/20"
        >
          ワールドを開く
        </a>
      </div>
    </article>
  );
}

function LogoMark() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 7h16" />
      <path d="M4 12h10" />
      <path d="M4 17h16" />
      <path d="m15 10 5 2-5 2" />
    </svg>
  );
}
