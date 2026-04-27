import Link from "next/link";
import { listBlogPosts } from "@/lib/blog/posts";

export const revalidate = 300;
export const dynamic = "force-static";

export const metadata = {
  title: "Boundary LAB Blog",
  description: "境界設計室 / Boundary LAB の運営日誌・技術メモ・連載",
};

export default async function BlogIndexPage() {
  const posts = await listBlogPosts();
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-slate-100">
      <header className="mb-8 border-b border-slate-800 pb-6">
        <h1 className="text-2xl font-semibold">境界 LAB Blog</h1>
        <p className="mt-2 text-sm text-slate-400">
          境界設計室の運営記録 / 技術メモ / 連載企画。記事は順次追加されます。
        </p>
      </header>
      {posts.length === 0 ? (
        <p className="text-sm text-slate-400">
          まだ公開された記事はありません。
        </p>
      ) : (
        <ul className="space-y-6">
          {posts.map((post) => (
            <li key={post.slug} className="border-b border-slate-800 pb-4">
              <Link
                href={`/blog/${post.slug}`}
                className="text-lg font-medium text-sky-300 hover:underline"
              >
                {post.title}
              </Link>
              <p className="mt-1 text-xs text-slate-500">{post.date}</p>
              {post.description && (
                <p className="mt-2 text-sm text-slate-300">{post.description}</p>
              )}
              {post.tags.length > 0 && (
                <p className="mt-1 text-xs text-slate-500">
                  {post.tags.map((t) => `#${t}`).join(" ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      <footer className="mt-12 border-t border-slate-800 pt-6 text-sm text-slate-500">
        <Link href="/" className="hover:underline">
          トップへ
        </Link>
      </footer>
    </main>
  );
}
