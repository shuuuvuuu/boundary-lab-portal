"use client";

import {
  FlagSnapshotTable,
  type FlagSnapshotFlagColumn,
  type FlagSnapshotParticipant,
  type FlagSnapshotRoom,
  type FlagSnapshotStateColumn,
} from "./FlagSnapshotTable";
import { TabDescription } from "./TabDescription";

const FLAGS: FlagSnapshotFlagColumn[] = [
  { key: "walletConnected", label: "wallet", tooltip: "wallet_address 設定済" },
  { key: "planEligible", label: "plan資格", tooltip: "airdrop 対象 plan" },
  { key: "notFlagged", label: "正常", tooltip: "flagged=false" },
  { key: "underDailyLimit", label: "日次内", tooltip: "日次上限内" },
  { key: "notClaimed", label: "未claim", tooltip: "対象期間で未 claim" },
  { key: "activityEligible", label: "活動OK", tooltip: "必要 activity を満たす" },
];
const pad2 = (value: number): string => value.toString().padStart(2, "0");
const dateTime = (value: unknown): string => {
  if (typeof value !== "string") return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : `${pad2(date.getMonth() + 1)}/${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};
const numberUnit =
  (unit: string) =>
  (value: unknown): string =>
    typeof value === "number" && Number.isFinite(value) ? `${value.toLocaleString()}${unit}` : "—";
const STATES: FlagSnapshotStateColumn[] = [
  { key: "estimatedAmount", label: "見込", format: numberUnit("pt") },
  { key: "dailyAccumulated", label: "日次累積", format: numberUnit("s") },
  { key: "lastActivityAt", label: "最終活動", format: dateTime },
];
const OK = {
  walletConnected: true,
  planEligible: true,
  notFlagged: true,
  underDailyLimit: true,
  notClaimed: true,
  activityEligible: true,
};
const mockParticipant = (
  userId: string,
  displayName: string,
  walletAddress: boolean,
  plan: string,
  flags: Partial<Record<string, boolean>>,
  state: Record<string, unknown>,
): FlagSnapshotParticipant => ({
  userId,
  displayName,
  walletAddress,
  plan,
  flags: { ...OK, ...flags } as Record<string, boolean>,
  state,
});
const ROOMS: FlagSnapshotRoom[] = [
  {
    roomId: "airdrop-cycle-2026-05",
    participantCount: 3,
    participants: [
      mockParticipant(
        "mock-airdrop-ok",
        "Mock Eligible",
        true,
        "personal",
        {},
        {
          estimatedAmount: 120,
          dailyAccumulated: 1840,
          lastActivityAt: "2026-05-04T07:45:00.000Z",
        },
      ),
      mockParticipant(
        "mock-airdrop-claimed",
        "Mock Claimed",
        true,
        "pro",
        { notClaimed: false },
        {
          estimatedAmount: 0,
          dailyAccumulated: 4200,
          lastActivityAt: "2026-05-04T06:12:00.000Z",
        },
      ),
      mockParticipant(
        "mock-airdrop-no-wallet",
        "Mock Wallet Missing",
        false,
        "free",
        { walletConnected: false, planEligible: false },
        {
          estimatedAmount: 0,
          dailyAccumulated: 910,
          lastActivityAt: "2026-05-04T05:28:00.000Z",
        },
      ),
    ],
  },
];

export function AirdropEligibilityClient() {
  return (
    <div className="space-y-4">
      <TabDescription>
        airdrop 判定フラグを FlagSnapshotTable で表示する設計検証用の mock 画面です。 データ接続は
        Phase 4+ 別 PR で `/api/admin/metrics?type=airdrop` に接続予定です。
      </TabDescription>
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-amber-300">
          mock
        </span>
        <span>Phase 4+ 別 PR で接続予定</span>
      </div>
      <FlagSnapshotTable
        rooms={ROOMS}
        flagColumns={FLAGS}
        stateColumns={STATES}
        emptyMessage="airdrop eligibility snapshot はまだ接続されていません。"
      />
    </div>
  );
}
