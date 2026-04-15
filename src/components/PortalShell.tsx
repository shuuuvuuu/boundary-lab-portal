"use client";

import { useState } from "react";
import type { Profile } from "@/types/database";
import { PersonalTab } from "./PersonalTab";
import { AdminTab } from "./AdminTab";

type TabKey = "personal" | "admin";

type TabDef = {
  key: TabKey;
  label: string;
  description: string;
  icon: React.ReactNode;
};

export function PortalShell({ profile, email }: { profile: Profile | null; email: string }) {
  const [tab, setTab] = useState<TabKey>("personal");
  const isEnterprise = profile?.plan_tier === "enterprise";

  const tabs: TabDef[] = [
    {
      key: "personal",
      label: "マイページ",
      description: "プロフィール・カレンダー・Hubs アカウント",
      icon: <IconUser />,
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
  const displayName = profile?.display_name?.trim() || email.split("@")[0];
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
            <p className="text-sm font-bold leading-tight">境界設計室</p>
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
                onClick={() => setTab(t.key)}
                className={[
                  "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition",
                  isActive
                    ? "bg-accent-primary/15 text-white ring-1 ring-accent-primary/30"
                    : "text-slate-300 hover:bg-white/5",
                ].join(" ")}
              >
                <span
                  className={
                    isActive ? "mt-0.5 text-accent-soft" : "mt-0.5 text-slate-400"
                  }
                >
                  {t.icon}
                </span>
                <span className="flex-1">
                  <span className="block font-medium">{t.label}</span>
                  <span className="mt-0.5 block text-xs text-slate-400">
                    {t.description}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-white/5 p-4">
          <p className="truncate text-xs text-slate-400">{email}</p>
          <div className="mt-1 flex items-center justify-between gap-2">
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
                onClick={() => setTab(t.key)}
                className={[
                  "shrink-0 rounded-full px-4 py-1.5 text-sm transition",
                  isActive
                    ? "bg-accent-primary text-white"
                    : "bg-white/5 text-slate-300",
                ].join(" ")}
              >
                {t.label}
              </button>
            );
          })}
        </nav>

        {/* Page header */}
        <div className="border-b border-white/5 px-6 py-6 md:px-10 md:py-8">
          <p className="text-xs uppercase tracking-widest text-slate-500">
            {active.label}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-white md:text-3xl">
            {tab === "personal" ? `ようこそ、${displayName} さん` : "運営ダッシュボード"}
          </h1>
          <p className="mt-1 text-sm text-slate-400">{active.description}</p>
        </div>

        {/* Tab content */}
        <main className="flex-1 px-4 py-6 md:px-10 md:py-8">
          <div className="mx-auto max-w-5xl">
            {tab === "personal" && <PersonalTab profile={profile} email={email} />}
            {tab === "admin" && isEnterprise && <AdminTab />}
          </div>
        </main>
      </div>
    </div>
  );
}

function IconLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}
