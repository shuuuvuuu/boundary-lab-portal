import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "境界設計室ポータル - 準備中",
  description: "境界設計室ポータルは現在公開準備中です。",
};

export default function ComingSoonPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-bg-primary">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.14),_transparent_28%),radial-gradient(circle_at_85%_18%,_rgba(8,145,178,0.16),_transparent_22%),linear-gradient(180deg,_rgba(15,23,42,1),_rgba(2,6,23,1))]" />
      <div className="absolute inset-x-0 top-0 h-64 bg-[linear-gradient(120deg,_rgba(34,211,238,0.10),_transparent_45%,_rgba(15,23,42,0)_75%)]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-5xl items-center px-6 py-16">
        <section className="w-full rounded-[32px] border border-white/10 bg-slate-950/50 p-8 shadow-card backdrop-blur md:p-12">
          <div className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs uppercase tracking-[0.32em] text-cyan-200/80">
                Boundary LAB Portal
              </p>
              <h1 className="mt-5 text-3xl font-semibold leading-tight text-white md:text-5xl">
                境界設計室ポータル
                <span className="mt-2 block text-cyan-200">準備中です</span>
              </h1>
              <p className="mt-6 max-w-xl text-sm leading-8 text-slate-300 md:text-base">
                現在、公開に向けた最終調整を進めています。
                <br />
                公開までしばらくお待ちください。
              </p>
            </div>

            <div className="flex justify-start lg:justify-end">
              {/* ブランドの空気感だけ残すための軽い静的アセット */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/coming-soon-mark.svg"
                alt=""
                className="h-28 w-28 opacity-90 md:h-36 md:w-36"
              />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
