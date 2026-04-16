export type SidecarConfig = {
  reticulumWsUrl: string;
  reticulumDbUrl: string;
  reticulumBotAccessKey: string;
  reticulumPermsToken: string | null;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  discordWebhookUrl: string | null;
  logLevel: string;
  reconnectMaxMs: number;
  healthPort: number;
  botDisplayName: string;
  hubsQuery: string;
};

const DEFAULT_HUBS_QUERY = `
  select hub_sid
  from hubs
  where hub_sid is not null
    and coalesce(entry_mode, 'open') not in ('deny', 'allow')
    and coalesce(soft_deleted, false) = false
`;

export function loadConfig(env = process.env): SidecarConfig {
  const required = [
    "RETICULUM_WS_URL",
    "RETICULUM_DB_URL",
    "RETICULUM_BOT_ACCESS_KEY",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ] as const;

  const missing = required.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return {
    reticulumWsUrl: normalizePhoenixSocketEndpoint(env.RETICULUM_WS_URL!),
    reticulumDbUrl: env.RETICULUM_DB_URL!,
    reticulumBotAccessKey: env.RETICULUM_BOT_ACCESS_KEY!,
    reticulumPermsToken: env.RETICULUM_PERMS_TOKEN ?? null,
    supabaseUrl: env.SUPABASE_URL!,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY!,
    discordWebhookUrl: env.DISCORD_ALERT_WEBHOOK_URL || env.DISCORD_WEBHOOK_URL || null,
    logLevel: env.SIDECAR_LOG_LEVEL ?? "info",
    reconnectMaxMs: parsePositiveInteger(env.SIDECAR_RECONNECT_MAX_MS, 60_000),
    healthPort: parsePositiveInteger(env.SIDECAR_HEALTH_PORT, 8080),
    botDisplayName: env.SIDECAR_BOT_DISPLAY_NAME ?? "entry-history-bot",
    hubsQuery: env.RETICULUM_HUBS_QUERY ?? DEFAULT_HUBS_QUERY,
  };
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizePhoenixSocketEndpoint(raw: string): string {
  const url = new URL(raw);
  url.search = "";

  if (url.pathname.endsWith("/websocket")) {
    url.pathname = url.pathname.slice(0, -"/websocket".length);
  }

  url.pathname = url.pathname.replace(/\/+$/, "");
  if (!url.pathname.endsWith("/socket")) {
    url.pathname = `${url.pathname}/socket`.replace(/\/{2,}/g, "/");
  }

  return url.toString().replace(/\/$/, "");
}
