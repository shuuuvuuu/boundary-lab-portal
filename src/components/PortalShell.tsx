"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  PORTAL_TAB_PATHS,
  isPortalEventsSubtabKey,
  isPortalTabKey,
  type TabKey,
} from "@/lib/portal/navigation";
import type { Profile } from "@/types/database";
import { PersonalTab } from "./PersonalTab";
import { AdminTab } from "./AdminTab";
import { DiscoverTab } from "./DiscoverTab";
import { EventsTab, type EventsSubtabKey } from "./EventsTab";
import { MetaNetworkTab } from "./MetaNetworkTab";

type TabDef = {
  key: TabKey;
  label: string;
  description: string;
  icon: React.ReactNode;
};

export function PortalShell({
  profile,
  email,
  canAccessAdmin,
  initialTab = "personal",
  initialEventsSubtab = "calendar",
}: {
  profile: Profile | null;
  email: string;
  canAccessAdmin: boolean;
  initialTab?: TabKey;
  initialEventsSubtab?: EventsSubtabKey;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [eventsSubtab, setEventsSubtab] = useState<EventsSubtabKey>(initialEventsSubtab);
  const isEnterprise = canAccessAdmin;
  const updateRouteState = (nextTab: TabKey, nextEventsSubtab = eventsSubtab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("tab");
    if (nextTab === "events") {
      params.set("sub", nextEventsSubtab);
    } else {
      params.delete("sub");
    }
    const href = params.size
      ? `${PORTAL_TAB_PATHS[nextTab]}?${params.toString()}`
      : PORTAL_TAB_PATHS[nextTab];
    router.replace(href, { scroll: false });
  };

  useEffect(() => {
    const nextTabParam = searchParams.get("tab");
    const tabFromPath =
      pathname === "/app"
        ? "personal"
        : Object.entries(PORTAL_TAB_PATHS).find(([, href]) => href === pathname)?.[0] ?? null;
    const nextTab =
      tabFromPath === "personal" && isPortalTabKey(nextTabParam)
        ? nextTabParam
        : tabFromPath && isPortalTabKey(tabFromPath)
          ? tabFromPath
          : isPortalTabKey(nextTabParam)
            ? nextTabParam
            : initialTab;
    setTab(nextTab);

    const nextSubtab = searchParams.get("sub");
    if (isPortalEventsSubtabKey(nextSubtab)) {
      setEventsSubtab(nextSubtab);
    } else if (nextTab === "events") {
      setEventsSubtab(initialEventsSubtab);
    }
  }, [initialEventsSubtab, initialTab, pathname, searchParams]);

  const tabs: TabDef[] = [
    {
      key: "personal",
      label: "マイページ",
      description: "プロフィール・カレンダー・Hubs アカウント",
      icon: <IconUser />,
    },
    {
      key: "discover",
      label: "ディスカバー",
      description: "クロスプラットフォームのおすすめワールド",
      icon: <IconCompass />,
    },
    {
      key: "events",
      label: "イベント",
      description: "カレンダー・コレクション・配信情報",
      icon: <IconCalendar />,
    },
    {
      key: "metanetwork",
      label: "メタネットワーク",
      description: "推薦ワールドの関係を 3D ワールドグラフで俯瞰",
      icon: <IconNetwork />,
    },
    ...(isEnterprise
      ? ([
          {
            key: "admin" as const,
            label: "運営ダッシュボード",
            description: "Feat-014 ルーム別運用統計",
            icon: <IconChart />,
          },
        ] satisfies TabDef[])
      : []),
  ];

  const active = tabs.find((t) => t.key === tab) ?? tabs[0];
  const displayName = profile?.display_name?.trim() || email.split("@")[0] || "Guest";
  const planLabel = profile?.plan_tier ?? "free";

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-white/5 bg-bg-secondary/60 md:flex">
        <div className="flex items-center gap-3 border-b border-white/5 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-primary/20 text-accent-soft">
            <IconLogo />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight">Portal</p>
            <p className="text-xs text-slate-400">Boundary LAB</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {tabs.map((t) => {
            const isActive = t.key === tab;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setTab(t.key);
                  updateRouteState(t.key);
                }}
                className={[
                  "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition",
                  isActive
                    ? "bg-accent-primary/15 text-white ring-1 ring-accent-primary/30"
                    : "text-slate-300 hover:bg-white/5",
                ].join(" ")}
              >
                <span className={isActive ? "mt-0.5 text-accent-soft" : "mt-0.5 text-slate-400"}>
                  {t.icon}
                </span>
                <span className="flex-1">
                  <span className="block font-medium">{t.label}</span>
                  <span className="mt-0.5 block text-xs text-slate-400">{t.description}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-white/5 p-4">
          <div className="flex items-center gap-3">
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt=""
                className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-white/10"
                onError={(event) => {
                  event.currentTarget.onerror = null;
                  event.currentTarget.src = "/brand/default-avatar.svg";
                }}
              />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-primary/20 text-sm font-bold text-accent-soft ring-1 ring-white/10">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{displayName}</p>
              <p className="truncate text-[10px] text-slate-400">{email}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-accent-primary/15 px-2 py-0.5 text-xs font-medium text-accent-soft">
              {planLabel}
            </span>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="text-xs text-slate-400 underline-offset-2 hover:text-white hover:underline"
              >
                サインアウト
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile topbar */}
        <header className="flex items-center justify-between border-b border-white/5 bg-bg-secondary/60 px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-primary/20 text-accent-soft">
              <IconLogo />
            </div>
            <span className="text-sm font-bold">Boundary LAB</span>
          </div>
          <form action="/auth/signout" method="post">
            <button type="submit" className="text-xs text-slate-400 underline">
              サインアウト
            </button>
          </form>
        </header>

        {/* Mobile tab bar */}
        <nav className="flex gap-2 overflow-x-auto border-b border-white/5 bg-bg-secondary/40 px-4 py-2 md:hidden">
          {tabs.map((t) => {
            const isActive = t.key === tab;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setTab(t.key);
                  updateRouteState(t.key);
                }}
                className={[
                  "shrink-0 rounded-full px-4 py-1.5 text-sm transition",
                  isActive ? "bg-accent-primary text-white" : "bg-white/5 text-slate-300",
                ].join(" ")}
              >
                {t.label}
              </button>
            );
          })}
        </nav>

        {/* Page header */}
        <div className="border-b border-white/5 px-6 py-6 md:px-10 md:py-8">
          <p className="text-xs uppercase tracking-widest text-slate-500">{active.label}</p>
          <h1 className="mt-1 text-2xl font-bold text-white md:text-3xl">
            {tab === "personal"
              ? `ようこそ、${displayName} さん`
              : tab === "events"
                ? "イベント"
              : tab === "metanetwork"
                ? "メタネットワーク"
              : tab === "discover"
                ? "ディスカバー"
                : "運営ダッシュボード"}
          </h1>
          <p className="mt-1 text-sm text-slate-400">{active.description}</p>
        </div>

        {/* Tab content */}
        <main className="flex-1 px-4 py-6 md:px-10 md:py-8">
          <div className={tab === "metanetwork" ? "mx-auto max-w-6xl" : "mx-auto max-w-5xl"}>
            {tab === "personal" && (
              <PersonalTab
                profile={profile}
                email={email}
                onOpenEventsCalendar={() => {
                  setTab("events");
                  setEventsSubtab("calendar");
                  updateRouteState("events", "calendar");
                }}
                canManageWorldCollections={isEnterprise}
              />
            )}
            {tab === "events" && (
              <EventsTab
                initialSubtab={eventsSubtab}
                onSubtabChange={(value) => {
                  setEventsSubtab(value);
                  updateRouteState("events", value);
                }}
              />
            )}
            {tab === "metanetwork" && <MetaNetworkTab />}
            {tab === "discover" && (
              <DiscoverTab
                canDeleteWorlds={profile?.plan_tier === "enterprise"}
                canManageCollections={isEnterprise}
              />
            )}
            {tab === "admin" && isEnterprise && <AdminTab />}
          </div>
        </main>
      </div>
    </div>
  );
}

function IconLogo() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function IconCompass() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polygon points="16 8 14 14 8 16 10 10 16 8" />
    </svg>
  );
}

function IconNetwork() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="6" cy="6" r="2.25" />
      <circle cx="18" cy="7" r="2.25" />
      <circle cx="12" cy="18" r="2.25" />
      <path d="M7.9 7.1 10.3 16" />
      <path d="M16.1 8.1 13.7 16" />
      <path d="M8.2 6.3h7.6" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2.5" x2="16" y2="6" />
      <line x1="8" y1="2.5" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <rect x="7" y="13" width="4" height="4" rx="0.5" />
    </svg>
  );
}
