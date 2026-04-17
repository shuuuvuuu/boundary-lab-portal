import { PortalShell } from "@/components/PortalShell";
import { loadPortalShellData } from "@/lib/portal/load-shell-data";

export const dynamic = "force-dynamic";

export default async function AppAdminPage() {
  const portalData = await loadPortalShellData();
  if (!portalData) {
    return null;
  }

  return <PortalShell {...portalData} initialTab="admin" />;
}
