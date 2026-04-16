import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentProfile } from "@/lib/profiles/current-profile";
import { getPublicProfileMap } from "@/lib/profiles/public-profiles";
import type { Platform, WorldSummary } from "@/types/worlds";
import { summarizeWorldRow } from "./registry";
import { WORLD_SELECT, type WorldSelectRow } from "./select";

type ActivityCountRow = {
  hub_id: string;
  active_user_count: number;
};

type VisitStatRow = {
  hub_id: string;
  visit_count: number;
  last_visited_at: string | null;
};

type CollectionLinkRow = {
  collection_id: string;
  world_id: string;
};

type CalendarEventLinkRow = {
  title: string;
  starts_at: string;
  ends_at: string;
  is_public: boolean;
  world_id: string;
};

type FetchWorldSummariesOptions = {
  supabase: SupabaseClient;
  userId: string;
  platform?: Platform;
};

export async function fetchWorldSummaries({
  supabase,
  userId,
  platform,
}: FetchWorldSummariesOptions): Promise<WorldSummary[]> {
  let query = supabase.from("worlds").select(WORLD_SELECT).order("created_at", { ascending: false });

  if (platform) {
    query = query.eq("platform", platform);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return enrichWorldSummaries(supabase, userId, (data ?? []) as WorldSelectRow[]);
}

export async function enrichWorldSummaries(
  supabase: SupabaseClient,
  userId: string,
  rows: WorldSelectRow[],
): Promise<WorldSummary[]> {
  if (rows.length === 0) {
    return [];
  }

  const currentProfile = await getCurrentProfile(supabase).catch(() => null);
  const [profileMap, collectionMap, upcomingEventMap, activityMaps] = await Promise.all([
    getPublicProfileMap(
      supabase,
      rows
        .flatMap((row) => [row.added_by, ...(row.world_reviews ?? []).map((review) => review.user_id)])
        .filter((value): value is string => Boolean(value)),
    ),
    getWorldCollectionMap(supabase, rows.map((row) => row.id)),
    getWorldUpcomingEventMap(supabase, rows),
    getWorldActivityMaps(supabase, rows, currentProfile?.hubs_account_id ?? null),
  ]);

  const visitCountMap = activityMaps.visitCountMap;
  const lastVisitedMap = activityMaps.lastVisitedMap;

  return rows.map((row) =>
    summarizeWorldRow(row, {
      userId,
      addedByProfile: row.added_by ? profileMap.get(row.added_by) ?? null : null,
      reviewProfileMap: profileMap,
      currentUserVisitCount: row.external_id ? (visitCountMap.get(row.external_id) ?? 0) : 0,
      currentUserLastVisitedAt: row.external_id ? (lastVisitedMap.get(row.external_id) ?? null) : null,
      activeUserCount: row.external_id ? (activityMaps.activeUserCountMap.get(row.external_id) ?? 0) : 0,
      collectionIds: collectionMap.get(row.id) ?? [],
      upcomingEvent:
        pickUpcomingEvent(row.next_event_at, upcomingEventMap.get(row.id) ?? null) ?? null,
    }),
  );
}

async function getWorldActivityMaps(
  supabase: SupabaseClient,
  rows: WorldSelectRow[],
  hubsAccountId: string | null,
) {
  const hubIds = Array.from(
    new Set(
      rows
        .filter((row) => row.platform === "hubs" && row.external_id)
        .map((row) => row.external_id),
    ),
  );

  if (hubIds.length === 0) {
    return {
      activeUserCountMap: new Map<string, number>(),
      visitCountMap: new Map<string, number>(),
      lastVisitedMap: new Map<string, string | null>(),
    };
  }

  const [countsResult, visitsResult] = await Promise.all([
    supabase.rpc("get_world_active_user_counts", { target_hub_ids: hubIds }),
    supabase.rpc("get_world_visit_stats", {
      target_hubs_account_id: hubsAccountId,
      target_hub_ids: hubIds,
    }),
  ]);

  if (countsResult.error) {
    throw countsResult.error;
  }

  if (visitsResult.error) {
    throw visitsResult.error;
  }

  const activeUserCountMap = new Map<string, number>(
    ((countsResult.data ?? []) as ActivityCountRow[]).map((row) => [
      row.hub_id,
      Number(row.active_user_count) || 0,
    ]),
  );

  const visitCountMap = new Map<string, number>();
  const lastVisitedMap = new Map<string, string | null>();

  ((visitsResult.data ?? []) as VisitStatRow[]).forEach((row) => {
    visitCountMap.set(row.hub_id, Number(row.visit_count) || 0);
    lastVisitedMap.set(row.hub_id, row.last_visited_at ?? null);
  });

  return {
    activeUserCountMap,
    visitCountMap,
    lastVisitedMap,
  };
}

async function getWorldCollectionMap(supabase: SupabaseClient, worldIds: string[]) {
  const uniqueWorldIds = Array.from(new Set(worldIds));
  if (uniqueWorldIds.length === 0) {
    return new Map<string, string[]>();
  }

  const { data, error } = await supabase
    .from("collection_worlds")
    .select("collection_id, world_id")
    .in("world_id", uniqueWorldIds);

  if (error) {
    throw error;
  }

  const map = new Map<string, string[]>();
  ((data ?? []) as CollectionLinkRow[]).forEach((row) => {
    const bucket = map.get(row.world_id) ?? [];
    bucket.push(row.collection_id);
    map.set(row.world_id, bucket);
  });
  return map;
}

async function getWorldUpcomingEventMap(supabase: SupabaseClient, rows: WorldSelectRow[]) {
  const worldIds = rows.map((row) => row.id);
  if (worldIds.length === 0) {
    return new Map<string, WorldSummary["upcoming_event"]>();
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("calendar_events")
    .select("title, starts_at, ends_at, is_public, world_id")
    .in("world_id", worldIds)
    .gte("ends_at", nowIso)
    .order("starts_at", { ascending: true });

  if (error) {
    throw error;
  }

  const map = new Map<string, WorldSummary["upcoming_event"]>();
  ((data ?? []) as CalendarEventLinkRow[]).forEach((row) => {
    if (!row.world_id || map.has(row.world_id)) {
      return;
    }

    map.set(row.world_id, {
      title: row.title,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      is_public: row.is_public,
      source: "calendar",
    });
  });

  return map;
}

function pickUpcomingEvent(
  nextEventAt: string | null,
  linkedEvent: WorldSummary["upcoming_event"] | null,
): WorldSummary["upcoming_event"] | null {
  const now = Date.now();
  const manualEvent =
    nextEventAt && new Date(nextEventAt).getTime() >= now
      ? {
          title: null,
          starts_at: nextEventAt,
          ends_at: null,
          is_public: true,
          source: "world" as const,
        }
      : null;

  if (!manualEvent) {
    return linkedEvent;
  }

  if (!linkedEvent) {
    return manualEvent;
  }

  return new Date(manualEvent.starts_at).getTime() <= new Date(linkedEvent.starts_at).getTime()
    ? manualEvent
    : linkedEvent;
}
