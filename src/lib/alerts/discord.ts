export type AlertLevel = "info" | "warn" | "error";

const COLOR: Record<AlertLevel, number> = {
  info: 0x3b82f6,
  warn: 0xf59e0b,
  error: 0xef4444,
};

export async function notifyDiscord(
  level: AlertLevel,
  message: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[discord-alert disabled] ${level}: ${message}`, meta ?? {});
    }
    return;
  }

  const embed = {
    title: `[${level.toUpperCase()}] Boundary LAB Portal`,
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
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch (err) {
    console.error("discord-alert failed:", scrubWebhookUrl(String(err), webhook));
  }
}

function scrubWebhookUrl(text: string, webhook: string): string {
  return text.split(webhook).join("[DISCORD_WEBHOOK_URL]");
}
