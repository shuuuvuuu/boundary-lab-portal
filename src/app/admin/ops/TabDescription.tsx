"use client";

/**
 * 各タブの上部に「このタブで何を見るか」を 1〜2 文で説明する小コンポーネント。
 * 監視タブが 4 つ以上に増えてきたので、一覧性確保のため共通化。
 */
export function TabDescription({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-slate-800 bg-slate-900/30 px-4 py-2 text-xs leading-relaxed text-slate-400">
      {children}
    </p>
  );
}
