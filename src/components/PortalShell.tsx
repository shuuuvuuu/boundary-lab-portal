"use client";

import { useState } from "react";
import type { Profile } from "@/types/database";
import { PersonalTab } from "./PersonalTab";
import { AdminTab } from "./AdminTab";

type TabKey = "personal" | "admin";

export function PortalShell({ profile, email }: { profile: Profile | null; email: string }) {
  const [tab, setTab] = useState<TabKey>("personal");
  const isEnterprise = profile?.plan_tier === "enterprise";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-black px-6 py-3">
        <h1 className="text-lg font-bold">境界設計室 / Boundary LAB</h1>
        <div className="flex items-center gap-3 text-sm">
          <span>{profile?.display_name ?? email}</span>
          <form action="/auth/signout" method="post">
            <button type="submit" className="underline">
              サインアウト
            </button>
          </form>
        </div>
      </header>

      <nav className="flex border-b border-black">
        <TabButton active={tab === "personal"} onClick={() => setTab("personal")}>
          個人
        </TabButton>
        {isEnterprise && (
          <TabButton active={tab === "admin"} onClick={() => setTab("admin")}>
            運営
          </TabButton>
        )}
      </nav>

      <main className="flex-1 px-6 py-8">
        {tab === "personal" && <PersonalTab profile={profile} email={email} />}
        {tab === "admin" && isEnterprise && <AdminTab />}
      </main>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-6 py-3 text-sm ${active ? "bg-black text-white" : "bg-white text-black"}`}
    >
      {children}
    </button>
  );
}
