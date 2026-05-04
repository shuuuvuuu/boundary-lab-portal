import { redirect } from "next/navigation";
import { parseCertTargets } from "@/lib/cert-checker";
import { parseTargets } from "@/lib/health-poller";
import { CapabilityBar, type OpsService } from "./CapabilityBar";
import { OpsNavigation } from "./OpsNavigation";
import { SyncCheckClient } from "./SyncCheckClient";
import { UptimeClient } from "./UptimeClient";

export const dynamic = "force-dynamic";

type AdminOpsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstSearchParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function healthServices(): { services: string[]; defaultService: string } {
  const targets = parseTargets(process.env.HEALTH_CHECK_TARGETS);
  const httpServices = targets.map((t) => t.service);
  const certServices = parseCertTargets(process.env.CERT_CHECK_TARGETS).map(
    (host) => `cert:${host}`,
  );
  const services = [...httpServices, ...certServices];
  return {
    services,
    defaultService: httpServices.includes("boundary")
      ? "boundary"
      : httpServices[0] ?? certServices[0] ?? "rezona",
  };
}

function legacyRedirectTarget(tab: string, params: URLSearchParams): string | null {
  if (tab === "sync") return "/admin/ops";
  if (tab === "metrics") return "/admin/ops/rezona/metrics";
  if (tab === "users") return "/admin/ops/rezona/users";
  if (tab === "activity") return "/admin/ops/cross/activity";
  if (tab === "logs-otel") return "/admin/ops/cross/logs?source=otel";
  if (tab === "service-logs") return "/admin/ops/cross/logs?source=pino";
  if (tab === "traces-otel") return "/admin/ops/cross/traces";
  if (tab === "uptime") {
    const service = params.get("service");
    return service
      ? `/admin/ops/cross/uptime?service=${encodeURIComponent(service)}`
      : "/admin/ops/cross/uptime";
  }
  if (tab === "jobs") return "/admin/ops/cross/jobs";
  if (tab === "todos") return "/admin/ops/cross/todos";
  if (tab === "deploys") return "/admin/ops/cross/activity?subview=deploys";
  return null;
}

export default async function AdminOpsPage({ searchParams }: AdminOpsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const tab = firstSearchParam(resolvedSearchParams.tab);
  if (tab) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(resolvedSearchParams)) {
      if (typeof value === "string") params.set(key, value);
      else if (Array.isArray(value) && value[0]) params.set(key, value[0]);
    }
    const target = legacyRedirectTarget(tab, params);
    if (target) redirect(target);
  }

  const { services, defaultService } = healthServices();
  const opsServices: OpsService[] = ["rezona", "portal", "livekit"];

  return (
    <div className="space-y-5">
      <OpsNavigation active="overview" />
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-slate-200">Service capability matrix</h2>
        <div className="grid gap-3">
          {opsServices.map((service) => (
            <CapabilityBar key={service} service={service} />
          ))}
        </div>
      </section>
      <UptimeClient services={services} defaultService={defaultService} />
      <SyncCheckClient />
    </div>
  );
}
