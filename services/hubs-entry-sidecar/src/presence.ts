import type { NormalizedPresence, PresenceEntry, PresenceMeta, PresenceState } from "./types.js";

export const HUB_SID_RE = /^[A-Za-z0-9]{7}$/;

export function normalizePresenceState(state: PresenceState): NormalizedPresence[] {
  return Object.entries(state).flatMap(([sessionId, entry]) => {
    const normalized = normalizePresence(sessionId, entry);
    return normalized ? [normalized] : [];
  });
}

export function normalizePresence(
  sessionId: string,
  entry: PresenceEntry | undefined,
): NormalizedPresence | null {
  const meta = latestMeta(entry);
  if (!meta || isSidecarPresence(meta)) return null;

  const reticulumAccountId = readAccountId(meta);
  const displayName = truncate(readDisplayName(meta), 64);

  return {
    sessionId,
    reticulumAccountId,
    displayName,
    anonId: reticulumAccountId ? null : sessionId,
    metaSnapshot: sanitizeMeta(meta),
  };
}

function latestMeta(entry: PresenceEntry | undefined): PresenceMeta | null {
  const metas = entry?.metas;
  if (!Array.isArray(metas) || metas.length === 0) return null;
  return metas[metas.length - 1] ?? null;
}

function isSidecarPresence(meta: PresenceMeta): boolean {
  const context = meta.context;
  if (context?.entry_history_sidecar === true) return true;
  if (context?.entryHistorySidecar === true) return true;
  const displayName = readDisplayName(meta);
  return displayName === "entry-history-bot";
}

function readAccountId(meta: PresenceMeta): string | null {
  const raw = meta.account_id ?? meta.profile?.id ?? meta.profile?.account_id ?? null;
  if (raw === null || raw === undefined) return null;
  const value = String(raw);
  return value.length > 0 && value.length <= 128 ? value : null;
}

function readDisplayName(meta: PresenceMeta): string | null {
  const raw = meta.profile?.displayName ?? meta.profile?.display_name ?? null;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function truncate(value: string | null, maxLength: number): string | null {
  if (!value) return null;
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}

function sanitizeMeta(meta: PresenceMeta): PresenceMeta {
  return JSON.parse(JSON.stringify(meta)) as PresenceMeta;
}
