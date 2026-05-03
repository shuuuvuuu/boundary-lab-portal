import { parseTargets } from "@/lib/health-poller";
import { parseCertTargets } from "@/lib/cert-checker";
import { isServiceConfigured } from "@/lib/sentry/client";
import { OpsTabs } from "./OpsTabs";

export const dynamic = "force-dynamic";

type AdminOpsPageProps = {
  searchParams?: Promise<{
    tab?: string | string[];
  }>;
};

function firstSearchParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function AdminOpsPage({ searchParams }: AdminOpsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialTab = firstSearchParam(resolvedSearchParams?.tab);
  const showSentryTabs = process.env.SENTRY_TABS_VISIBLE !== "false";
  const targets = parseTargets(process.env.HEALTH_CHECK_TARGETS);
  const httpServices = targets.map((t) => t.service);
  // cert:<host> 形式のサービスも同じ Uptime タブで選択できるようにする
  const certHosts = parseCertTargets(process.env.CERT_CHECK_TARGETS);
  const certServices = certHosts.map((h) => `cert:${h}`);
  const services = [...httpServices, ...certServices];

  // 「boundary」があればデフォルトはそれ。無ければ http 系の先頭、最後に cert を試す。
  const defaultService =
    httpServices.includes("boundary")
      ? "boundary"
      : httpServices[0] ?? certServices[0] ?? "rezona";

  // rezona の Sentry env が設定されている時のみ Service セレクタを表示する。
  // 未設定時はセレクタ自体を隠し、UI をスッキリ見せる。
  const rezonaSentryConfigured = showSentryTabs && isServiceConfigured("rezona");
  return (
    <OpsTabs
      healthServices={services}
      defaultHealthService={defaultService}
      showSentryTabs={showSentryTabs}
      showSentryServiceSelector={rezonaSentryConfigured}
      initialTab={initialTab}
    />
  );
}
