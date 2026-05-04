import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type CapabilityState = "green" | "yellow" | "red" | "gray";
export type CapabilitySnapshot = {
  service: string;
  last_seen_at: string;
  capabilities: Record<string, CapabilityState>;
};

type CapabilityRow = {
  service: string;
  last_seen_at: string;
  capabilities: Record<string, CapabilityState>;
};

export function getSupabaseCapabilityClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function getCapabilityIngestToken(): string | null {
  return (
    process.env.PORTAL_CAPABILITY_INGEST_TOKEN ??
    process.env.PORTAL_LOG_INGEST_TOKEN ??
    process.env.REZONA_INTERNAL_SECRET ??
    process.env.BOUNDARY_INTERNAL_SECRET ??
    null
  );
}

export async function getCapabilitySnapshot(
  service: string,
  client = getSupabaseCapabilityClient(),
): Promise<CapabilitySnapshot | null> {
  if (!client) throw new Error("supabase service role not configured");

  const { data, error } = await client
    .from("service_capability")
    .select("service, last_seen_at, capabilities")
    .eq("service", service)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as CapabilityRow;
  return {
    service: row.service,
    last_seen_at: row.last_seen_at,
    capabilities: row.capabilities,
  };
}

export async function upsertCapabilitySnapshot(
  snapshot: CapabilitySnapshot,
  client = getSupabaseCapabilityClient(),
): Promise<void> {
  if (!client) throw new Error("supabase service role not configured");

  const { error } = await client
    .from("service_capability")
    .upsert(
      {
        service: snapshot.service,
        last_seen_at: snapshot.last_seen_at,
        capabilities: snapshot.capabilities,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "service" },
    );

  if (error) throw new Error(error.message);
}
