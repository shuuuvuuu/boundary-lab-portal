import * as phoenix from "phoenix";
import WebSocket from "ws";
import type { AlertClient } from "./alert.js";
import { maskHubId, maskSessionId } from "./alert.js";
import type { SidecarConfig } from "./config.js";
import type { EntryStore } from "./entry-store.js";
import type { Logger } from "./logger.js";
import { generatePermsToken } from "./perms-token.js";
import { normalizePresence, normalizePresenceState } from "./presence.js";
import type { EntrySource, PresenceDiff, PresenceState } from "./types.js";

type PhoenixChannel = ReturnType<InstanceType<typeof phoenix.Socket>["channel"]>;
const PERMS_TOKEN_REFRESH_MS = 6 * 60 * 60 * 1000;
const JOIN_FAILURE_ALERT_THROTTLE_MS = 15 * 60 * 1000;

export class HubsEntrySidecarClient {
  private readonly socket: InstanceType<typeof phoenix.Socket>;
  private readonly channels = new Map<string, PhoenixChannel>();
  private readonly joinRetryAttempts = new Map<string, number>();
  private readonly joinRetryTimers = new Map<string, NodeJS.Timeout>();
  private readonly joinFailureAlertAt = new Map<string, number>();
  private readonly permsTokenRefreshTimer: NodeJS.Timeout;
  private permsToken: string;
  private disconnectedAt: Date | null = new Date();
  private lastDisconnectedAt: Date | null = new Date();
  private everOpened = false;
  private readonly reconnectSnapshotPendingHubs = new Set<string>();
  private firstStartedAt = new Date();

  constructor(
    private readonly config: SidecarConfig,
    private readonly entryStore: EntryStore,
    private readonly alertClient: AlertClient,
    private readonly logger: Logger,
  ) {
    this.permsToken = generatePermsToken(config.reticulumBotAccessKey);
    this.permsTokenRefreshTimer = setInterval(() => {
      try {
        this.permsToken = generatePermsToken(this.config.reticulumBotAccessKey);
        this.logger.debug("refreshed reticulum perms token");
      } catch (error) {
        this.logger.error({ err: String(error) }, "failed to refresh reticulum perms token");
      }
    }, PERMS_TOKEN_REFRESH_MS);
    this.permsTokenRefreshTimer.unref?.();

    this.socket = new phoenix.Socket(config.reticulumWsUrl, {
      transport: WebSocket,
      params: { vsn: "2.0.0" },
      reconnectAfterMs: (tries: number) =>
        Math.min(config.reconnectMaxMs, Math.round(1000 * 2 ** Math.max(0, tries - 1))),
    });

    this.socket.onOpen(() => {
      this.logger.info("reticulum socket opened");
      if (this.everOpened) {
        for (const hubId of this.channels.keys()) {
          this.reconnectSnapshotPendingHubs.add(hubId);
        }
      }
      this.everOpened = true;
      this.disconnectedAt = null;
    });

    this.socket.onClose(() => {
      this.logger.warn("reticulum socket closed");
      this.disconnectedAt = new Date();
      this.lastDisconnectedAt = this.disconnectedAt;
    });

    this.socket.onError((error: unknown) => {
      this.logger.error({ err: String(error) }, "reticulum socket error");
      this.disconnectedAt ??= new Date();
      this.lastDisconnectedAt ??= this.disconnectedAt;
    });
  }

  connect(hubIds: string[]): void {
    this.socket.connect();
    for (const hubId of hubIds) {
      this.joinHub(hubId);
    }
  }

  close(): void {
    clearInterval(this.permsTokenRefreshTimer);

    for (const timer of this.joinRetryTimers.values()) {
      clearTimeout(timer);
    }
    this.joinRetryTimers.clear();

    for (const channel of this.channels.values()) {
      channel.leave();
    }
    this.socket.disconnect();
  }

  isSocketOpen(): boolean {
    return this.disconnectedAt === null;
  }

  disconnectedSince(): Date | null {
    return this.disconnectedAt;
  }

  channelCount(): number {
    return this.channels.size;
  }

  private joinHub(hubId: string): void {
    const existing = this.channels.get(hubId);
    if (existing) {
      existing.leave();
      this.channels.delete(hubId);
    }

    const channel = this.socket.channel(`hub:${hubId}`, this.joinPayload());
    this.channels.set(hubId, channel);

    channel.on("presence_state", (state: PresenceState) => {
      void this.handlePresenceState(hubId, state).catch((error) => {
        this.logger.error(
          { err: String(error), hub_id: maskHubId(hubId) },
          "presence_state failed",
        );
      });
    });

    channel.on("presence_diff", (diff: PresenceDiff) => {
      void this.handlePresenceDiff(hubId, diff).catch((error) => {
        this.logger.error({ err: String(error), hub_id: maskHubId(hubId) }, "presence_diff failed");
      });
    });

    channel
      .join()
      .receive("ok", () => {
        this.joinRetryAttempts.delete(hubId);
        this.logger.info({ hub_id: maskHubId(hubId) }, "joined hub channel");
      })
      .receive("error", (reason: unknown) => {
        void this.handleJoinFailure(hubId, reason).catch((error) => this.failFast(error));
      })
      .receive("timeout", () => {
        void this.handleJoinFailure(hubId, "timeout").catch((error) => this.failFast(error));
      });
  }

  private joinPayload(): Record<string, unknown> {
    return {
      profile: {
        displayName: this.config.botDisplayName,
      },
      context: {
        mobile: false,
        hmd: false,
        discord: true,
        entry_history_sidecar: true,
      },
      perms_token: this.permsToken,
    };
  }

  private async handlePresenceState(hubId: string, state: PresenceState): Promise<void> {
    const observedAt = new Date();
    const isReconnectSnapshot = this.reconnectSnapshotPendingHubs.has(hubId);
    const source: EntrySource = isReconnectSnapshot ? "reconnect_reconcile" : "snapshot";
    const presences = normalizePresenceState(state);
    const activeSessionIds = new Set(presences.map((presence) => presence.sessionId));

    for (const presence of presences) {
      await this.entryStore.recordJoin(hubId, presence, source, observedAt);
    }

    if (source === "reconnect_reconcile") {
      const disconnectedAt = this.lastDisconnectedAt ?? observedAt;
      const closed = await this.entryStore.reconcileOpenEntries(
        hubId,
        activeSessionIds,
        disconnectedAt,
      );
      if (closed > 0) {
        this.logger.info({ hub_id: maskHubId(hubId), closed }, "reconciled missing leave events");
      }
    }

    this.reconnectSnapshotPendingHubs.delete(hubId);
    this.logger.debug(
      { hub_id: maskHubId(hubId), count: presences.length, source },
      "presence snapshot processed",
    );
  }

  private async handlePresenceDiff(hubId: string, diff: PresenceDiff): Promise<void> {
    const observedAt = new Date();

    for (const [sessionId, entry] of Object.entries(diff.joins ?? {})) {
      const presence = normalizePresence(sessionId, entry);
      if (!presence) continue;
      await this.entryStore.recordJoin(hubId, presence, "diff", observedAt);
    }

    for (const [sessionId, entry] of Object.entries(diff.leaves ?? {})) {
      if (!normalizePresence(sessionId, entry)) continue;
      const result = await this.entryStore.recordLeave(hubId, sessionId, "leave_diff", observedAt);
      if (result === "missing") {
        this.logger.debug(
          { hub_id: maskHubId(hubId), session_id: maskSessionId(sessionId) },
          "leave without open entry ignored",
        );
      }
    }
  }

  private async handleJoinFailure(hubId: string, reason: unknown): Promise<void> {
    const message = "failed to join hub channel";
    const meta = { hub_id: maskHubId(hubId), reason: sanitizeReason(reason) };
    this.logger.error(meta, message);
    await this.notifyJoinFailureAlert(hubId, message, meta);

    const withinFailFastWindow = Date.now() - this.firstStartedAt.getTime() < 180_000;
    if (withinFailFastWindow && looksAuthRelated(reason)) {
      await this.alertClient.notify("error", "reticulum bot authentication failed", {
        hub_id: maskHubId(hubId),
      });
      throw new Error("Reticulum bot authentication failed during startup");
    }

    this.scheduleJoinRetry(hubId);
  }

  private async notifyJoinFailureAlert(
    hubId: string,
    message: string,
    meta: Record<string, unknown>,
  ): Promise<void> {
    const now = Date.now();
    const lastAlertAt = this.joinFailureAlertAt.get(hubId) ?? 0;
    if (now - lastAlertAt < JOIN_FAILURE_ALERT_THROTTLE_MS) {
      this.logger.debug({ hub_id: maskHubId(hubId) }, "suppressed duplicate join failure alert");
      return;
    }

    this.joinFailureAlertAt.set(hubId, now);
    await this.alertClient.notify("warn", message, meta);
  }

  private failFast(error: unknown): void {
    this.logger.fatal({ err: String(error) }, "fatal channel join failure");
    process.exit(1);
  }

  private scheduleJoinRetry(hubId: string): void {
    if (this.joinRetryTimers.has(hubId)) return;

    const nextAttempt = (this.joinRetryAttempts.get(hubId) ?? 0) + 1;
    this.joinRetryAttempts.set(hubId, nextAttempt);
    const delayMs = Math.min(
      this.config.reconnectMaxMs,
      Math.round(1000 * 2 ** Math.max(0, nextAttempt - 1)),
    );

    this.logger.warn({ hub_id: maskHubId(hubId), delay_ms: delayMs }, "scheduling hub rejoin");
    const timer = setTimeout(() => {
      this.joinRetryTimers.delete(hubId);
      this.joinHub(hubId);
    }, delayMs);
    this.joinRetryTimers.set(hubId, timer);
  }
}

function looksAuthRelated(reason: unknown): boolean {
  const text = sanitizeReason(reason).toLowerCase();
  return (
    text.includes("auth") ||
    text.includes("unauthorized") ||
    text.includes("forbidden") ||
    text.includes("join_denied") ||
    text.includes("perms_token")
  );
}

function sanitizeReason(reason: unknown): string {
  if (typeof reason === "string") return reason.slice(0, 200);
  try {
    return JSON.stringify(reason).slice(0, 200);
  } catch {
    return String(reason).slice(0, 200);
  }
}
