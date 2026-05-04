"use client";

import { useEffect, useMemo, useState } from "react";

export type FlagSnapshotParticipant = {
  userId: string;
  displayName: string;
  walletAddress: boolean;
  plan?: string | null;
  isStaff?: boolean;
  flags: Record<string, boolean>;
  state?: Record<string, unknown>;
};
export type FlagSnapshotRoom = {
  roomId: string;
  participantCount: number;
  participants: FlagSnapshotParticipant[];
};
export type FlagSnapshotFlagColumn = { key: string; label: string; tooltip?: string };
export type FlagSnapshotStateColumn = {
  key: string;
  label: string;
  format?: (v: unknown) => string;
};
export type FlagSnapshotTableProps = {
  rooms: FlagSnapshotRoom[];
  flagColumns: FlagSnapshotFlagColumn[];
  stateColumns?: FlagSnapshotStateColumn[];
  emptyMessage?: string;
};

function shortId(id: string): string {
  return id.length <= 14 ? id : `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function cellValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return Number.isFinite(value) ? value.toLocaleString() : "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return value;
  return JSON.stringify(value) ?? "—";
}

function StatusIcon({ value }: { value: boolean | undefined }) {
  const tone =
    value === true
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
      : value === false
        ? "border-red-500/40 bg-red-500/10 text-red-300"
        : "border-slate-700 bg-slate-800/60 text-slate-500";
  return (
    <span
      className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-sm font-semibold ${tone}`}
    >
      {value === true ? "✓" : value === false ? "×" : "?"}
    </span>
  );
}

export function FlagSnapshotTable({
  rooms,
  flagColumns,
  stateColumns = [],
  emptyMessage = "表示できる snapshot はありません。",
}: FlagSnapshotTableProps) {
  const [activeRoomId, setActiveRoomId] = useState(rooms[0]?.roomId ?? "");

  useEffect(() => {
    if (!rooms.some((room) => room.roomId === activeRoomId)) {
      setActiveRoomId(rooms[0]?.roomId ?? "");
    }
  }, [activeRoomId, rooms]);

  const activeRoom = useMemo(
    () => rooms.find((room) => room.roomId === activeRoomId) ?? rooms[0] ?? null,
    [activeRoomId, rooms],
  );

  if (!activeRoom) {
    return (
      <p className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-6 text-sm text-slate-400">
        {emptyMessage}
      </p>
    );
  }

  return (
    <section className="space-y-3">
      <nav className="flex flex-wrap gap-2">
        {rooms.map((room) => (
          <button
            key={room.roomId}
            type="button"
            onClick={() => setActiveRoomId(room.roomId)}
            className={`rounded border px-3 py-1.5 text-xs transition ${
              room.roomId === activeRoom.roomId
                ? "border-sky-500/40 bg-sky-500/10 text-sky-200"
                : "border-slate-800 bg-slate-900/40 text-slate-400 hover:text-slate-200"
            }`}
          >
            {room.roomId}
            <span className="ml-2 tabular-nums text-slate-500">{room.participantCount}</span>
          </button>
        ))}
      </nav>

      <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/40">
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-800 text-xs text-slate-400">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Participant</th>
              <th className="px-2 py-2 text-center font-medium">wallet</th>
              <th className="px-2 py-2 text-center font-medium">判定</th>
              {flagColumns.map((column) => (
                <th
                  key={column.key}
                  className="px-2 py-2 text-center font-medium"
                  title={column.tooltip}
                >
                  {column.label}
                </th>
              ))}
              {stateColumns.map((column) => (
                <th key={column.key} className="px-3 py-2 text-right font-medium">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {activeRoom.participants.length === 0 && (
              <tr>
                <td
                  colSpan={3 + flagColumns.length + stateColumns.length}
                  className="px-4 py-6 text-sm text-slate-400"
                >
                  この room に participant はいません。
                </td>
              </tr>
            )}
            {activeRoom.participants.map((participant) => {
              const values = flagColumns.map((column) => participant.flags[column.key]);
              const failed = values.filter((value) => value === false).length;
              const unknown = values.filter((value) => typeof value !== "boolean").length;
              const allOk = values.length > 0 && failed === 0 && unknown === 0;
              return (
                <tr
                  key={`${activeRoom.roomId}:${participant.userId}`}
                  className={allOk ? "bg-emerald-500/[0.04]" : undefined}
                >
                  <td className="min-w-56 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-100">
                        {participant.displayName || "(no name)"}
                      </span>
                      {participant.isStaff && (
                        <span className="rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-300">
                          staff
                        </span>
                      )}
                      {participant.plan && (
                        <span className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-400">
                          {participant.plan}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-slate-500">
                      {shortId(participant.userId)}
                    </div>
                  </td>
                  <td className="px-2 py-3 text-center">
                    <StatusIcon value={participant.walletAddress} />
                  </td>
                  <td className="px-2 py-3 text-center">
                    <span
                      className={`rounded border px-2 py-1 text-[11px] ${
                        allOk
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                          : "border-slate-700 bg-slate-900 text-slate-300"
                      }`}
                    >
                      {allOk ? "全OK" : `NG ${failed} / 不明 ${unknown}`}
                    </span>
                  </td>
                  {flagColumns.map((column) => (
                    <td key={column.key} className="px-2 py-3 text-center">
                      <StatusIcon value={participant.flags[column.key]} />
                    </td>
                  ))}
                  {stateColumns.map((column) => {
                    const value = participant.state?.[column.key];
                    return (
                      <td
                        key={column.key}
                        className="whitespace-nowrap px-3 py-3 text-right font-mono text-xs tabular-nums text-slate-300"
                      >
                        {column.format ? column.format(value) : cellValue(value)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
