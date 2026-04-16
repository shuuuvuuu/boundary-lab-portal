import type { Platform } from "@/types/worlds";

export const PLATFORM_OPTIONS: Platform[] = ["hubs", "vrchat", "spatial", "other"];

export const PLATFORM_LABELS: Record<Platform, string> = {
  hubs: "Hubs",
  vrchat: "VRChat",
  spatial: "Spatial",
  other: "Other",
};

export const PLATFORM_BADGE_CLASSNAMES: Record<Platform, string> = {
  hubs: "border-emerald-500/30 bg-emerald-500/15 text-emerald-200",
  vrchat: "border-rose-500/30 bg-rose-500/15 text-rose-200",
  spatial: "border-violet-500/30 bg-violet-500/15 text-violet-200",
  other: "border-slate-500/30 bg-slate-500/15 text-slate-200",
};

export function isPlatform(value: string): value is Platform {
  return PLATFORM_OPTIONS.includes(value as Platform);
}
