import { PortalShell } from "@/components/PortalShell";
import { loadPortalShellData } from "@/lib/portal/load-shell-data";
import { resolvePortalEventsSubtab } from "@/lib/portal/navigation";

export const dynamic = "force-dynamic";

export default async function AppEventsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const portalData = await loadPortalShellData();
  if (!portalData) {
    return null;
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const subValue = resolvedSearchParams?.sub;

  return (
    <PortalShell
      {...portalData}
      initialTab="events"
      initialEventsSubtab={resolvePortalEventsSubtab(
        typeof subValue === "string" ? subValue : undefined,
      )}
    />
  );
}
