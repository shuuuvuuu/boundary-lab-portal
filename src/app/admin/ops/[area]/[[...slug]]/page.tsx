import Link from "next/link";
import { notFound } from "next/navigation";
import { parseCertTargets } from "@/lib/cert-checker";
import { parseTargets } from "@/lib/health-poller";
import { ActivityClient } from "../../ActivityClient";
import { AirdropEligibilityClient } from "../../AirdropEligibilityClient";
import { AudioStateClient } from "../../AudioStateClient";
import { CapabilityBar, type OpsService } from "../../CapabilityBar";
import { DeployEventsClient } from "../../DeployEventsClient";
import { JoinFrequencyClient } from "../../JoinFrequencyClient";
import { LifecycleClient } from "../../LifecycleClient";
import { JobsClient } from "../../JobsClient";
import { LogsOtelClient } from "../../LogsOtelClient";
import { MetricsClient } from "../../MetricsClient";
import { OpsNavigation } from "../../OpsNavigation";
import { ReconnectSpikesClient } from "../../ReconnectSpikesClient";
import { ServiceLogsClient } from "../../ServiceLogsClient";
import { TodosClient } from "../../TodosClient";
import { TracesOtelClient } from "../../TracesOtelClient";
import { UptimeClient } from "../../UptimeClient";
import { UsersClient } from "../../UsersClient";
import { VoiceDebugClient } from "../../VoiceDebugClient";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ area: string; slug?: string[] }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type LinkItem = { key: string; label: string; href: string };
type LifecycleServiceFilter = "all" | "rezona" | "portal" | "boundary";
type ServiceArea = OpsService | "boundary";

const SERVICE_AREAS = new Set(["rezona", "portal", "boundary", "livekit"]);

function firstSearchParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function healthServices(defaultFromQuery?: string | null) {
  const targets = parseTargets(process.env.HEALTH_CHECK_TARGETS);
  const httpServices = targets.map((t) => t.service);
  const certServices = parseCertTargets(process.env.CERT_CHECK_TARGETS).map(
    (host) => `cert:${host}`,
  );
  const services = [...httpServices, ...certServices];
  const fallback = httpServices.includes("boundary")
    ? "boundary"
    : (httpServices[0] ?? certServices[0] ?? "rezona");
  return {
    services,
    defaultService:
      defaultFromQuery && services.includes(defaultFromQuery) ? defaultFromQuery : fallback,
  };
}

function SegmentLinks({ items, active }: { items: LinkItem[]; active: string }) {
  return (
    <nav className="flex flex-wrap gap-2">
      {items.map((item) => {
        const selected = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            className={`rounded border px-3 py-1.5 text-xs transition ${
              selected
                ? "border-sky-500/40 bg-sky-500/10 text-sky-200"
                : "border-slate-800 bg-slate-900/40 text-slate-400 hover:text-slate-200"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <section className="rounded-lg border border-dashed border-slate-700 bg-slate-900/30 px-4 py-5">
      <h2 className="text-sm font-medium text-slate-200">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{body}</p>
    </section>
  );
}

function LifecycleStack({ service }: { service?: LifecycleServiceFilter }) {
  return (
    <div className="space-y-5">
      <LifecycleClient fixedService={service} />
      <ReconnectSpikesClient fixedService={service} />
      <JoinFrequencyClient fixedService={service} />
    </div>
  );
}

function serviceLinks(service: ServiceArea): LinkItem[] {
  if (service === "boundary") {
    return [{ key: "lifecycle", label: "Lifecycle", href: "/admin/ops/boundary/lifecycle" }];
  }
  if (service === "rezona") {
    return [
      { key: "overview", label: "Overview", href: "/admin/ops/rezona" },
      { key: "metrics", label: "Metrics", href: "/admin/ops/rezona/metrics" },
      { key: "lifecycle", label: "Lifecycle", href: "/admin/ops/rezona/lifecycle" },
      { key: "voice-debug", label: "Voice Debug", href: "/admin/ops/rezona/voice-debug" },
      { key: "audio-state", label: "Audio State", href: "/admin/ops/rezona/audio-state" },
      {
        key: "airdrop-eligibility",
        label: "Airdrop Eligibility",
        href: "/admin/ops/rezona/airdrop-eligibility",
      },
      { key: "users", label: "Users", href: "/admin/ops/rezona/users" },
      { key: "logs", label: "Logs", href: "/admin/ops/rezona/logs" },
    ];
  }
  if (service === "portal") {
    return [
      { key: "overview", label: "Overview", href: "/admin/ops/portal" },
      { key: "metrics", label: "Metrics", href: "/admin/ops/portal/metrics" },
      { key: "lifecycle", label: "Lifecycle", href: "/admin/ops/portal/lifecycle" },
      { key: "logs", label: "Logs", href: "/admin/ops/portal/logs" },
      { key: "web-vitals", label: "Web Vitals", href: "/admin/ops/portal/web-vitals" },
    ];
  }
  return [
    { key: "overview", label: "Overview", href: "/admin/ops/livekit" },
    { key: "webhooks", label: "Webhooks", href: "/admin/ops/livekit/webhooks" },
    { key: "rooms", label: "Rooms", href: "/admin/ops/livekit/rooms" },
  ];
}

function ServicePage({ service, view }: { service: ServiceArea; view: string }) {
  const links = serviceLinks(service);
  const active = view || "overview";

  if (!links.some((item) => item.key === active)) notFound();

  return (
    <div className="space-y-5">
      <OpsNavigation active={service} />
      {service !== "boundary" && <CapabilityBar service={service} />}
      <SegmentLinks items={links} active={active} />

      {service === "boundary" && active === "lifecycle" && <LifecycleStack service="boundary" />}

      {service === "rezona" && active === "overview" && (
        <>
          <Placeholder
            title="Voice Debug"
            body="Phase 3 で LiveKit token / publisher / subscriber の実デバッグ情報を接続します。"
          />
          <MetricsClient service="rezona" initialPanel="host" />
          <UsersClient />
          <ServiceLogsClient initialSource="rezona-server" />
          <DeployEventsClient embedded />
        </>
      )}
      {service === "rezona" && active === "metrics" && <MetricsClient service="rezona" />}
      {service === "rezona" && active === "lifecycle" && <LifecycleStack service="rezona" />}
      {service === "rezona" && active === "voice-debug" && <VoiceDebugClient />}
      {service === "rezona" && active === "audio-state" && <AudioStateClient />}
      {service === "rezona" && active === "airdrop-eligibility" && <AirdropEligibilityClient />}
      {service === "rezona" && active === "users" && <UsersClient />}
      {service === "rezona" && active === "logs" && (
        <ServiceLogsClient initialSource="rezona-server" />
      )}

      {service === "portal" && active === "overview" && (
        <>
          <MetricsClient service="portal" initialPanel="host" />
          <ServiceLogsClient initialSource="portal" />
          <Placeholder
            title="Web Vitals"
            body="Phase 3 で LCP / INP / CLS の受信テーブルと履歴グラフを接続します。"
          />
        </>
      )}
      {service === "portal" && active === "metrics" && <MetricsClient service="portal" />}
      {service === "portal" && active === "lifecycle" && <LifecycleStack service="portal" />}
      {service === "portal" && active === "logs" && <ServiceLogsClient initialSource="portal" />}
      {service === "portal" && active === "web-vitals" && (
        <Placeholder
          title="Web Vitals"
          body="LCP / INP / CLS の収集 UI は Phase 3 で追加します。"
        />
      )}

      {service === "livekit" && active === "overview" && (
        <>
          <Placeholder
            title="Webhook history"
            body="Phase 3 で LiveKit webhook 受信履歴とイベント分類を接続します。"
          />
          <MetricsClient service="rezona" initialPanel="rooms" />
        </>
      )}
      {service === "livekit" && active === "webhooks" && (
        <Placeholder
          title="Webhook history"
          body="room_started / participant_joined / track_published などの受信履歴をここに集約します。"
        />
      )}
      {service === "livekit" && active === "rooms" && (
        <MetricsClient service="rezona" initialPanel="rooms" />
      )}
    </div>
  );
}

const CROSS_LINKS: LinkItem[] = [
  { key: "activity", label: "Activity", href: "/admin/ops/cross/activity" },
  { key: "lifecycle", label: "Lifecycle", href: "/admin/ops/cross/lifecycle" },
  { key: "logs", label: "Logs", href: "/admin/ops/cross/logs" },
  { key: "traces", label: "Traces", href: "/admin/ops/cross/traces" },
  { key: "jobs", label: "Jobs", href: "/admin/ops/cross/jobs" },
  { key: "todos", label: "TODOs", href: "/admin/ops/cross/todos" },
  { key: "uptime", label: "Uptime", href: "/admin/ops/cross/uptime" },
  { key: "metrics", label: "Metrics history", href: "/admin/ops/cross/metrics" },
];

function LogsSourceTabs({ source }: { source: "otel" | "pino" }) {
  return (
    <div className="space-y-4">
      <SegmentLinks
        active={source}
        items={[
          { key: "otel", label: "OTel", href: "/admin/ops/cross/logs?source=otel" },
          { key: "pino", label: "Pino受信", href: "/admin/ops/cross/logs?source=pino" },
        ]}
      />
      {source === "otel" ? <LogsOtelClient /> : <ServiceLogsClient />}
    </div>
  );
}

function CrossPage({
  view,
  searchParams,
}: {
  view: string;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  if (!CROSS_LINKS.some((item) => item.key === view)) notFound();
  const source = firstSearchParam(searchParams.source) === "pino" ? "pino" : "otel";
  const subview = firstSearchParam(searchParams.subview);
  const { services, defaultService } = healthServices(firstSearchParam(searchParams.service));

  return (
    <div className="space-y-5">
      <OpsNavigation active="cross" />
      <SegmentLinks items={CROSS_LINKS} active={view} />
      {view === "activity" && <ActivityClient showDeploys={subview === "deploys"} />}
      {view === "lifecycle" && <LifecycleStack />}
      {view === "logs" && <LogsSourceTabs source={source} />}
      {view === "traces" && <TracesOtelClient />}
      {view === "jobs" && <JobsClient />}
      {view === "todos" && <TodosClient />}
      {view === "uptime" && <UptimeClient services={services} defaultService={defaultService} />}
      {view === "metrics" && <MetricsClient service="rezona" initialPanel="history" />}
    </div>
  );
}

export default async function OpsAreaPage({ params, searchParams }: PageProps) {
  const { area, slug = [] } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const view =
    slug[0] ?? (area === "cross" ? "activity" : area === "boundary" ? "lifecycle" : "overview");

  if (SERVICE_AREAS.has(area)) {
    return <ServicePage service={area as ServiceArea} view={view} />;
  }
  if (area === "cross") {
    return <CrossPage view={view} searchParams={resolvedSearchParams} />;
  }
  notFound();
}
