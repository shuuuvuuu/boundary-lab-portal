"use client";

import { useCallback, useEffect, useState } from "react";
import { IssuesClient } from "./IssuesClient";
import { LogsClient } from "./LogsClient";

type TabKey = "issues" | "logs";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "issues", label: "未解決 Issues" },
  { key: "logs", label: "Logs" },
];

function readInitialTab(): TabKey {
  if (typeof window === "undefined") return "issues";
  const url = new URL(window.location.href);
  const raw = url.searchParams.get("tab");
  return raw === "logs" ? "logs" : "issues";
}

function writeTabToUrl(tab: TabKey): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (tab === "issues") {
    url.searchParams.delete("tab");
  } else {
    url.searchParams.set("tab", tab);
  }
  window.history.replaceState(null, "", url.toString());
}

export function OpsTabs() {
  const [active, setActive] = useState<TabKey>("issues");

  // hydration 後に URL から初期値を反映（SSR 差を避ける）
  useEffect(() => {
    setActive(readInitialTab());
  }, []);

  const handleSelect = useCallback((key: TabKey) => {
    setActive(key);
    writeTabToUrl(key);
  }, []);

  return (
    <div className="space-y-4">
      <nav className="flex gap-1 border-b border-slate-800">
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleSelect(tab.key)}
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
      </nav>

      {active === "issues" && <IssuesClient />}
      {active === "logs" && <LogsClient />}
    </div>
  );
}
