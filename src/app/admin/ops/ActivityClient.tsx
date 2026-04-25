"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { TabDescription } from "./TabDescription";

type EventType = "user_action" | "api_request" | "server_event";

type ActivityRow = {
  id: string;
  service: string;
  event_type: EventType;
  action: string;
  user_id: string | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
};

type Summary = { user_id: string; count: number };
type ApiSummary = { action: string; count: number };

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "ready";
      events: ActivityRow[];
      statsPeriod: string;
      topUsers: Summary[];
      topApis: ApiSummary[];
    }
  | { kind: "error"; message: string };

type PeriodOption = "1h" | "24h" | "7d";
type TypeFilter = "all" | EventType;

function formatRelative(iso: string): string {
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

function formatAbsolute(iso: string): string {
  const d = new Date(iso);
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  const dd = d.getDate().toString().padStart(2, "0");
  const hh = d.getHours().toString().padStart(2, "0");
  const mi = d.getMinutes().toString().padStart(2, "0");
  const ss = d.getSeconds().toString().padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}:${ss}`;
}

function eventTypeBadge(type: EventType): string {
  if (type === "user_action")
    return "bg-sky-500/20 text-sky-300 border-sky-500/30";
  if (type === "api_request")
    return "bg-slate-600/20 text-slate-300 border-slate-500/30";
  return "bg-amber-500/20 text-amber-300 border-amber-500/30";
}

function eventTypeLabel(type: EventType): string {
  if (type === "user_action") return "user";
  if (type === "api_request") return "api";
  return "server";
}

function shortUserId(uid: string | null): string {
  if (!uid) return "—";
  if (uid.length <= 12) return uid;
  return `${uid.slice(0, 8)}…${uid.slice(-3)}`;
}

function statusClass(status: number | undefined): string {
  if (typeof status !== "number") return "text-slate-400";
  if (status >= 500) return "text-red-300";
  if (status >= 400) return "text-amber-300";
  if (status >= 200 && status < 300) return "text-slate-300";
  return "text-slate-400";
}

function metadataSummary(row: ActivityRow): string | null {
  const m = row.metadata ?? {};
  if (row.event_type === "api_request") {
    const status = m.status as number | undefined;
    const duration = m.duration_ms as number | undefined;
    const parts: string[] = [];
    if (typeof status === "number") parts.push(`${status}`);
    if (typeof duration === "number") parts.push(`${duration}ms`);
    return parts.join(" · ") || null;
  }
  if (row.event_type === "server_event") {
    const parts: string[] = [];
    if (typeof m.uptime_sec === "number") parts.push(`uptime=${m.uptime_sec}s`);
    if (typeof m.release === "string") parts.push(`release=${(m.release as string).slice(0, 7)}`);
    if (typeof m.signal === "string") parts.push(`signal=${m.signal}`);
    return parts.length > 0 ? parts.join(" · ") : null;
  }
  // user_action: room_id, reason, etc.
  const parts: string[] = [];
  if (typeof m.world_id === "string") parts.push(`world=${m.world_id}`);
  if (typeof m.reason === "string") parts.push(`reason=${m.reason}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * 攻撃スキャンっぽい path を判定する（簡易ヒューリスティック）。
 * `.env`, `.git`, `wp-`, `phpinfo` 等の機密ファイル / CMS 探索を疑う。
 */
function isSuspiciousScan(path: string): boolean {
  const p = path.toLowerCase();
  // URL-encoded 形式も解釈する
  let decoded = p;
  try {
    decoded = decodeURIComponent(p);
  } catch {
    decoded = p;
  }
  const target = `${p} ${decoded}`;
  const patterns = [
    "/.env",
    "/.git",
    "/.aws",
    "/.ds_store",
    "/wp-",
    "/wordpress",
    "/phpinfo",
    "/phpmyadmin",
    "/admin.php",
    "/config.json",
    "/backup",
    "/.htaccess",
    "/server-status",
    "/etc/passwd",
  ];
  return patterns.some((s) => target.includes(s));
}

/**
 * 各イベント行に表示する「ざっくり何か」の説明文。
 *
 * - 攻撃スキャン疑いは絵文字付きで強調
 * - 既知の API エンドポイントは日本語の機能名に置換
 * - 401/404/500 等の status コードを意味で補足
 */
function describeEvent(row: ActivityRow): string | null {
  const m = row.metadata ?? {};

  if (row.event_type === "server_event") {
    if (row.action === "server_boot") return "サーバー起動（再起動を含む）";
    if (row.action === "server_stop_graceful")
      return "サーバー正常終了（SIGTERM 受信。docker compose 等の正規な再起動）";
    return null;
  }

  if (row.event_type === "user_action") {
    if (row.action === "socket_connect") return "WebSocket 接続確立";
    if (row.action === "socket_disconnect") {
      const reason = m.reason as string | undefined;
      if (reason === "transport close") return "WebSocket 切断（クライアント側でタブを閉じた等）";
      if (reason === "ping timeout") return "WebSocket 切断（ping タイムアウト・通信断）";
      if (reason === "client namespace disconnect")
        return "WebSocket 切断（クライアントから明示的に切断）";
      return reason ? `WebSocket 切断（${reason}）` : "WebSocket 切断";
    }
    if (row.action === "room_join") return "ワールド参加";
    if (row.action === "room_leave") return "ワールド退出";
    return null;
  }

  // api_request
  const path = (m.path as string | undefined) ?? row.action.split(" ").slice(1).join(" ");
  const status = m.status as number | undefined;

  if (isSuspiciousScan(path)) {
    return "⚠️ 攻撃スキャン疑い（攻撃者が機密ファイル / 管理画面を探索）";
  }

  let endpointDesc: string | null = null;
  if (path === "/" || path === "") endpointDesc = "ルート（SPA / 静的）";
  else if (path.startsWith("/api/livekit/token")) endpointDesc = "LiveKit トークン取得（音声接続用）";
  else if (path.startsWith("/api/livekit/webhook")) endpointDesc = "LiveKit webhook 受信";
  else if (path.startsWith("/api/livekit")) endpointDesc = "LiveKit 関連 API";
  else if (path.startsWith("/api/placements")) endpointDesc = "オブジェクト配置 API";
  else if (path.startsWith("/api/r2")) endpointDesc = "R2 ストレージ署名 URL";
  else if (path.startsWith("/api/world/users")) endpointDesc = "ユーザー一覧";
  else if (path.startsWith("/api/world/user")) endpointDesc = "ユーザー設定";
  else if (path.startsWith("/api/debug")) endpointDesc = "デバッグエンドポイント（本番では 404）";
  else if (path.startsWith("/health")) endpointDesc = "ヘルスチェック";

  let statusDesc: string | null = null;
  if (typeof status === "number") {
    if (status === 401) statusDesc = "認証必要（token 不足/無効）";
    else if (status === 403) statusDesc = "権限不足";
    else if (status === 404) statusDesc = "存在しない URL";
    else if (status === 429) statusDesc = "レート制限";
    else if (status >= 500) statusDesc = "サーバー側エラー";
  }

  if (endpointDesc && statusDesc) return `${endpointDesc} / ${statusDesc}`;
  if (endpointDesc) return endpointDesc;
  if (statusDesc) return statusDesc;
  return null;
}

/**
 * 各イベントについて Sentry で開く際の deep link を組み立てる。
 *
 * - api_request: Discover で transaction 名フィルタ
 * - server_event / user_action: Discover で時刻周辺の events search
 *
 * org slug は環境変数 NEXT_PUBLIC_SENTRY_ORG / クエリ等から取れないため
 * 既知値（boundarylabo は shuu-dw）をハードコードする。rezona 統合時は分岐拡張。
 */
const SENTRY_ORG = "shuu-dw";
const SENTRY_PROJECT_BY_SERVICE: Record<string, string> = {
  boundary: "boundary-metaverse-server",
  rezona: "rezona-server",
};

function sentryDeepLink(row: ActivityRow): string | null {
  const project = SENTRY_PROJECT_BY_SERVICE[row.service] ?? null;
  if (!project) return null;

  const occurredMs = new Date(row.occurred_at).getTime();
  // ±1h の窓で検索する（Sentry の Discover はミリ秒精度の絞り込みは UI 側で行う想定）
  const start = new Date(occurredMs - 30 * 60_000).toISOString();
  const end = new Date(occurredMs + 30 * 60_000).toISOString();

  if (row.event_type === "api_request") {
    const m = row.metadata ?? {};
    const method = (m.method as string | undefined) ?? row.action.split(" ")[0] ?? "";
    const path = (m.path as string | undefined) ?? row.action.split(" ").slice(1).join(" ");
    const transaction = `${method} ${path}`.trim();
    const params = new URLSearchParams({
      query: `transaction:"${transaction}"`,
      statsPeriod: "24h",
      dataset: "transactions",
      project: project,
    });
    return `https://${SENTRY_ORG}.sentry.io/discover/results/?${params.toString()}`;
  }

  if (row.event_type === "server_event") {
    const params = new URLSearchParams({
      query: `is:unresolved`,
      project: project,
      start,
      end,
    });
    return `https://${SENTRY_ORG}.sentry.io/issues/?${params.toString()}`;
  }

  if (row.event_type === "user_action") {
    const params = new URLSearchParams({
      query: `message:"${row.action}"`,
      statsPeriod: "24h",
      project: project,
    });
    return `https://${SENTRY_ORG}.sentry.io/discover/results/?${params.toString()}`;
  }

  return null;
}

export function ActivityClient() {
  const [state, setState] = useState<FetchState>({ kind: "idle" });
  const [period, setPeriod] = useState<PeriodOption>("24h");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [userFilter, setUserFilter] = useState<string>("");

  const fetchData = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const params = new URLSearchParams({ statsPeriod: period, limit: "200" });
      if (typeFilter !== "all") params.set("event_type", typeFilter);
      if (userFilter) params.set("user_id", userFilter);
      const res = await fetch(`/api/admin/activity?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        events: ActivityRow[];
        statsPeriod: string;
        topUsers: Summary[];
        topApis: ApiSummary[];
      };
      setState({
        kind: "ready",
        events: json.events,
        statsPeriod: json.statsPeriod,
        topUsers: json.topUsers,
        topApis: json.topApis,
      });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "unknown error",
      });
    }
  }, [period, typeFilter, userFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const events = state.kind === "ready" ? state.events : [];
  const topUsers = state.kind === "ready" ? state.topUsers : [];
  const topApis = state.kind === "ready" ? state.topApis : [];

  const serverEvents = useMemo(
    () => events.filter((e) => e.event_type === "server_event"),
    [events],
  );

  return (
    <div className="space-y-4">
      <TabDescription>
        <strong className="text-slate-200">ユーザー操作・API 呼出・サーバー状態遷移</strong>
        を時系列で 1 画面に統合したログです。30 日分を Supabase `activity_events` に保持。
        各行に意味の説明とSentry へのリンクを付加。
        攻撃スキャン疑い（<code className="mx-1 rounded bg-slate-800 px-1">.env</code>
        や <code className="mx-1 rounded bg-slate-800 px-1">/wp-</code> 等の探索）は
        赤線でハイライトします。
      </TabDescription>

      {/* フィルタバー */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded border border-slate-700 bg-slate-800 p-0.5 text-xs">
          {(["1h", "24h", "7d"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setPeriod(opt)}
              className={`rounded px-2 py-1 transition ${
                period === opt
                  ? "bg-slate-700 text-slate-100"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
        <div className="flex rounded border border-slate-700 bg-slate-800 p-0.5 text-xs">
          {(["all", "user_action", "api_request", "server_event"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setTypeFilter(opt)}
              className={`rounded px-2 py-1 transition ${
                typeFilter === opt
                  ? "bg-slate-700 text-slate-100"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {opt === "all" ? "all" : eventTypeLabel(opt)}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          placeholder="user_id で絞り込み"
          className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-500"
          style={{ width: 220 }}
        />
        <button
          type="button"
          onClick={fetchData}
          disabled={state.kind === "loading"}
          className="ml-auto rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state.kind === "loading" ? "読み込み中..." : "再取得"}
        </button>
      </div>

      {state.kind === "error" && (
        <p className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-6 text-sm text-red-300">
          エラー: {state.message}
        </p>
      )}

      {state.kind === "ready" && serverEvents.length > 0 && (
        <section className="rounded-lg border border-amber-900/50 bg-amber-950/20 px-4 py-3">
          <h3 className="text-sm font-medium text-amber-200">
            期間内のサーバーイベント ({serverEvents.length} 件)
          </h3>
          <p className="mt-1 text-xs text-amber-200/70">
            <code className="rounded bg-amber-950/40 px-1">server_boot</code> のみで
            <code className="mx-1 rounded bg-amber-950/40 px-1">server_stop_graceful</code>
            が直前に無い場合は **異常終了** と推定できます（OOM kill / panic 等）。
            アバター同期ズレ問題の原因候補です。
          </p>
          <ul className="mt-2 space-y-1 text-xs text-slate-300">
            {serverEvents.map((e) => {
              const desc = describeEvent(e);
              return (
                <li key={e.id} className="flex gap-3 font-mono">
                  <span className="text-slate-500">{formatAbsolute(e.occurred_at)}</span>
                  <span className="text-amber-300">{e.action}</span>
                  <span className="text-slate-500">{metadataSummary(e) ?? ""}</span>
                  <span className="text-slate-400">{desc ? `— ${desc}` : ""}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* メイン timeline */}
        <section className="rounded-lg border border-slate-800 bg-slate-900/40">
          <header className="border-b border-slate-800 px-4 py-3">
            <h2 className="text-sm font-medium">Timeline ({events.length} 件)</h2>
          </header>
          <div className="max-h-[600px] divide-y divide-slate-800 overflow-y-auto">
            {state.kind === "loading" && (
              <p className="px-4 py-6 text-sm text-slate-400">読み込み中...</p>
            )}
            {state.kind === "ready" && events.length === 0 && (
              <p className="px-4 py-6 text-sm text-slate-400">
                該当イベントがありません（フィルタ条件を緩めるか期間を広げてください）
              </p>
            )}
            {events.map((e) => {
              const status = e.metadata?.status as number | undefined;
              const description = describeEvent(e);
              const sentryLink = sentryDeepLink(e);
              const path = (e.metadata?.path as string | undefined) ?? "";
              const suspicious =
                e.event_type === "api_request" && isSuspiciousScan(path);
              return (
                <article
                  key={e.id}
                  className={`px-4 py-2 text-xs ${
                    suspicious ? "border-l-2 border-red-500/60 bg-red-950/20" : ""
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-block rounded border px-1.5 py-0.5 ${eventTypeBadge(
                        e.event_type,
                      )}`}
                    >
                      {eventTypeLabel(e.event_type)}
                    </span>
                    <span className="font-mono text-slate-200">{e.action}</span>
                    {typeof status === "number" && (
                      <span className={`tabular-nums ${statusClass(status)}`}>
                        {status}
                      </span>
                    )}
                    <span className="text-slate-500">{metadataSummary(e)}</span>
                    <span className="ml-auto flex items-center gap-2 text-slate-500">
                      {sentryLink && (
                        <a
                          href={sentryLink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-400 hover:underline"
                          title="Sentry で開く（時刻 ±30 分の events / transaction を検索）"
                        >
                          Sentry ↗
                        </a>
                      )}
                      <span>{formatRelative(e.occurred_at)}</span>
                    </span>
                  </div>
                  {description && (
                    <div
                      className={`mt-0.5 ${
                        suspicious ? "text-red-300" : "text-slate-400"
                      }`}
                    >
                      {description}
                    </div>
                  )}
                  {e.user_id && (
                    <div className="mt-0.5 font-mono text-[10px] text-slate-500">
                      user: {shortUserId(e.user_id)}
                      <button
                        type="button"
                        onClick={() => setUserFilter(e.user_id ?? "")}
                        className="ml-2 text-sky-400 hover:underline"
                      >
                        この user で絞り込み
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        {/* 集計サイドバー */}
        <div className="space-y-4">
          <section className="rounded-lg border border-slate-800 bg-slate-900/40">
            <header className="border-b border-slate-800 px-4 py-3">
              <h3 className="text-sm font-medium">Top ユーザー（期間内）</h3>
            </header>
            <div className="divide-y divide-slate-800">
              {topUsers.length === 0 ? (
                <p className="px-4 py-4 text-xs text-slate-500">user_action が記録されていません</p>
              ) : (
                topUsers.map((u) => (
                  <button
                    key={u.user_id}
                    type="button"
                    onClick={() => setUserFilter(u.user_id)}
                    className="flex w-full items-center justify-between px-4 py-2 text-xs hover:bg-slate-800/40"
                  >
                    <span className="font-mono text-slate-300">{shortUserId(u.user_id)}</span>
                    <span className="tabular-nums text-slate-500">{u.count}</span>
                  </button>
                ))
              )}
            </div>
          </section>
          <section className="rounded-lg border border-slate-800 bg-slate-900/40">
            <header className="border-b border-slate-800 px-4 py-3">
              <h3 className="text-sm font-medium">Top API（期間内）</h3>
            </header>
            <div className="divide-y divide-slate-800">
              {topApis.length === 0 ? (
                <p className="px-4 py-4 text-xs text-slate-500">api_request が記録されていません</p>
              ) : (
                topApis.map((a) => (
                  <div
                    key={a.action}
                    className="flex items-center justify-between px-4 py-2 text-xs"
                  >
                    <span className="font-mono text-slate-300">{a.action}</span>
                    <span className="tabular-nums text-slate-500">{a.count}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
