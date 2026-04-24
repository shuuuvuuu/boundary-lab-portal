import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isGuestOpsEnabled, isOwnerEmail } from "@/lib/auth/owner-email";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const guestMode = isGuestOpsEnabled();
  const isOwner = isOwnerEmail(user?.email);

  // ゲストモード OFF の時は従来どおり owner 限定。
  if (!guestMode) {
    if (!user) {
      redirect("/login?next=/admin/ops");
    }
    if (!isOwner) {
      redirect("/");
    }
  }

  // ゲストモード ON の時は未ログインでも通す。
  // owner / ゲストの違いは header のラベルだけで表現する。
  const headerLabel = isOwner
    ? user?.email ?? "owner"
    : user?.email
      ? `${user.email} (guest)`
      : "guest (read-only)";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/60 px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight">Admin / Operations</h1>
          <span className="text-xs text-slate-400">{headerLabel}</span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
    </div>
  );
}
