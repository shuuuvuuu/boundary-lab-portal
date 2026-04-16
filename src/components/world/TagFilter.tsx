"use client";

export function TagFilter({
  tags,
  selectedTag,
  query,
  onQueryChange,
  onSelect,
}: {
  tags: string[];
  selectedTag: string | null;
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (tag: string | null) => void;
}) {
  const normalizedQuery = query.trim().toLowerCase();
  const filteredTags = tags.filter((tag) => tag.toLowerCase().includes(normalizedQuery));

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">タグフィルタ</h3>
          <p className="text-xs text-slate-400">部分一致で候補を絞り込みます。</p>
        </div>
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="タグを検索"
          className="w-full rounded-xl border border-white/10 bg-bg-primary px-3 py-2 text-sm text-white outline-none transition focus:border-accent-primary focus:ring-1 focus:ring-accent-primary md:w-64"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={`rounded-full border px-3 py-1.5 text-xs transition ${
            selectedTag === null
              ? "border-accent-primary/40 bg-accent-primary/20 text-accent-soft"
              : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
          }`}
        >
          すべて
        </button>

        {filteredTags.length > 0 ? (
          filteredTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onSelect(tag)}
              className={`rounded-full border px-3 py-1.5 text-xs transition ${
                selectedTag === tag
                  ? "border-accent-primary/40 bg-accent-primary/20 text-accent-soft"
                  : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              #{tag}
            </button>
          ))
        ) : (
          <span className="text-xs text-slate-500">一致するタグはありません。</span>
        )}
      </div>
    </div>
  );
}
