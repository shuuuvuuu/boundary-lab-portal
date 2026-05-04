"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  FlagSnapshotTable,
  type FlagSnapshotFlagColumn,
  type FlagSnapshotParticipant,
  type FlagSnapshotRoom,
  type FlagSnapshotStateColumn,
} from "./FlagSnapshotTable";
import { TabDescription } from "./TabDescription";

type VoiceState =
  | { kind: "idle" | "loading" }
  | { kind: "ready"; rooms: FlagSnapshotRoom[]; mock: boolean }
  | { kind: "error"; message: string };
type VoiceResponse = {
  rooms?: FlagSnapshotRoom[];
  data?: { rooms?: FlagSnapshotRoom[] };
  error?: string;
};

const REFRESH_INTERVAL_MS = 5_000;
const FLAG_COLUMNS: FlagSnapshotFlagColumn[] = [
  { key: "isSpeaking", label: "発話中", tooltip: "VAD で発話検知" },
  { key: "hasPartner", label: "対人", tooltip: "他参加者 1 名以上" },
  { key: "underDailyLimit", label: "日次内", tooltip: "daily_voice_limit 未達" },
  { key: "notFlagged", label: "正常", tooltip: "flagged=false" },
  { key: "notBuzzMode", label: "通常", tooltip: "buzz mode 不発動" },
  { key: "underContinuousLimit", label: "連続OK", tooltip: "continuous_speaking_limit 未達" },
  { key: "noCooldown", label: "クール明", tooltip: "cooldown_remaining=0" },
  { key: "walletConnected", label: "wallet", tooltip: "wallet_address 設定済" },
  { key: "planEligible", label: "plan資格", tooltip: "airdrop.voice 機能利用可" },
];

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function formatSeconds(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value < 60) return `${value}s`;
  const minutes = Math.floor(value / 60);
  return minutes < 60
    ? `${minutes}m ${Math.floor(value % 60)}s`
    : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function formatLastFlush(value: unknown): string {
  if (typeof value !== "string") return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : `${pad2(date.getMonth() + 1)}/${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(
        date.getMinutes(),
      )}:${pad2(date.getSeconds())}`;
}

const STATE_COLUMNS: FlagSnapshotStateColumn[] = [
  { key: "validVoiceSeconds", label: "有効", format: formatSeconds },
  { key: "dailyAccumulated", label: "日次累積", format: formatSeconds },
  { key: "continuousSpeakingSeconds", label: "連続", format: formatSeconds },
  { key: "cooldownRemaining", label: "CD", format: formatSeconds },
  { key: "lastFlush", label: "flush", format: formatLastFlush },
];

const OK_FLAGS = {
  isSpeaking: true,
  hasPartner: true,
  underDailyLimit: true,
  notFlagged: true,
  notBuzzMode: true,
  underContinuousLimit: true,
  noCooldown: true,
  walletConnected: true,
  planEligible: true,
};

function mockParticipant(
  userId: string,
  displayName: string,
  walletAddress: boolean,
  plan: string,
  flags: Partial<Record<string, boolean>>,
  state: Record<string, unknown>,
): FlagSnapshotParticipant {
  return {
    userId,
    displayName,
    walletAddress,
    plan,
    flags: { ...OK_FLAGS, ...flags } as Record<string, boolean>,
    state,
  };
}

const MOCK_ROOMS: FlagSnapshotRoom[] = [
  {
    roomId: "main-lobby",
    participantCount: 3,
    participants: [
      mockParticipant(
        "mock-speaking-ok",
        "Mock Speaker OK",
        true,
        "personal",
        {},
        {
          validVoiceSeconds: 142,
          dailyAccumulated: 2310,
          continuousSpeakingSeconds: 45,
          cooldownRemaining: 0,
          lastFlush: "2026-05-04T07:45:00.000Z",
        },
      ),
      mockParticipant(
        "mock-no-wallet",
        "Mock Wallet Missing",
        false,
        "free",
        { walletConnected: false, planEligible: false },
        {
          validVoiceSeconds: 0,
          dailyAccumulated: 0,
          continuousSpeakingSeconds: 18,
          cooldownRemaining: 0,
          lastFlush: "2026-05-04T07:44:45.000Z",
        },
      ),
      mockParticipant(
        "mock-cooldown",
        "Mock Cooldown",
        true,
        "pro",
        { underContinuousLimit: false, noCooldown: false },
        {
          validVoiceSeconds: 480,
          dailyAccumulated: 5400,
          continuousSpeakingSeconds: 620,
          cooldownRemaining: 75,
          lastFlush: "2026-05-04T07:44:18.000Z",
        },
      ),
    ],
  },
];

function extractRooms(json: VoiceResponse): FlagSnapshotRoom[] | null {
  return Array.isArray(json.rooms)
    ? json.rooms
    : Array.isArray(json.data?.rooms)
      ? json.data.rooms
      : null;
}

export function VoiceDebugClient() {
  const [state, setState] = useState<VoiceState>({ kind: "idle" });
  const requestSeq = useRef(0);

  const fetchVoice = useCallback(async () => {
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    setState((prev) => (prev.kind === "ready" ? prev : { kind: "loading" }));
    try {
      const res = await fetch("/api/admin/metrics/server?type=voice&service=rezona", {
        cache: "no-store",
      });
      if (res.status === 404 || res.status === 204 || res.status === 503) {
        if (requestSeq.current === seq) setState({ kind: "ready", rooms: MOCK_ROOMS, mock: true });
        return;
      }
      const json = (await res.json().catch(() => ({}))) as VoiceResponse;
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const rooms = extractRooms(json);
      if (requestSeq.current === seq)
        setState({ kind: "ready", rooms: rooms ?? MOCK_ROOMS, mock: !rooms });
    } catch (err) {
      if (requestSeq.current === seq) {
        setState({ kind: "error", message: err instanceof Error ? err.message : "unknown error" });
      }
    }
  }, []);

  useEffect(() => {
    void fetchVoice();
    const timer = setInterval(() => void fetchVoice(), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchVoice]);

  return (
    <div className="space-y-4">
      <TabDescription>
        rezona voice tracker の 9 フラグと加算 state を 5 秒間隔で表示します。 全OK
        行は緑で薄く強調されるため、flag は通っているのに有効秒が増えないケースを state
        列と並べて確認できます。
      </TabDescription>
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <span>更新間隔: 5s</span>
        {state.kind === "ready" && state.mock && (
          <span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-amber-300">
            mock
          </span>
        )}
        <button
          type="button"
          onClick={() => void fetchVoice()}
          disabled={state.kind === "loading"}
          className="rounded border border-slate-700 bg-slate-800 px-3 py-1 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state.kind === "loading" ? "読み込み中..." : "再取得"}
        </button>
        {state.kind === "ready" && (
          <span className="ml-auto">
            rooms: <span className="text-slate-200">{state.rooms.length}</span>
          </span>
        )}
      </div>
      {state.kind === "error" && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-4 text-sm text-red-300">
          <p>エラー: {state.message}</p>
          <button
            type="button"
            onClick={() => void fetchVoice()}
            className="mt-3 rounded border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs hover:bg-red-500/20"
          >
            再試行
          </button>
        </div>
      )}
      {state.kind === "loading" && (
        <p className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-6 text-sm text-slate-400">
          voice snapshot を読み込み中...
        </p>
      )}
      {state.kind === "ready" && (
        <FlagSnapshotTable
          rooms={state.rooms}
          flagColumns={FLAG_COLUMNS}
          stateColumns={STATE_COLUMNS}
          emptyMessage="現在 voice tracker の room snapshot はありません。"
        />
      )}
    </div>
  );
}
