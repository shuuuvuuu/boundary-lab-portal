import { PortalShell } from "@/components/PortalShell";
import { loadPortalShellData } from "@/lib/portal/load-shell-data";
import {
  resolvePortalEventsSubtab,
  resolvePortalTab,
} from "@/lib/portal/navigation";

export const dynamic = "force-dynamic";

export default async function AppHomePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const portalData = await loadPortalShellData();
  if (!portalData) {
    return null;
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const tabValue = resolvedSearchParams?.tab;
  const subValue = resolvedSearchParams?.sub;

  return (
    <PortalShell
      {...portalData}
      initialTab={resolvePortalTab(typeof tabValue === "string" ? tabValue : undefined)}
      initialEventsSubtab={resolvePortalEventsSubtab(
        typeof subValue === "string" ? subValue : undefined,
      )}
    />
  );
}
