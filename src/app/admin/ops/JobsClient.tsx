"use client";

import { useCallback, useEffect, useState } from "react";
import { TabDescription } from "./TabDescription";
import { TimeRangeSelector, type TimeRange } from "./TimeRangeSelector";

type JobSummary =
  | {
      name: string;
      kind: "cron";
      description: string;
      schedule:
        | { type: "daily"; hourUtc: number; minuteUtc: number }
        | { type: "weekly"; weekday: number; hourUtc: number; minuteUtc: number }
        | { type: "every"; intervalMs: number };
      disabled: boolean;
    }
  | {
      name: string;
      kind: "scheduled";
      description: string;
    };

type JobRun = {
  id: string;
  job_name: string;
  job_kind: string;
  trigger: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  message: string | null;
  meta: Record<string, unknown>;
};

function formatSchedule(s: Extract<JobSummary, { kind: "cron" }>["schedule"]): string {
  if (s.type === "daily") return `daily ${pad(s.hourUtc)}:${pad(s.minuteUtc)} UTC`;
  if (s.type === "weekly") {
    const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][s.weekday];
    return `weekly ${wd} ${pad(s.hourUtc)}:${pad(s.minuteUtc)} UTC`;
  }
  return `every ${Math.round(s.intervalMs / 1000)}s`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 1_000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function statusClass(status: string): string {
  if (status === "ok") return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
  if (status === "failed") return "bg-red-500/20 text-red-300 border-red-500/30";
  if (status === "running") return "bg-sky-500/20 text-sky-300 border-sky-500/30";
  return "bg-slate-600/20 text-slate-300 border-slate-500/30";
}

export function JobsClient() {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [runnerEnabled, setRunnerEnabled] = useState(false);
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [period, setPeriod] = useState<TimeRange>("24h");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [jobsRes, runsRes] = await Promise.all([
        fetch("/api/admin/jobs", { cache: "no-store" }),
        fetch(`/api/admin/jobs/runs?limit=50&period=${period}`, { cache: "no-store" }),
      ]);
      if (jobsRes.ok) {
        const json = (await jobsRes.json()) as {
          runner_enabled: boolean;
          jobs: JobSummary[];
        };
        setJobs(json.jobs);
        setRunnerEnabled(json.runner_enabled);
      }
      if (runsRes.ok) {
        const json = (await runsRes.json()) as { runs: JobRun[] };
        setRuns(json.runs);
      }
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRun = useCallback(
    async (name: string) => {
      if (running) return;
      setRunning(name);
      setHint(null);
      try {
        const res = await fetch("/api/admin/jobs/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (res.status === 401 || res.status === 403) {
          setHint("owner ログインが必要です");
        } else if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setHint(`実行失敗: ${body.error ?? res.status}`);
        } else {
          const body = (await res.json()) as {
            result?: { ok: boolean; message?: string };
          };
          if (body.result?.ok) {
            setHint(`実行成功: ${body.result.message ?? "(no message)"}`);
          } else {
            setHint(`実行失敗: ${body.result?.message ?? "(no message)"}`);
          }
        }
        await load();
      } catch (err) {
        setHint(`通信失敗: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setRunning(null);
        setTimeout(() => setHint(null), 5000);
      }
    },
    [load, running],
  );

  return (
    <div className="space-y-4">
      <TabDescription>
        portal の定期実行ジョブ (scheduler) の稼働状況を表示します。
        現在 8 種類: 日次 health 集計 / 週次レポート / 30 日 retention 削除 /
        airdrop dry-run / TODO 期限通知 / Supabase バックアップ / Sentry バックアップなど。
        スケジュールはすべて UTC 表記、失敗時は Discord と email に通知されます。
        オーナーアカウントなら「今すぐ実行」ボタンで手動トリガーできます。
        ランナー本体は環境変数
        <code className="mx-1 rounded bg-slate-800 px-1">JOB_RUNNER_ENABLED=true</code>
        の時だけ起動します。
        <br />
        ランナー状態:{" "}
        <span
          className={runnerEnabled ? "text-emerald-300" : "text-amber-300"}
        >
          {runnerEnabled ? "有効 (JOB_RUNNER_ENABLED=true)" : "無効"}
        </span>
      </TabDescription>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40">
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="font-medium">登録済ジョブ</h2>
          <div className="flex items-center gap-2">
            <TimeRangeSelector value={period} onChange={setPeriod} />
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs hover:bg-slate-700 disabled:opacity-60"
            >
              {loading ? "更新中…" : "再読込"}
            </button>
          </div>
        </header>
        <ul className="divide-y divide-slate-800">
          {jobs.map((job) => (
            <li key={job.name} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-100">{job.name}</div>
                <div className="text-xs text-slate-400">{job.description}</div>
                <div className="text-xs text-slate-500">
                  {job.kind === "cron"
                    ? formatSchedule(job.schedule)
                    : "scheduled (manual-only)"}
                  {job.kind === "cron" && job.disabled && " · disabled"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRun(job.name)}
                disabled={running !== null}
                className="rounded bg-sky-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-60"
              >
                {running === job.name ? "実行中…" : "今すぐ実行"}
              </button>
            </li>
          ))}
          {jobs.length === 0 && !loading && (
            <li className="px-4 py-6 text-sm text-slate-400">登録済ジョブなし</li>
          )}
        </ul>
        {hint && <p className="border-t border-slate-800 px-4 py-2 text-xs text-amber-300">{hint}</p>}
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40">
        <header className="border-b border-slate-800 px-4 py-3">
          <h2 className="font-medium">直近の実行 (期間内、最大 50 件)</h2>
        </header>
        <ul className="divide-y divide-slate-800">
          {runs.map((run) => (
            <li key={run.id} className="px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded border px-1.5 py-0.5 ${statusClass(run.status)}`}>
                  {run.status}
                </span>
                <span className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-slate-300">
                  {run.job_name}
                </span>
                <span className="text-slate-500">{run.trigger}</span>
                <span className="ml-auto text-slate-500">{formatRelative(run.started_at)}</span>
              </div>
              {run.message && <div className="mt-1 text-slate-300">{run.message}</div>}
              {typeof run.duration_ms === "number" && (
                <div className="text-xs text-slate-500">duration {run.duration_ms}ms</div>
              )}
            </li>
          ))}
          {runs.length === 0 && !loading && (
            <li className="px-4 py-6 text-sm text-slate-400">実行履歴なし</li>
          )}
        </ul>
      </section>
    </div>
  );
}
