"use client";

type StarRatingProps = {
  value: number;
  readonly?: boolean;
  onChange?: (value: number) => void;
  size?: "sm" | "md";
};

function clamp(value: number) {
  return Math.max(0, Math.min(5, value));
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.27 3.91a1 1 0 0 0 .95.69h4.11c.969 0 1.371 1.24.588 1.81l-3.325 2.416a1 1 0 0 0-.364 1.118l1.27 3.91c.299.921-.755 1.688-1.54 1.118L10 15.347l-3.91 2.84c-.784.57-1.838-.197-1.539-1.118l1.27-3.91a1 1 0 0 0-.364-1.118L2.132 9.337c-.783-.57-.38-1.81.588-1.81h4.11a1 1 0 0 0 .95-.69l1.27-3.91Z" />
    </svg>
  );
}

function ReadonlyStar({
  fill,
  sizeClass,
}: {
  fill: number;
  sizeClass: string;
}) {
  return (
    <span className={`relative inline-flex ${sizeClass}`}>
      <StarIcon className={`${sizeClass} text-slate-600`} />
      <span
        className="absolute inset-0 overflow-hidden"
        style={{ width: `${Math.max(0, Math.min(100, fill * 100))}%` }}
      >
        <StarIcon className={`${sizeClass} text-star`} />
      </span>
    </span>
  );
}

export function StarRating({
  value,
  readonly = false,
  onChange,
  size = "md",
}: StarRatingProps) {
  const normalized = clamp(value);
  const sizeClass = size === "sm" ? "h-4 w-4" : "h-5 w-5";

  if (readonly || !onChange) {
    return (
      <span className="inline-flex items-center gap-0.5" aria-label={`${normalized} out of 5`}>
        {Array.from({ length: 5 }, (_, index) => (
          <ReadonlyStar
            key={index}
            fill={Math.max(0, Math.min(1, normalized - index))}
            sizeClass={sizeClass}
          />
        ))}
      </span>
    );
  }

  return (
    <div className="inline-flex items-center gap-1" role="radiogroup" aria-label="星評価">
      {Array.from({ length: 5 }, (_, index) => {
        const nextValue = index + 1;
        const active = normalized >= nextValue;

        return (
          <button
            key={nextValue}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${nextValue} 星`}
            onClick={() => onChange(nextValue)}
            className="rounded-sm text-slate-500 transition hover:text-star focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
          >
            <StarIcon className={`${sizeClass} ${active ? "text-star" : "text-slate-600"}`} />
          </button>
        );
      })}
    </div>
  );
}
