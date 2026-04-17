export type TabKey = "personal" | "discover" | "events" | "metanetwork" | "admin";

export type PortalEventsSubtabKey = "calendar" | "collections" | "live";

export const PORTAL_TAB_PATHS: Record<TabKey, string> = {
  personal: "/app",
  discover: "/app/discover",
  events: "/app/events",
  metanetwork: "/app/metanetwork",
  admin: "/app/admin",
};

export function isPortalTabKey(value: string | null | undefined): value is TabKey {
  return (
    value === "personal" ||
    value === "discover" ||
    value === "events" ||
    value === "metanetwork" ||
    value === "admin"
  );
}

export function resolvePortalTab(value: string | null | undefined): TabKey {
  return isPortalTabKey(value) ? value : "personal";
}

export function resolvePortalTabFromPathname(pathname: string): TabKey | null {
  const normalizedPathname = pathname.replace(/\/+$/, "") || "/";

  return (
    (Object.entries(PORTAL_TAB_PATHS).find(([, path]) => path === normalizedPathname)?.[0] as
      | TabKey
      | undefined) ?? null
  );
}

export function isPortalEventsSubtabKey(
  value: string | null | undefined,
): value is PortalEventsSubtabKey {
  return value === "calendar" || value === "collections" || value === "live";
}

export function resolvePortalEventsSubtab(
  value: string | null | undefined,
): PortalEventsSubtabKey {
  return isPortalEventsSubtabKey(value) ? value : "calendar";
}
