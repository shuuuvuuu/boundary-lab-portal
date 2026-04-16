export type EntrySource = "diff" | "snapshot" | "reconnect_reconcile" | "stale_on_boot";

export type ClosedReason = "leave_diff" | "reconnect_reconcile" | "stale_on_boot";

export type PresenceMeta = {
  phx_ref?: string;
  presence?: string;
  account_id?: string | number | null;
  profile?: {
    id?: string | number | null;
    account_id?: string | number | null;
    displayName?: string | null;
    display_name?: string | null;
    identityName?: string | null;
  } | null;
  context?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type PresenceEntry = {
  metas?: PresenceMeta[];
};

export type PresenceState = Record<string, PresenceEntry>;

export type PresenceDiff = {
  joins?: PresenceState;
  leaves?: PresenceState;
};

export type NormalizedPresence = {
  sessionId: string;
  reticulumAccountId: string | null;
  displayName: string | null;
  anonId: string | null;
  metaSnapshot: PresenceMeta;
};

export type HubRow = {
  hub_sid?: string;
  hub_id?: string;
  sid?: string;
};
