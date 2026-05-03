"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityClient } from "./ActivityClient";
import { IssuesClient, type SentryServiceKey } from "./IssuesClient";
import { JobsClient } from "./JobsClient";
import { LogsClient } from "./LogsClient";
import { LogsOtelClient } from "./LogsOtelClient";
import { MetricsClient } from "./MetricsClient";
import { ServiceLogsClient } from "./ServiceLogsClient";
import { SyncCheckClient } from "./SyncCheckClient";
import { TodosClient } from "./TodosClient";
import { TracesClient } from "./TracesClient";
import { TracesOtelClient } from "./TracesOtelClient";
import { UptimeClient } from "./UptimeClient";
import { UsersClient } from "./UsersClient";
import { WebVitalsClient } from "./WebVitalsClient";

type TabKey =
  | "issues"
  | "sync"
  | "logs"
  | "logs-otel"
  | "service-logs"
  | "traces"
  | "traces-otel"
  | "web-vitals"
  | "activity"
  | "metrics"
  | "users"
  | "uptime"
  | "jobs"
  | "todos";

const SENTRY_PRIMARY_TABS: Array<{ key: TabKey; label: string }> = [
  { key: "issues", label: "未解決 Issues" },
];

const OTEL_TABS: Array<{ key: TabKey; label: string }> = [
  { key: "sync", label: "Sync" },
  { key: "logs-otel", label: "Logs (OTel)" },
  { key: "traces-otel", label: "Traces (OTel)" },
];

const SENTRY_SECONDARY_TABS: Array<{ key: TabKey; label: string }> = [
  { key: "logs", label: "Logs (Sentry)" },
  { key: "traces", label: "Traces" },
  { key: "web-vitals", label: "Web Vitals" },
];

const CORE_TABS: Array<{ key: TabKey; label: string }> = [
  { key: "activity", label: "Activity" },
  { key: "metrics", label: "Metrics" },
  { key: "users", label: "Users" },
  { key: "uptime", label: "Uptime" },
  { key: "jobs", label: "Jobs" },
  { key: "service-logs", label: "Logs (受信)" },
  { key: "todos", label: "TODOs" },
];

function buildTabs(showSentryTabs: boolean): Array<{ key: TabKey; label: string }> {
  return showSentryTabs
    ? [...SENTRY_PRIMARY_TABS, ...OTEL_TABS, ...SENTRY_SECONDARY_TABS, ...CORE_TABS]
    : [...OTEL_TABS, ...CORE_TABS];
}

const SENTRY_SERVICES: SentryServiceKey[] = ["rezona"];

function isSentryTab(tab: TabKey): boolean {
  return tab === "issues" || tab === "logs" || tab === "traces" || tab === "web-vitals";
}

function normalizeTab(raw: string | null | undefined, showSentryTabs: boolean): TabKey | null {
  if (raw === "issues") return showSentryTabs ? "issues" : "activity";
  if (raw === "sync") return "sync";
  if (raw === "logs") return showSentryTabs ? "logs" : "activity";
  if (raw === "logs-otel") return "logs-otel";
  if (raw === "service-logs") return "service-logs";
  if (raw === "traces") return showSentryTabs ? "traces" : "activity";
  if (raw === "traces-otel") return "traces-otel";
  if (raw === "web-vitals") return showSentryTabs ? "web-vitals" : "activity";
  if (raw === "activity") return "activity";
  if (raw === "metrics") return "metrics";
  if (raw === "users") return "users";
  if (raw === "uptime") return "uptime";
  if (raw === "jobs") return "jobs";
  if (raw === "todos") return "todos";
  return null;
}

function readInitialTab(showSentryTabs: boolean, fallbackRaw?: string | null): TabKey {
  if (typeof window === "undefined") return normalizeTab(fallbackRaw, showSentryTabs) ?? "activity";
  const url = new URL(window.location.href);
  const raw = url.searchParams.get("tab");
  const normalized = normalizeTab(raw, showSentryTabs);
  if (normalized) return normalized;
  const fallback = normalizeTab(fallbackRaw, showSentryTabs);
  if (fallback) return fallback;
  return "activity";
}

function readInitialService(fallback: SentryServiceKey): SentryServiceKey {
  if (typeof window === "undefined") return fallback;
  const url = new URL(window.location.href);
  const raw = url.searchParams.get("service");
  if (raw === "rezona") return "rezona";
  return fallback;
}

function writeQueryToUrl(tab: TabKey, service: SentryServiceKey): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (tab === "activity") {
    url.searchParams.delete("tab");
  } else {
    url.searchParams.set("tab", tab);
  }
  if (isSentryTab(tab) && service !== "rezona") {
    url.searchParams.set("service", service);
  } else {
    url.searchParams.delete("service");
  }
  window.history.replaceState(null, "", url.toString());
}

type OpsTabsProps = {
  healthServices: string[];
  defaultHealthService: string;
  showSentryTabs: boolean;
  /**
   * Sentry の `service` セレクタを表示するか。
   * rezona 用の env が未設定の時は false にする。
   */
  showSentryServiceSelector: boolean;
  initialTab?: string | null;
};

export function OpsTabs({
  healthServices,
  defaultHealthService,
  showSentryTabs,
  showSentryServiceSelector,
  initialTab,
}: OpsTabsProps) {
  const tabs = useMemo(() => buildTabs(showSentryTabs), [showSentryTabs]);
  const [active, setActive] = useState<TabKey>(() => readInitialTab(showSentryTabs, initialTab));
  const [service, setService] = useState<SentryServiceKey>("rezona");

  // hydration 後に URL から初期値を反映（SSR 差を避ける）
  useEffect(() => {
    setActive(readInitialTab(showSentryTabs, initialTab));
    if (showSentryServiceSelector) {
      setService(readInitialService("rezona"));
    } else {
      setService("rezona");
    }
  }, [initialTab, showSentryTabs, showSentryServiceSelector]);

  useEffect(() => {
    writeQueryToUrl(active, service);
  }, [active, service]);

  const handleSelectTab = useCallback((key: TabKey) => {
    setActive(key);
  }, []);

  const handleSelectService = useCallback((s: SentryServiceKey) => {
    setService(s);
  }, []);

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap items-center gap-3 border-b border-slate-800">
        <div className="flex gap-1">
          {tabs.map((tab) => {
            const isActive = tab.key === active;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleSelectTab(tab.key)}
                className={`-mb-px border-b-2 px-4 py-2 text-sm transition ${
                  isActive
                    ? "border-sky-400 text-slate-100"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Sentry タブ以外では service 選択は不要。rezona 用 env が無い場合も非表示。 */}
        {showSentryTabs &&
          isSentryTab(active) &&
          showSentryServiceSelector && (
          <div className="ml-auto flex items-center gap-2 pb-1 text-xs text-slate-400">
            <span>Sentry Service</span>
            <div className="flex rounded border border-slate-700 bg-slate-800 p-0.5">
              {SENTRY_SERVICES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSelectService(s)}
                  className={`rounded px-2 py-1 transition ${
                    service === s
                      ? "bg-slate-700 text-slate-100"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </nav>

      {showSentryTabs && active === "issues" && <IssuesClient service={service} />}
      {active === "sync" && <SyncCheckClient />}
      {showSentryTabs && active === "logs" && <LogsClient service={service} />}
      {active === "logs-otel" && <LogsOtelClient />}
      {active === "service-logs" && <ServiceLogsClient />}
      {showSentryTabs && active === "traces" && <TracesClient service={service} />}
      {active === "traces-otel" && <TracesOtelClient />}
      {showSentryTabs && active === "web-vitals" && <WebVitalsClient service={service} />}
      {active === "activity" && <ActivityClient />}
      {active === "metrics" && <MetricsClient />}
      {active === "users" && <UsersClient />}
      {active === "uptime" && (
        <UptimeClient services={healthServices} defaultService={defaultHealthService} />
      )}
      {active === "jobs" && <JobsClient />}
      {active === "todos" && <TodosClient />}
    </div>
  );
}
