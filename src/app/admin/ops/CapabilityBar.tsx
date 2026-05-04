"use client";

import { useEffect, useMemo, useState } from "react";

export type OpsService = "rezona" | "portal" | "livekit";
type CapabilityName = "db" | "redis" | "livekit" | "otel";
type CapabilityState = "green" | "yellow" | "red" | "gray";

type CapabilitySnapshot = {
  service: OpsService;
  last_seen_at: string;
  capabilities: Record<string, CapabilityState>;
};

const SERVICE_LABELS: Record<OpsService, string> = {
  rezona: "rezona",
  portal: "portal",
  livekit: "LiveKit",
};

const MOCK_CAPABILITIES: Record<OpsService, Record<CapabilityName, CapabilityState>> = {
  rezona: { db: "green", redis: "green", livekit: "yellow", otel: "green" },
  portal: { db: "green", redis: "yellow", livekit: "red", otel: "green" },
  livekit: { db: "yellow", redis: "red", livekit: "green", otel: "yellow" },
};

export function mockCapability(service: OpsService): CapabilitySnapshot {
  return {
    service,
    last_seen_at: new Date(Date.now() - (service === "rezona" ? 45_000 : 180_000)).toISOString(),
    capabilities: MOCK_CAPABILITIES[service],
  };
}

function dotClass(state: CapabilityState): string {
  if (state === "green") return "bg-emerald-400";
  if (state === "yellow") return "bg-amber-400";
  if (state === "red") return "bg-red-400";
  return "bg-slate-500";
}

function isSnapshot(value: unknown, service: OpsService): value is CapabilitySnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.service === service &&
    typeof record.last_seen_at === "string" &&
    typeof record.capabilities === "object" &&
    record.capabilities !== null &&
    !Array.isArray(record.capabilities)
  );
}

function isStale(iso: string, now: number): boolean {
  const timestamp = Date.parse(iso);
  return Number.isNaN(timestamp) || now - timestamp >= 5 * 60_000;
}

function formatRelative(iso: string, now: number): string {
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return "data not available";
  const diffMs = Math.max(0, now - timestamp);
  if (diffMs >= 5 * 60_000) return "5 分以上経過 ⚠️";
  if (diffMs < 60_000) return `${Math.max(1, Math.floor(diffMs / 1000))} 秒前`;
  return `${Math.floor(diffMs / 60_000)} 分前`;
}

function useCapability(service: OpsService) {
  const [snapshot, setSnapshot] = useState<CapabilitySnapshot | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setNow(Date.now());
      try {
        const res = await fetch(`/api/admin/capability/${service}`, { cache: "no-store" });
        if (res.status === 404) {
          if (!cancelled) setSnapshot(null);
          return;
        }
        if (!res.ok) return;
        const json = (await res.json()) as unknown;
        if (!cancelled && isSnapshot(json, service)) setSnapshot(json);
      } catch {
        if (!cancelled) setSnapshot(null);
      }
    }

    void load();
    const timer = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [service]);

  return useMemo(() => {
    const stale = snapshot ? isStale(snapshot.last_seen_at, now) : false;
    return {
      snapshot: snapshot && !stale ? snapshot : mockCapability(service),
      isMock: !snapshot || stale,
      stale,
      now,
      sourceLastSeenAt: snapshot?.last_seen_at ?? null,
    };
  }, [now, service, snapshot]);
}

export function CapabilityBar({ service }: { service: OpsService }) {
  const { snapshot, isMock, stale, now, sourceLastSeenAt } = useCapability(service);
  const lastSeenLabel = stale && sourceLastSeenAt
    ? formatRelative(sourceLastSeenAt, now)
    : formatRelative(snapshot.last_seen_at, now);
  const badgeTitle = stale
    ? "data not available: latest service_capability snapshot is stale"
    : "data not available: using mock fallback";

  return (
    <section className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3 text-xs">
      <div className="text-sm font-medium text-slate-100">{SERVICE_LABELS[service]}</div>
      {isMock && (
        <span
          className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300"
          title={badgeTitle}
        >
          (mock)
        </span>
      )}
      <div className="font-mono text-slate-500">
        last_seen_at <span className="text-slate-300">{lastSeenLabel}</span>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-3">
        {(["db", "redis", "livekit", "otel"] as const).map((name) => (
          <span key={name} className="flex items-center gap-1.5 text-slate-400">
            <span
              className={`h-2.5 w-2.5 rounded-full ${dotClass(snapshot.capabilities[name] ?? "gray")}`}
            />
            {name}
          </span>
        ))}
      </div>
    </section>
  );
}
