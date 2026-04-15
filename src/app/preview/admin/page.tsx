import { notFound } from "next/navigation";
import { AdminTab } from "@/components/AdminTab";

export const metadata = { title: "Feat-014 プレビュー" };

const previewEnabled =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_ENABLE_ADMIN_PREVIEW === "1";

export default function AdminPreviewPage() {
  if (!previewEnabled) notFound();
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-black px-6 py-3">
        <h1 className="text-lg font-bold">
          境界設計室 / Boundary LAB — Feat-014 プレビュー
        </h1>
        <span className="text-xs text-neutral-600">
          認証バイパス中（プレビュー専用ルート）
        </span>
      </header>
      <main className="px-6 py-8">
        <AdminTab />
      </main>
    </div>
  );
}
