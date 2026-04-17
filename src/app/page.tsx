import { PublicMetaNetworkShell } from "@/components/PublicMetaNetworkShell";
import { loadPortalShellData } from "@/lib/portal/load-shell-data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const portalData = await loadPortalShellData();
  return <PublicMetaNetworkShell isAuthenticated={Boolean(portalData)} />;
}
