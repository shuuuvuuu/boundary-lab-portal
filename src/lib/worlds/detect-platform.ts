import type { Platform } from "@/types/worlds";

export type DetectedPlatform = {
  platform: Platform;
  externalId: string;
  normalizedUrl: string;
};

function parseInputUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed);
  } catch {
    try {
      return new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }
}

function findLastPathSegment(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  return segments.at(-1) ?? "";
}

function extractVrchatWorldId(url: URL) {
  const fromQuery = url.searchParams.get("worldId");
  if (fromQuery?.startsWith("wrld_")) return fromQuery;

  const match = url.pathname.match(/\/home\/world\/(wrld_[A-Za-z0-9_-]+)/i);
  if (match?.[1]) return match[1];

  return null;
}

export function detectPlatform(value: string): DetectedPlatform | null {
  const url = parseInputUrl(value);
  if (!url) return null;

  const normalizedUrl = url.toString();
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();

  if (
    host.includes("boundarylabo.com") ||
    host.includes("mozilla.hubs") ||
    path.includes("/hub/")
  ) {
    const externalId =
      url.pathname.match(/\/hub\/([^/?#]+)/i)?.[1] || findLastPathSegment(url.pathname) || normalizedUrl;
    return { platform: "hubs", externalId, normalizedUrl };
  }

  if (host.includes("vrchat.com")) {
    const worldId = extractVrchatWorldId(url);
    if (worldId) {
      return { platform: "vrchat", externalId: worldId, normalizedUrl };
    }
  }

  if (host.includes("spatial.io") && path.includes("/s/")) {
    const slug = url.pathname.match(/\/s\/([^/?#]+)/i)?.[1] || findLastPathSegment(url.pathname);
    return {
      platform: "spatial",
      externalId: slug || normalizedUrl,
      normalizedUrl,
    };
  }

  return {
    platform: "other",
    externalId: normalizedUrl,
    normalizedUrl,
  };
}
