export type OpsService = "rezona" | "portal" | "livekit";
type CapabilityName = "db" | "redis" | "livekit" | "otel";
type CapabilityState = "green" | "yellow" | "red";

type CapabilitySnapshot = {
  service: OpsService;
  last_seen_at: string;
  capabilities: Record<CapabilityName, CapabilityState>;
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
  // TODO(Phase 3): service_capability テーブルから service ごとの最新 snapshot を取得する。
  return {
    service,
    last_seen_at: new Date(Date.now() - (service === "rezona" ? 45_000 : 180_000)).toISOString(),
    capabilities: MOCK_CAPABILITIES[service],
  };
}

function dotClass(state: CapabilityState): string {
  if (state === "green") return "bg-emerald-400";
  if (state === "yellow") return "bg-amber-400";
  return "bg-red-400";
}

function formatJst(iso: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function CapabilityBar({ service }: { service: OpsService }) {
  const snapshot = mockCapability(service);

  return (
    <section className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3 text-xs">
      <div className="text-sm font-medium text-slate-100">{SERVICE_LABELS[service]}</div>
      <span
        className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300"
        title="Phase 3 で service_capability テーブルに接続予定。現在は mock データ"
      >
        mock
      </span>
      <div className="font-mono text-slate-500">
        last_seen_at <span className="text-slate-300">{formatJst(snapshot.last_seen_at)}</span>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-3">
        {(["db", "redis", "livekit", "otel"] as const).map((name) => (
          <span key={name} className="flex items-center gap-1.5 text-slate-400">
            <span
              className={`h-2.5 w-2.5 rounded-full ${dotClass(snapshot.capabilities[name])}`}
            />
            {name}
          </span>
        ))}
      </div>
    </section>
  );
}
