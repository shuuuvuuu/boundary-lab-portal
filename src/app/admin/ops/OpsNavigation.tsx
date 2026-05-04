import Link from "next/link";

type OpsArea = "overview" | "rezona" | "portal" | "livekit" | "cross";

const ITEMS: Array<{ key: OpsArea; label: string; href: string }> = [
  { key: "overview", label: "All Services", href: "/admin/ops" },
  { key: "rezona", label: "rezona", href: "/admin/ops/rezona" },
  { key: "portal", label: "portal", href: "/admin/ops/portal" },
  { key: "livekit", label: "LiveKit", href: "/admin/ops/livekit" },
  { key: "cross", label: "Cross Tools", href: "/admin/ops/cross" },
];

export function OpsNavigation({ active }: { active: OpsArea }) {
  return (
    <nav className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
      {ITEMS.map((item) => {
        const selected = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            className={`rounded border px-3 py-1.5 text-sm transition ${
              selected
                ? "border-sky-500/40 bg-sky-500/10 text-sky-200"
                : "border-slate-800 bg-slate-900/40 text-slate-400 hover:text-slate-200"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
