import Link from "next/link";
import { notFound } from "next/navigation";
import { getBlogPost, listBlogPosts } from "@/lib/blog/posts";

export const revalidate = 300;
export const dynamic = "force-static";

type Params = { slug: string };

export async function generateStaticParams(): Promise<Params[]> {
  const posts = await listBlogPosts();
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const post = await getBlogPost(slug);
  if (!post) return { title: "Not found" };
  return {
    title: `${post.title} — Boundary LAB Blog`,
    description: post.description,
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const post = await getBlogPost(slug);
  if (!post) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-slate-100">
      <header className="mb-8 border-b border-slate-800 pb-6">
        <p className="text-xs text-slate-500">{post.date}</p>
        <h1 className="mt-1 text-2xl font-semibold">{post.title}</h1>
        {post.description && (
          <p className="mt-2 text-sm text-slate-400">{post.description}</p>
        )}
        {post.tags.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            {post.tags.map((t) => `#${t}`).join(" ")}
          </p>
        )}
      </header>
      <article
        className="prose prose-invert max-w-none text-slate-200 [&_a]:text-sky-300 [&_h2]:mt-8 [&_h3]:mt-6 [&_pre]:bg-slate-950 [&_pre]:p-4 [&_pre]:rounded [&_code]:text-sky-200"
        dangerouslySetInnerHTML={{ __html: post.contentHtml }}
      />
      <footer className="mt-12 border-t border-slate-800 pt-6 text-sm text-slate-500">
        <Link href="/blog" className="hover:underline">
          記事一覧に戻る
        </Link>
      </footer>
    </main>
  );
}
