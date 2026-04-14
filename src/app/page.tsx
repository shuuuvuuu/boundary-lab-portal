import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";
import { PortalShell } from "@/components/PortalShell";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  return <PortalShell profile={profile} email={user.email ?? ""} />;
}
