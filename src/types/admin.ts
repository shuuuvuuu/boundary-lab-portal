export type AdminRoomStatsRow = {
  hubId: string;
  roomName: string | null;
  activeDays: number;
  entryCount: number;
  uniqueVisitors: number;
  totalStaySeconds: number;
  averageStaySeconds: number | null;
  peakConcurrent: number | null;
  trafficMB: number | null;
  costJpy: number | null;
};

export type AdminRoomStatsResponse = {
  month: string;
  generatedAt: string;
  ongoingSessions: number;
  roomNameResolvedCount: number;
  roomCount: number;
  rows: AdminRoomStatsRow[];
};

export type AdminRoomMonthsResponse = {
  months: string[];
};
