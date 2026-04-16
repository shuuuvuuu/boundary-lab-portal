import { PortalShell } from "@/components/PortalShell";
import type { EventsSubtabKey } from "@/components/EventsTab";
import type { TabKey } from "@/components/PortalShell";
import { loadPortalShellData } from "@/lib/portal/load-shell-data";

export const dynamic = "force-dynamic";

function resolveTab(value: string | undefined): TabKey {
  if (
    value === "personal" ||
    value === "discover" ||
    value === "events" ||
    value === "metanetwork" ||
    value === "admin"
  ) {
    return value;
  }

  return "personal";
}

function resolveEventsSubtab(value: string | undefined): EventsSubtabKey {
  if (value === "calendar" || value === "collections" || value === "live") {
    return value;
  }

  return "calendar";
}

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const portalData = await loadPortalShellData();
  if (!portalData) return null;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const tabValue = resolvedSearchParams?.tab;
  const subValue = resolvedSearchParams?.sub;

  return (
    <PortalShell
      {...portalData}
      initialTab={resolveTab(typeof tabValue === "string" ? tabValue : undefined)}
      initialEventsSubtab={resolveEventsSubtab(
        typeof subValue === "string" ? subValue : undefined,
      )}
    />
  );
}
