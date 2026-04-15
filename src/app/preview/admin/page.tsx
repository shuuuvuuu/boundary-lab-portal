import { notFound } from "next/navigation";
import { AdminTab } from "@/components/AdminTab";

export const metadata = { title: "Feat-014 プレビュー" };

const previewEnabled =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_ENABLE_ADMIN_PREVIEW === "1";

export default function AdminPreviewPage() {
  if (!previewEnabled) notFound();
  return (
    <div className="min-h-screen bg-bg-primary">
      <header className="flex items-center justify-between border-b border-white/5 bg-bg-secondary/60 px-6 py-4">
        <h1 className="text-base font-bold text-white">
          境界設計室 / Boundary LAB — Feat-014 プレビュー
        </h1>
        <span className="text-xs text-slate-400">認証バイパス中（プレビュー専用）</span>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <AdminTab />
      </main>
    </div>
  );
}
