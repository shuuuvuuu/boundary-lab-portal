import pino from "pino";

export function createLogger(level: string) {
  return pino({
    level,
    base: undefined,
    redact: {
      paths: [
        "reticulumBotAccessKey",
        "supabaseServiceRoleKey",
        "discordWebhookUrl",
        "*.reticulumBotAccessKey",
        "*.supabaseServiceRoleKey",
        "*.discordWebhookUrl",
      ],
      censor: "[redacted]",
    },
  });
}

export type Logger = ReturnType<typeof createLogger>;
