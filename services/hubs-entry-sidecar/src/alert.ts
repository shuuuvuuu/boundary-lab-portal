import type { Logger } from "./logger.js";

export type AlertLevel = "info" | "warn" | "error";

const COLOR: Record<AlertLevel, number> = {
  info: 0x3b82f6,
  warn: 0xf59e0b,
  error: 0xef4444,
};

export class AlertClient {
  constructor(
    private readonly webhookUrl: string | null,
    private readonly logger: Logger,
  ) {}

  async notify(level: AlertLevel, message: string, meta?: Record<string, unknown>): Promise<void> {
    if (!this.webhookUrl) {
      this.logger.debug({ level, meta }, `discord alert disabled: ${message}`);
      return;
    }

    const embed = {
      title: `[${level.toUpperCase()}] Hubs Entry Sidecar`,
      description: message,
      color: COLOR[level],
      timestamp: new Date().toISOString(),
      fields: meta
        ? Object.entries(meta).map(([name, value]) => ({
            name,
            value: typeof value === "string" ? value : JSON.stringify(value),
            inline: true,
          }))
        : undefined,
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        await fetch(this.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ embeds: [embed] }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      this.logger.error(
        { err: scrubSecret(String(error), this.webhookUrl) },
        "discord alert failed",
      );
    }
  }
}

export function maskHubId(hubId: string): string {
  return `${hubId.slice(0, 4)}***`;
}

export function maskSessionId(sessionId: string): string {
  return `${sessionId.slice(0, 4)}***`;
}

function scrubSecret(text: string, secret: string): string {
  return text.split(secret).join("[redacted]");
}
