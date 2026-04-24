"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type CheckRow = {
  id: string;
  service: string;
  endpoint: string;
  status_code: number | null;
  response_time_ms: number | null;
  ok: boolean;
  error_message: string | null;
  checked_at: string;
};

function isCertService(service: string): boolean {
  return service.startsWith("cert:");
}

function certHost(service: string): string {
  return service.slice("cert:".length);
}

/**
 * 証明書タブでは response_time_ms に「残日数」が入る。
 * 30 日以下 → amber、7 日以下 → red。負値（期限切れ）は赤のまま。
 */
function certDaysTone(days: number | null): "good" | "warn" | "bad" {
  if (days === null) return "bad";
  if (days <= 7) return "bad";
  if (days <= 30) return "warn";
  return "good";
}

type Summary = {
  total: number;
  ok: number;
  ng: number;
  uptime_percent: number;
  avg_response_ms: number | null;
  last_ok_at: string | null;
  last_ng_at: string | null;
};

type UptimePayload = {
  service: string;
  hours: number;
  configured: boolean;
  endpoint: string | null;
  interval_seconds: number | null;
  checks: CheckRow[];
  summary: Summary;
};

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; data: UptimePayload; loadedAt: number }
  | { kind: "error"; message: string };

const HOURS_OPTIONS: Array<{ key: string; label: string; hours: number }> = [
  { key: "1h", label: "1h", hours: 1 },
  { key: "6h", label: "6h", hours: 6 },
  { key: "24h", label: "24h", hours: 24 },
  { key: "7d", label: "7d", hours: 24 * 7 },
];

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 1_000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function formatJst(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ja-JP", { hour12: false });
}

export function UptimeClient({
  services,
  defaultService,
}: {
  services: string[];
  defaultService: string;
}) {
  const [service, setService] = useState<string>(defaultService);
  const [hours, setHours] = useState<number>(24);
  const [state, setState] = useState<FetchState>({ kind: "idle" });
  const [probing, setProbing] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const fetchUptime = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const params = new URLSearchParams({
        service,
        hours: String(hours),
      });
      const res = await fetch(`/api/admin/ops/uptime?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as UptimePayload;
      setState({ kind: "ready", data: json, loadedAt: Date.now() });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "unknown error",
      });
    }
  }, [service, hours]);

  useEffect(() => {
    fetchUptime();
  }, [fetchUptime]);

  const handleProbe = useCallback(async () => {
    if (probing) return;
    setProbing(true);
    setHint(null);
    try {
      const res = await fetch(
        `/api/admin/ops/probe?service=${encodeURIComponent(service)}`,
        {
          method: "POST",
          cache: "no-store",
        },
      );
      if (!res.ok) {
        const text = await res.text();
        setHint(`probe 失敗: HTTP ${res.status} ${text.slice(0, 120)}`);
      } else {
        setHint("probe 完了 — 履歴を再取得します");
        await fetchUptime();
      }
    } catch (err) {
      setHint(`probe 失敗: ${err instanceof Error ? err.message : "unknown"}`);
    } finally {
      setProbing(false);
      setTimeout(() => setHint(null), 5000);
    }
  }, [service, probing, fetchUptime]);

  const data = state.kind === "ready" ? state.data : null;
  const checks = useMemo<CheckRow[]>(() => data?.checks ?? [], [data]);

  const isCert = isCertService(service);
  // cert:<host> は response_time_ms が「残日数」。最新 1 件を大きく表示する。
  const latestCert = isCert ? checks[0] ?? null : null;
  const latestCertDays =
    latestCert?.response_time_ms !== undefined ? latestCert.response_time_ms : null;

  // 応答時間バーチャート用: 古い → 新しい の順に並べ、最大値で正規化
  const chartRows = useMemo(() => {
    // checks は DESC。グラフは昇順（左＝古、右＝新）
    const asc = [...checks].reverse();
    const maxMs = asc.reduce(
      (m, c) => Math.max(m, c.response_time_ms ?? 0),
      1,
    );
    return asc.map((c) => ({
      row: c,
      heightPercent:
        c.response_time_ms !== null
          ? Math.max(4, Math.round((c.response_time_ms / maxMs) * 100))
          : 100,
    }));
  }, [checks]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <span>Service</span>
          <select
            value={service}
            onChange={(e) => setService(e.target.value)}
            className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100"
          >
            {services.length === 0 && <option value={service}>{service}</option>}
            {services.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <div className="flex rounded border border-slate-700 bg-slate-800 p-0.5 text-xs">
          {HOURS_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setHours(opt.hours)}
              className={`rounded px-2 py-1 transition ${
                hours === opt.hours
                  ? "bg-slate-700 text-slate-100"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={handleProbe}
            disabled={probing}
            className="rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {probing ? "確認中..." : "今すぐ確認"}
          </button>
          <button
            type="button"
            onClick={fetchUptime}
            disabled={state.kind === "loading"}
            className="rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {state.kind === "loading" ? "読み込み中..." : "再取得"}
          </button>
        </div>
      </div>

      {hint && <p className="text-xs text-emerald-300">{hint}</p>}

      {state.kind === "error" && (
        <p className="text-sm text-red-300">エラー: {state.message}</p>
      )}

      {data && !data.configured && (
        <p className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          service <code className="font-mono">{service}</code> は
          <code className="ml-1 font-mono">HEALTH_CHECK_TARGETS</code>
          に登録されていません。env を設定して再デプロイしてください。
        </p>
      )}

      {data && isCert && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            label={`${certHost(service)} 残り日数`}
            value={latestCertDays !== null ? `${latestCertDays}` : "—"}
            sub={latestCertDays !== null && latestCertDays < 0 ? "期限切れ" : "days until expiry"}
            tone={certDaysTone(latestCertDays)}
            emphasize
          />
          <SummaryCard
            label="最終チェック"
            value={formatRelative(latestCert?.checked_at ?? null)}
            sub={latestCert?.checked_at ? formatJst(latestCert.checked_at) : ""}
          />
          <SummaryCard
            label="状態"
            value={latestCert?.ok ? "OK" : latestCert ? "要対応" : "—"}
            sub={latestCert?.error_message ?? ""}
            tone={latestCert?.ok ? "good" : "bad"}
          />
          <SummaryCard
            label="チェック回数 (期間内)"
            value={`${data.summary.total}`}
            sub={`成功 ${data.summary.ok} / 失敗 ${data.summary.ng}`}
          />
        </div>
      )}

      {data && !isCert && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            label="稼働率"
            value={`${data.summary.uptime_percent.toFixed(2)}%`}
            sub={`${data.summary.ok} / ${data.summary.total} OK`}
            tone={data.summary.uptime_percent >= 99 ? "good" : data.summary.uptime_percent >= 95 ? "warn" : "bad"}
          />
          <SummaryCard
            label="平均応答時間"
            value={data.summary.avg_response_ms !== null ? `${data.summary.avg_response_ms} ms` : "—"}
            sub={data.endpoint ?? ""}
          />
          <SummaryCard
            label="最終成功"
            value={formatRelative(data.summary.last_ok_at)}
            sub={data.summary.last_ok_at ? formatJst(data.summary.last_ok_at) : ""}
            tone="good"
          />
          <SummaryCard
            label="最終失敗"
            value={formatRelative(data.summary.last_ng_at)}
            sub={data.summary.last_ng_at ? formatJst(data.summary.last_ng_at) : ""}
            tone={data.summary.last_ng_at ? "bad" : "good"}
          />
        </div>
      )}

      {data && !isCert && checks.length > 0 && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/40">
          <header className="border-b border-slate-800 px-4 py-3 text-sm font-medium">
            応答時間（左: 古 → 右: 新 / 赤: 失敗）
          </header>
          <div className="flex h-24 items-end gap-[2px] overflow-x-auto px-4 py-3">
            {chartRows.map(({ row, heightPercent }) => (
              <div
                key={row.id}
                title={`${formatJst(row.checked_at)}\n${row.ok ? "OK" : "NG"} ${row.status_code ?? "-"} ${row.response_time_ms ?? "-"}ms${row.error_message ? "\n" + row.error_message : ""}`}
                className={`w-1.5 flex-none rounded-t ${
                  row.ok ? "bg-emerald-500/80" : "bg-red-500/80"
                }`}
                style={{ height: `${heightPercent}%` }}
              />
            ))}
          </div>
        </div>
      )}

      {data && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/40">
          <header className="border-b border-slate-800 px-4 py-3 text-sm font-medium">
            履歴（直近 {data.hours}h、最新 100 件）
          </header>
          {checks.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-400">
              データがありません。HEALTH_CHECK_ENABLED=true で poller を起動するか、「今すぐ確認」を押してください。
            </p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/60 text-slate-400">
                <tr>
                  <th className="px-3 py-2">時刻 (JST)</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">{isCert ? "残り日数" : "応答"}</th>
                  <th className="px-3 py-2">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {checks.slice(0, 100).map((row) => (
                  <tr key={row.id} className={row.ok ? "" : "bg-red-500/5"}>
                    <td className="px-3 py-1.5 font-mono text-slate-300">
                      {formatJst(row.checked_at)}
                    </td>
                    <td className="px-3 py-1.5">
                      <span
                        className={`rounded border px-1.5 py-0.5 ${
                          row.ok
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                            : "border-red-500/30 bg-red-500/10 text-red-300"
                        }`}
                      >
                        {isCert
                          ? row.ok
                            ? "OK"
                            : "NG"
                          : row.status_code ?? "ERR"}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-slate-300">
                      {isCert
                        ? row.response_time_ms !== null
                          ? `${row.response_time_ms} 日`
                          : "—"
                        : row.response_time_ms !== null
                          ? `${row.response_time_ms}ms`
                          : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-slate-400">
                      {row.error_message ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  tone,
  emphasize,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "warn" | "bad";
  /** cert 残日数のような重要メトリクスを大きく表示する */
  emphasize?: boolean;
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-300"
      : tone === "warn"
        ? "text-amber-300"
        : tone === "bad"
          ? "text-red-300"
          : "text-slate-100";
  const valueSize = emphasize ? "text-4xl" : "text-xl";
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`mt-1 ${valueSize} font-semibold ${toneClass}`}>{value}</div>
      {sub && <div className="mt-1 truncate text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
