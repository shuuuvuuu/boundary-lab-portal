import type { CronJob } from "@/lib/scheduler/types";
import { uploadBackupArtifact } from "@/lib/backup/r2";

/**
 * backup-sentry: Sentry の直近 90 日 issue 一覧 (boundary / rezona) を JSON で R2 に保存する。
 *
 * 詳細イベントの dump は API rate limit / sntryu_ token 権限の都合で重いので、
 * issue サマリ (id / shortId / title / count / firstSeen / lastSeen) だけ。
 * Sentry Developer 無料プランでも取れる範囲。
 */

const SENTRY_API_BASE = "https://sentry.io/api/0";

type SentryIssue = {
  id: string;
  shortId: string;
  title: string;
  level: string;
  status: string;
  permalink: string;
  firstSeen: string;
  lastSeen: string;
  count: string;
  userCount: number;
  project: { slug: string; name: string };
};

async function listIssuesForBackup(
  org: string,
  projectSlug: string,
  token: string,
): Promise<SentryIssue[]> {
  const params = new URLSearchParams({
    query: "is:unresolved",
    statsPeriod: "90d",
    limit: "100",
    sort: "date",
  });
  const res = await fetch(
    `${SENTRY_API_BASE}/projects/${org}/${projectSlug}/issues/?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sentry API ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as SentryIssue[];
}

export const backupSentryJob: CronJob = {
  kind: "cron",
  name: "backup-sentry",
  description: "毎週日曜 UTC 19:00: Sentry の未解決 issue サマリを R2 に保存",
  schedule: { type: "weekly", weekday: 0, hourUtc: 19, minuteUtc: 0 },
  handler: async (ctx) => {
    const services: Array<{
      key: string;
      org: string;
      projects: string[];
      token: string;
    }> = [];

    const boundaryToken = process.env.SENTRY_AUTH_TOKEN;
    if (boundaryToken) {
      services.push({
        key: "boundary",
        org: process.env.SENTRY_ORG ?? "shuu-dw",
        projects: [
          process.env.SENTRY_SERVER_PROJECT ?? "boundary-metaverse-server",
          process.env.SENTRY_WEB_PROJECT ?? "boundary-metaverse-web",
        ].filter(Boolean),
        token: boundaryToken,
      });
    }

    const rezonaToken = process.env.SENTRY_REZONA_AUTH_TOKEN ?? boundaryToken;
    const rezonaProjectsRaw = process.env.SENTRY_REZONA_PROJECTS ?? "";
    const rezonaProjects = rezonaProjectsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (rezonaToken && rezonaProjects.length > 0) {
      services.push({
        key: "rezona",
        org: process.env.SENTRY_REZONA_ORG ?? process.env.SENTRY_ORG ?? "shuu-dw",
        projects: rezonaProjects,
        token: rezonaToken,
      });
    }

    if (services.length === 0) {
      return {
        ok: true,
        message: "Sentry env 未設定のため no-op",
      };
    }

    const yyyymmdd = ctx.firedAt.slice(0, 10).replace(/-/g, "");
    const baseKey = `boundary-backups/sentry/${yyyymmdd}`;

    const summary: Array<{ service: string; project: string; issues: number }> = [];
    for (const svc of services) {
      for (const project of svc.projects) {
        let issues: SentryIssue[] = [];
        try {
          issues = await listIssuesForBackup(svc.org, project, svc.token);
        } catch (err) {
          console.warn(
            `[backup-sentry] skip ${svc.key}/${project}: ${err instanceof Error ? err.message : String(err)}`,
          );
          summary.push({ service: svc.key, project, issues: 0 });
          continue;
        }
        const buffer = Buffer.from(JSON.stringify(issues, null, 2), "utf8");
        try {
          await uploadBackupArtifact({
            key: `${baseKey}/${svc.key}-${project}.json`,
            contentType: "application/json",
            body: buffer,
          });
          summary.push({ service: svc.key, project, issues: issues.length });
        } catch (err) {
          return {
            ok: false,
            message: `upload ${svc.key}/${project} failed: ${err instanceof Error ? err.message : String(err)}`,
            meta: { partial: summary },
          };
        }
      }
    }

    return {
      ok: true,
      message: `exported ${summary.length} project(s) to ${baseKey}`,
      meta: { projects: summary },
    };
  },
};
