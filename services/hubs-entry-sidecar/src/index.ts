import { AlertClient } from "./alert.js";
import { loadConfig } from "./config.js";
import { EntryStore } from "./entry-store.js";
import { startHealthServer } from "./health.js";
import { createLogger } from "./logger.js";
import { ReticulumHubRepository } from "./reticulum-db.js";
import { HubsEntrySidecarClient } from "./sidecar-client.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const alertClient = new AlertClient(config.discordWebhookUrl, logger);
  const entryStore = new EntryStore(config.supabaseUrl, config.supabaseServiceRoleKey, logger);
  const hubs = new ReticulumHubRepository(config.reticulumDbUrl, config.hubsQuery, logger);

  await entryStore.verifyAccess();

  const staleClosed = await entryStore.closeStaleOpenEntries();
  if (staleClosed > 0) {
    logger.warn({ closed: staleClosed }, "closed stale open entries on boot");
    await alertClient.notify("warn", "closed stale open room entries on boot", {
      closed: staleClosed,
    });
  }

  const hubIds = await hubs.listPublicHubSids();
  logger.info({ hubs: hubIds.length }, "loaded public hubs from reticulum db");

  const client = new HubsEntrySidecarClient(config, entryStore, alertClient, logger);
  const healthServer = startHealthServer(config.healthPort, client, logger);

  let lastDisconnectAlertAt = 0;
  const heartbeat = setInterval(() => {
    const disconnectedSince = client.disconnectedSince();
    if (!disconnectedSince) return;

    const disconnectedMs = Date.now() - disconnectedSince.getTime();
    if (disconnectedMs < 120_000) return;
    if (Date.now() - lastDisconnectAlertAt < 15 * 60_000) return;

    lastDisconnectAlertAt = Date.now();
    void alertClient.notify("warn", "reticulum socket disconnected for more than 2 minutes", {
      disconnected_ms: disconnectedMs,
    });
  }, 60_000);

  client.connect(hubIds);

  const shutdown = async (signal: NodeJS.Signals) => {
    logger.info({ signal }, "shutting down");
    clearInterval(heartbeat);
    client.close();
    healthServer.close();
    await hubs.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error) => {
  const logger = createLogger(process.env.SIDECAR_LOG_LEVEL ?? "info");
  logger.fatal({ err: String(error) }, "hubs entry sidecar failed");
  process.exit(1);
});
