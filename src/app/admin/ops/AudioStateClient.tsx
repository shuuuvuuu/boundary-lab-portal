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
  {
    key: "noGhost",
    label: "ghostなし",
    tooltip: "audio element count と publication count が整合",
  },
];

const STATES: FlagSnapshotStateColumn[] = [
  { key: "audio_element_count", label: "audio elements" },
  { key: "publication_count", label: "publications" },
  { key: "ghost_detected", label: "ghost_detected" },
];

function participant(
  userId: string,
  displayName: string,
  audioElementCount: number,
  publicationCount: number,
  ghostDetected: boolean,
): FlagSnapshotParticipant {
  return {
    userId,
    displayName,
    walletAddress: true,
    plan: "mock",
    flags: { noGhost: !ghostDetected },
    state: {
      audio_element_count: audioElementCount,
      publication_count: publicationCount,
      ghost_detected: ghostDetected,
    },
  };
}

const ROOMS: FlagSnapshotRoom[] = [
  {
    roomId: "audio-state-mock",
    participantCount: 3,
    participants: [
      participant("mock-audio-ok", "Mock Audio OK", 1, 1, false),
      participant("mock-audio-muted", "Mock Muted", 0, 0, false),
      participant("mock-audio-ghost", "Mock Ghost Candidate", 2, 1, true),
    ],
  },
];

export function AudioStateClient() {
  return (
    <div className="space-y-4">
      <TabDescription>
        audio element count / publication count / ghost_detected を user 単位で並べる枠です。
        現状は完全 mock で、rezona 側 metric 追加待ち (Phase 5+ 別 PR) です。
      </TabDescription>
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-amber-300">
          mock
        </span>
        <span>TODO: rezona getUserAudioState() + /api/admin/metrics?type=audio</span>
      </div>
      <FlagSnapshotTable
        rooms={ROOMS}
        flagColumns={FLAGS}
        stateColumns={STATES}
        emptyMessage="audio state snapshot はまだ接続されていません。"
      />
    </div>
  );
}
