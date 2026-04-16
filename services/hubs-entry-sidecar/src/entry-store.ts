import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Logger } from "./logger.js";
import type { ClosedReason, EntrySource, NormalizedPresence } from "./types.js";

type OpenEntry = {
  id: number;
  session_id: string;
};

type StaleEntry = {
  id: number;
  last_seen_at: string | null;
  entered_at: string;
};

export class EntryStore {
  private readonly supabase: SupabaseClient;

  constructor(
    supabaseUrl: string,
    serviceRoleKey: string,
    private readonly logger: Logger,
  ) {
    this.supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async verifyAccess(): Promise<void> {
    const { error } = await this.supabase.from("room_entry_events").select("id").limit(1);
    if (error) {
      throw new Error(`Supabase room_entry_events access check failed: ${error.message}`);
    }
  }

  async closeStaleOpenEntries(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await this.supabase
      .from("room_entry_events")
      .select("id,last_seen_at,entered_at")
      .is("left_at", null)
      .lt("entered_at", cutoff);

    if (error) throw new Error(`Failed to close stale open entries: ${error.message}`);

    let closed = 0;
    for (const row of (data ?? []) as StaleEntry[]) {
      const closedAt = row.last_seen_at ?? row.entered_at;
      const { error: updateError } = await this.supabase
        .from("room_entry_events")
        .update({
          left_at: closedAt,
          closed_reason: "stale_on_boot" satisfies ClosedReason,
        })
        .eq("id", row.id);

      if (updateError) {
        throw new Error(`Failed to close stale open entry ${row.id}: ${updateError.message}`);
      }
      closed += 1;
    }

    return closed;
  }

  async recordJoin(
    hubId: string,
    presence: NormalizedPresence,
    source: EntrySource,
    observedAt = new Date(),
  ): Promise<"inserted" | "existing"> {
    const existing = await this.findOpenEntry(hubId, presence.sessionId);
    if (existing) {
      await this.touchOpenEntry(existing.id, observedAt, presence);
      return "existing";
    }

    const { error } = await this.supabase.from("room_entry_events").insert({
      hub_id: hubId,
      session_id: presence.sessionId,
      reticulum_account_id: presence.reticulumAccountId,
      hubs_account_id: presence.reticulumAccountId,
      display_name: presence.displayName,
      anon_id: presence.anonId,
      entered_at: observedAt.toISOString(),
      last_seen_at: observedAt.toISOString(),
      source,
      meta_snapshot: presence.metaSnapshot,
    });

    if (!error) return "inserted";

    if (error.code === "23505") {
      this.logger.debug({ hub_id: hubId }, "duplicate open entry ignored");
      return "existing";
    }

    throw new Error(`Failed to insert room entry event: ${error.message}`);
  }

  async recordLeave(
    hubId: string,
    sessionId: string,
    reason: ClosedReason,
    observedAt = new Date(),
  ): Promise<"closed" | "missing"> {
    const existing = await this.findOpenEntry(hubId, sessionId);
    if (!existing) return "missing";

    const { error } = await this.supabase
      .from("room_entry_events")
      .update({
        left_at: observedAt.toISOString(),
        last_seen_at: observedAt.toISOString(),
        closed_reason: reason,
      })
      .eq("id", existing.id);

    if (error) throw new Error(`Failed to close room entry event: ${error.message}`);
    return "closed";
  }

  async reconcileOpenEntries(
    hubId: string,
    activeSessionIds: Set<string>,
    disconnectedAt: Date,
  ): Promise<number> {
    const { data, error } = await this.supabase
      .from("room_entry_events")
      .select("id,session_id")
      .eq("hub_id", hubId)
      .is("left_at", null);

    if (error) throw new Error(`Failed to load open room entries: ${error.message}`);

    let closed = 0;
    for (const row of (data ?? []) as OpenEntry[]) {
      if (activeSessionIds.has(row.session_id)) continue;

      const { error: updateError } = await this.supabase
        .from("room_entry_events")
        .update({
          left_at: disconnectedAt.toISOString(),
          last_seen_at: disconnectedAt.toISOString(),
          closed_reason: "reconnect_reconcile" satisfies ClosedReason,
        })
        .eq("id", row.id);

      if (updateError) {
        throw new Error(`Failed to reconcile room entry event: ${updateError.message}`);
      }
      closed += 1;
    }

    return closed;
  }

  private async findOpenEntry(hubId: string, sessionId: string): Promise<OpenEntry | null> {
    const { data, error } = await this.supabase
      .from("room_entry_events")
      .select("id,session_id")
      .eq("hub_id", hubId)
      .eq("session_id", sessionId)
      .is("left_at", null)
      .order("entered_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`Failed to find open room entry event: ${error.message}`);
    return (data as OpenEntry | null) ?? null;
  }

  private async touchOpenEntry(
    id: number,
    observedAt: Date,
    presence: NormalizedPresence,
  ): Promise<void> {
    const { error } = await this.supabase
      .from("room_entry_events")
      .update({
        last_seen_at: observedAt.toISOString(),
        reticulum_account_id: presence.reticulumAccountId,
        hubs_account_id: presence.reticulumAccountId,
        display_name: presence.displayName,
        anon_id: presence.anonId,
        meta_snapshot: presence.metaSnapshot,
      })
      .eq("id", id);

    if (error) throw new Error(`Failed to update open room entry event: ${error.message}`);
  }
}
