"use client";

import { useCallback, useEffect, useState } from "react";
import { IssuesClient, type SentryServiceKey } from "./IssuesClient";
import { LogsClient } from "./LogsClient";
import { UptimeClient } from "./UptimeClient";

type TabKey = "issues" | "logs" | "uptime";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "issues", label: "未解決 Issues" },
  { key: "logs", label: "Logs" },
  { key: "uptime", label: "Uptime" },
];

const SENTRY_SERVICES: SentryServiceKey[] = ["boundary", "rezona"];

function readInitialTab(): TabKey {
  if (typeof window === "undefined") return "issues";
  const url = new URL(window.location.href);
  const raw = url.searchParams.get("tab");
  if (raw === "logs") return "logs";
  if (raw === "uptime") return "uptime";
  return "issues";
}

function readInitialService(fallback: SentryServiceKey): SentryServiceKey {
  if (typeof window === "undefined") return fallback;
  const url = new URL(window.location.href);
  const raw = url.searchParams.get("service");
  if (raw === "rezona") return "rezona";
  if (raw === "boundary") return "boundary";
  return fallback;
}

function writeQueryToUrl(tab: TabKey, service: SentryServiceKey): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (tab === "issues") {
    url.searchParams.delete("tab");
  } else {
    url.searchParams.set("tab", tab);
  }
  if (service === "boundary") {
    url.searchParams.delete("service");
  } else {
    url.searchParams.set("service", service);
  }
  window.history.replaceState(null, "", url.toString());
}

export function OpsTabs({
  healthServices,
  defaultHealthService,
  showSentryServiceSelector,
}: {
  healthServices: string[];
  defaultHealthService: string;
  /**
   * Sentry の `service` セレクタ（boundary / rezona）を表示するか。
   * rezona 用の env が未設定の時は false にして boundary 単一運用にする。
   */
  showSentryServiceSelector: boolean;
}) {
  const [active, setActive] = useState<TabKey>("issues");
  const [service, setService] = useState<SentryServiceKey>("boundary");

  // hydration 後に URL から初期値を反映（SSR 差を避ける）
  useEffect(() => {
    setActive(readInitialTab());
    // rezona env が無効化されている時は URL ?service=rezona が指定されても
    // boundary に丸める（UI 混乱回避）。
    if (showSentryServiceSelector) {
      setService(readInitialService("boundary"));
    } else {
      setService("boundary");
    }
  }, [showSentryServiceSelector]);

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
          {TABS.map((tab) => {
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

        {/* Uptime タブは内部で service 選択を持つため、ここでは Sentry 用のみ表示。
            rezona 用 env が無い場合は boundary 単一運用なのでセレクタ自体を出さない。 */}
        {active !== "uptime" && showSentryServiceSelector && (
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

      {active === "issues" && <IssuesClient service={service} />}
      {active === "logs" && <LogsClient service={service} />}
      {active === "uptime" && (
        <UptimeClient services={healthServices} defaultService={defaultHealthService} />
      )}
    </div>
  );
}
