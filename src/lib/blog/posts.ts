import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Phase A3: ブログ機能
 *
 * `content/blog/*.md` を読み込み、frontmatter (YAML 風シンプル形式) を解析する。
 * MDX や remark を導入すると依存が肥大化するので、自前で最低限の Markdown 変換を持つ。
 *
 * frontmatter の最低 set:
 *   ---
 *   title: 記事タイトル
 *   slug: my-post-slug          # 省略時はファイル名 (拡張子なし)
 *   date: 2026-04-28            # ISO 文字列、未来日は drafts として list に出さない
 *   description: 一覧用の要約文
 *   draft: false                # true なら一覧に出さない (slug 直アクセスは可能)
 *   tags: tag1,tag2
 *   ---
 */

const BLOG_DIR = path.join(process.cwd(), "content", "blog");

export type BlogPostMeta = {
  slug: string;
  title: string;
  date: string;
  description: string;
  tags: string[];
  draft: boolean;
};

export type BlogPost = BlogPostMeta & {
  contentMarkdown: string;
  contentHtml: string;
};

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const fmMatch = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/);
  if (!fmMatch) {
    return { meta: {}, body: raw };
  }
  const meta: Record<string, string> = {};
  for (const line of fmMatch[1].split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    meta[key] = value;
  }
  return { meta, body: fmMatch[2] };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 最小限の Markdown → HTML 変換。
 * - 見出し # / ## / ###
 * - リスト - / *
 * - 段落 (連続行は <p> でまとめる)
 * - インラインリンク [text](href)
 * - インラインコード `foo`
 * - コードブロック ```...```
 * - 太字 **bold**
 * 完璧ではないが、このサイトのブログ記事を綺麗に表示するには十分。
 */
export function renderMarkdown(input: string): string {
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let inList = false;
  let paragraphBuffer: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return;
    const text = paragraphBuffer.join(" ").trim();
    if (text) out.push(`<p>${inlineMd(text)}</p>`);
    paragraphBuffer = [];
  };

  const flushList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine;
    if (inCodeBlock) {
      if (line.trim().startsWith("```")) {
        inCodeBlock = false;
        out.push(`<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`);
        codeBuffer = [];
      } else {
        codeBuffer.push(line);
      }
      continue;
    }

    if (line.trim().startsWith("```")) {
      flushParagraph();
      flushList();
      inCodeBlock = true;
      continue;
    }

    if (/^#{1,6} /.test(line)) {
      flushParagraph();
      flushList();
      const m = line.match(/^(#{1,6})\s+(.*)$/);
      if (m) {
        const level = m[1].length;
        out.push(`<h${level}>${inlineMd(m[2])}</h${level}>`);
      }
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      flushParagraph();
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inlineMd(line.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }

    paragraphBuffer.push(line);
  }

  flushParagraph();
  flushList();
  if (inCodeBlock) {
    // 終端の ``` を忘れた時の救済
    out.push(`<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`);
  }

  return out.join("\n");
}

function inlineMd(text: string): string {
  // 順序: code → link → bold → 普通テキスト
  // インラインコード ``` の中はエスケープを優先するのでバックスラッシュ無し
  const parts: string[] = [];
  let i = 0;
  while (i < text.length) {
    const codeIdx = text.indexOf("`", i);
    if (codeIdx === -1) {
      parts.push(processNonCode(text.slice(i)));
      break;
    }
    parts.push(processNonCode(text.slice(i, codeIdx)));
    const closeIdx = text.indexOf("`", codeIdx + 1);
    if (closeIdx === -1) {
      parts.push(escapeHtml(text.slice(codeIdx)));
      break;
    }
    parts.push(`<code>${escapeHtml(text.slice(codeIdx + 1, closeIdx))}</code>`);
    i = closeIdx + 1;
  }
  return parts.join("");
}

function processNonCode(text: string): string {
  // link [text](href)
  let result = escapeHtml(text);
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_, label: string, href: string) => {
      // href は escapeHtml で & が &amp; 化されている。href をクリーンに戻す
      const cleanHref = href.replace(/&amp;/g, "&");
      return `<a href="${cleanHref}" rel="noreferrer">${label}</a>`;
    },
  );
  // bold
  result = result.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return result;
}

async function listMarkdownFiles(): Promise<string[]> {
  try {
    const entries = await fs.readdir(BLOG_DIR, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

function buildMeta(filename: string, fmMeta: Record<string, string>): BlogPostMeta {
  const baseSlug = filename.replace(/\.md$/, "");
  const slug = (fmMeta.slug ?? baseSlug).replace(/[^a-zA-Z0-9_-]/g, "");
  const title = fmMeta.title ?? baseSlug;
  const date = fmMeta.date ?? "1970-01-01";
  const description = fmMeta.description ?? "";
  const tags = (fmMeta.tags ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const draft = (fmMeta.draft ?? "false").toLowerCase() === "true";
  return { slug, title, date, description, tags, draft };
}

export async function listBlogPosts(): Promise<BlogPostMeta[]> {
  const files = await listMarkdownFiles();
  const posts: BlogPostMeta[] = [];
  for (const file of files) {
    const raw = await fs.readFile(path.join(BLOG_DIR, file), "utf8");
    const { meta } = parseFrontmatter(raw);
    const post = buildMeta(file, meta);
    if (post.draft) continue;
    posts.push(post);
  }
  // 新しい順
  return posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export async function getBlogPost(slug: string): Promise<BlogPost | null> {
  const files = await listMarkdownFiles();
  for (const file of files) {
    const raw = await fs.readFile(path.join(BLOG_DIR, file), "utf8");
    const { meta, body } = parseFrontmatter(raw);
    const post = buildMeta(file, meta);
    if (post.slug !== slug) continue;
    const html = renderMarkdown(body);
    return {
      ...post,
      contentMarkdown: body,
      contentHtml: html,
    };
  }
  return null;
}
