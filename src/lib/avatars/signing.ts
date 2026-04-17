import type { SupabaseClient } from "@supabase/supabase-js";

const AVATAR_BUCKET = "avatars";
const AVATAR_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;
const STORAGE_PATH_MARKERS = [
  `/storage/v1/object/public/${AVATAR_BUCKET}/`,
  `/storage/v1/object/sign/${AVATAR_BUCKET}/`,
  `/storage/v1/object/authenticated/${AVATAR_BUCKET}/`,
];

function resolveAvatarStoragePath(value: string | null) {
  const normalized = value?.trim();
  if (!normalized) {
    return { path: null, fallbackUrl: null };
  }

  if (/^https?:\/\//i.test(normalized)) {
    try {
      const url = new URL(normalized);
      for (const marker of STORAGE_PATH_MARKERS) {
        const markerIndex = url.pathname.indexOf(marker);
        if (markerIndex >= 0) {
          return {
            path: decodeURIComponent(url.pathname.slice(markerIndex + marker.length)),
            fallbackUrl: null,
          };
        }
      }
    } catch {
      return { path: null, fallbackUrl: normalized };
    }

    return { path: null, fallbackUrl: normalized };
  }

  const path = normalized.replace(/^\/+/, "").replace(/^avatars\//, "");
  return {
    path: path || null,
    fallbackUrl: null,
  };
}

export async function signAvatarUrl(
  supabase: SupabaseClient,
  value: string | null,
): Promise<string | null> {
  const { path, fallbackUrl } = resolveAvatarStoragePath(value);
  if (!path) {
    return fallbackUrl;
  }

  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(path, AVATAR_SIGNED_URL_TTL_SECONDS);

  if (error) {
    return fallbackUrl;
  }

  return data.signedUrl;
}

export async function signAvatarUrls<T extends { avatar_url: string | null }>(
  supabase: SupabaseClient,
  rows: T[],
): Promise<T[]> {
  const resolvedRows = rows.map((row) => ({
    row,
    ...resolveAvatarStoragePath(row.avatar_url),
  }));

  const uniquePaths = Array.from(
    new Set(
      resolvedRows
        .map((entry) => entry.path)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const signedEntries = await Promise.all(
    uniquePaths.map(async (path) => [path, await signAvatarUrl(supabase, path)] as const),
  );
  const signedMap = new Map(signedEntries);

  return resolvedRows.map(({ row, path, fallbackUrl }) => ({
    ...row,
    avatar_url: path ? (signedMap.get(path) ?? fallbackUrl ?? null) : fallbackUrl,
  }));
}
