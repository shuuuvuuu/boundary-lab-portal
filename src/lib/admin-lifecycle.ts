import { createClient } from "@supabase/supabase-js";

export type LifecycleService = "all" | "rezona" | "portal" | "boundary";

export const LIFECYCLE_SERVICES: LifecycleService[] = ["all", "rezona", "portal", "boundary"];

const SERVICE_RE = /^[a-zA-Z0-9_:.-]+$/;

export function parseLifecycleService(value: string | null): LifecycleService | null {
  if (!value) return "all";
  if (!SERVICE_RE.test(value) || value.length > 80) return null;
  if (value === "all" || value === "rezona" || value === "portal" || value === "boundary") {
    return value;
  }
  return null;
}

export function activityServiceFilter(service: LifecycleService): string[] | null {
  if (service === "all") return null;
  if (service === "rezona") return ["rezona"];
  if (service === "boundary") return ["boundary"];
  // portal は activity_events に server_event を書き込んでいないため空フィルタで 0 件返却
  return [];
}

export function sourceMatchesService(source: string, service: LifecycleService): boolean {
  if (service === "all") return true;
  if (service === "rezona") return source === "rezona" || source.startsWith("rezona-");
  if (service === "portal") return source === "portal" || source.startsWith("portal-");
  return source === "boundary" || source.startsWith("boundary-");
}

export function getLifecycleSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function stringField(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
  }
  return null;
}

export function lifecycleEventFromLog(message: string, context: unknown): string | null {
  const ctx = asRecord(context);
  const event = stringField(ctx, ["event", "event.name", "name", "message"]);
  if (event) return event;
  return message.includes("socket.reconnect.in_grace") ? "socket.reconnect.in_grace" : null;
}
