"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityClient } from "./ActivityClient";
import { DeployEventsClient } from "./DeployEventsClient";
import { JobsClient } from "./JobsClient";
import { LogsOtelClient } from "./LogsOtelClient";
import { MetricsClient } from "./MetricsClient";
import { ServiceLogsClient } from "./ServiceLogsClient";
import { SyncCheckClient } from "./SyncCheckClient";
import { TodosClient } from "./TodosClient";
import { TracesOtelClient } from "./TracesOtelClient";
import { UptimeClient } from "./UptimeClient";
import { UsersClient } from "./UsersClient";

type TabKey =
  | "sync"
  | "logs-otel"
  | "service-logs"
  | "traces-otel"
  | "activity"
  | "metrics"
  | "users"
  | "uptime"
  | "jobs"
  | "deploys"
  | "todos";

const OTEL_TABS: Array<{ key: TabKey; label: string }> = [
  { key: "sync", label: "Sync" },
  { key: "logs-otel", label: "Logs (OTel)" },
  { key: "traces-otel", label: "Traces (OTel)" },
];

const CORE_TABS: Array<{ key: TabKey; label: string }> = [
  { key: "activity", label: "Activity" },
  { key: "metrics", label: "Metrics" },
  { key: "users", label: "Users" },
  { key: "uptime", label: "Uptime" },
  { key: "jobs", label: "Jobs" },
  { key: "deploys", label: "Deploys" },
  { key: "service-logs", label: "Logs (受信)" },
  { key: "todos", label: "TODOs" },
];

const TABS: Array<{ key: TabKey; label: string }> = [...OTEL_TABS, ...CORE_TABS];

function normalizeTab(raw: string | null | undefined): TabKey | null {
  if (raw === "sync") return "sync";
  if (raw === "logs-otel") return "logs-otel";
  if (raw === "service-logs") return "service-logs";
  if (raw === "traces-otel") return "traces-otel";
  if (raw === "activity") return "activity";
  if (raw === "metrics") return "metrics";
  if (raw === "users") return "users";
  if (raw === "uptime") return "uptime";
  if (raw === "jobs") return "jobs";
  if (raw === "deploys") return "deploys";
  if (raw === "todos") return "todos";
  return null;
}

function readInitialTab(fallbackRaw?: string | null): TabKey {
  if (typeof window === "undefined") return normalizeTab(fallbackRaw) ?? "activity";
  const url = new URL(window.location.href);
  const raw = url.searchParams.get("tab");
  const normalized = normalizeTab(raw);
  if (normalized) return normalized;
  const fallback = normalizeTab(fallbackRaw);
  if (fallback) return fallback;
  return "activity";
}

function writeQueryToUrl(tab: TabKey): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (tab === "activity") {
    url.searchParams.delete("tab");
  } else {
    url.searchParams.set("tab", tab);
  }
  url.searchParams.delete("service");
  window.history.replaceState(null, "", url.toString());
}

type OpsTabsProps = {
  healthServices: string[];
  defaultHealthService: string;
  initialTab?: string | null;
};

export function OpsTabs({
  healthServices,
  defaultHealthService,
  initialTab,
}: OpsTabsProps) {
  const tabs = useMemo(() => TABS, []);
  const [active, setActive] = useState<TabKey>(() => readInitialTab(initialTab));

  // hydration 後に URL から初期値を反映（SSR 差を避ける）
  useEffect(() => {
    setActive(readInitialTab(initialTab));
  }, [initialTab]);

  useEffect(() => {
    writeQueryToUrl(active);
  }, [active]);

  const handleSelectTab = useCallback((key: TabKey) => {
    setActive(key);
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
      </nav>

      {active === "sync" && <SyncCheckClient />}
      {active === "logs-otel" && <LogsOtelClient />}
      {active === "service-logs" && <ServiceLogsClient />}
      {active === "traces-otel" && <TracesOtelClient />}
      {active === "activity" && <ActivityClient />}
      {active === "metrics" && <MetricsClient />}
      {active === "users" && <UsersClient />}
      {active === "uptime" && (
        <UptimeClient services={healthServices} defaultService={defaultHealthService} />
      )}
      {active === "jobs" && <JobsClient />}
      {active === "deploys" && <DeployEventsClient />}
      {active === "todos" && <TodosClient />}
    </div>
  );
}
