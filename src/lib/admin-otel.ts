import { createClient } from "@supabase/supabase-js";

export type AdminOtelPeriod = "1h" | "7h" | "24h" | "all";

const PERIOD_MS: Record<Exclude<AdminOtelPeriod, "all">, number> = {
  "1h": 3600_000,
  "7h": 7 * 3600_000,
  "24h": 24 * 3600_000,
};

export function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !key) return null;

  return createClient(supabaseUrl, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function parseAdminOtelPeriod(raw: string | null): {
  period: AdminOtelPeriod;
  sinceIso: string | null;
} {
  if (raw === "all") return { period: "all", sinceIso: null };
  if (raw === "1h" || raw === "7h" || raw === "24h") {
    return {
      period: raw,
      sinceIso: new Date(Date.now() - PERIOD_MS[raw]).toISOString(),
    };
  }
  return {
    period: "24h",
    sinceIso: new Date(Date.now() - PERIOD_MS["24h"]).toISOString(),
  };
}

export function boundedInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = Number(raw);
  if (!Number.isInteger(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function isSafeFilterValue(value: string, maxLength = 120): boolean {
  return value.length > 0 && value.length <= maxLength && /^[a-zA-Z0-9_.:-]+$/.test(value);
}
