"use client";

import { useEffect, useMemo, useState } from "react";
import type { CalendarEventSummary } from "@/types/database";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function addMonths(value: Date, delta: number) {
  return new Date(value.getFullYear(), value.getMonth() + delta, 1);
}

function toDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMonthLabel(value: Date) {
  return `${value.getFullYear()}年${value.getMonth() + 1}月`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function eventTouchesDate(event: CalendarEventSummary, day: Date) {
  const start = new Date(event.starts_at);
  const end = new Date(event.ends_at);
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  return start < dayEnd && end >= dayStart;
}

function eventTouchesMonth(event: CalendarEventSummary, month: Date) {
  const monthStart = startOfMonth(month);
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
  return new Date(event.starts_at) < monthEnd && new Date(event.ends_at) >= monthStart;
}

function buildGridDays(month: Date) {
  const monthStart = startOfMonth(month);
  const firstWeekDay = monthStart.getDay();
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - firstWeekDay);

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
}

export function MonthlyCalendarPanel({
  events,
  showOwner = false,
  createButtonLabel,
  onCreateClick,
  initialMonth,
}: {
  events: CalendarEventSummary[];
  showOwner?: boolean;
  createButtonLabel?: string;
  onCreateClick?: () => void;
  initialMonth?: Date;
}) {
  const [cursor, setCursor] = useState(() => startOfMonth(initialMonth ?? new Date()));
  const [selectedDateKey, setSelectedDateKey] = useState(() => toDateKey(new Date()));

  useEffect(() => {
    if (!initialMonth) {
      return;
    }
    setCursor(startOfMonth(initialMonth));
  }, [initialMonth]);

  const monthDays = useMemo(() => buildGridDays(cursor), [cursor]);
  const monthlyEvents = useMemo(
    () =>
      [...events]
        .filter((event) => eventTouchesMonth(event, cursor))
        .sort(
          (left, right) =>
            new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime(),
        ),
    [cursor, events],
  );
  const selectedEvents = useMemo(
    () =>
      monthlyEvents.filter((event) =>
        eventTouchesDate(event, new Date(`${selectedDateKey}T00:00:00`)),
      ),
    [monthlyEvents, selectedDateKey],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCursor((current) => addMonths(current, -1))}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10"
          >
            前月
          </button>
          <button
            type="button"
            onClick={() => setCursor(startOfMonth(new Date()))}
            className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100 transition hover:bg-cyan-500/20"
          >
            今月
          </button>
          <button
            type="button"
            onClick={() => setCursor((current) => addMonths(current, 1))}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10"
          >
            翌月
          </button>
          <span className="ml-1 text-lg font-semibold text-white">{formatMonthLabel(cursor)}</span>
        </div>

        {onCreateClick ? (
          <button
            type="button"
            onClick={onCreateClick}
            className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-cyan-500"
          >
            {createButtonLabel ?? "+ イベント"}
          </button>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/10">
        <div className="grid grid-cols-7 border-b border-white/10 bg-white/[0.03]">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400"
            >
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {monthDays.map((day) => {
            const dateKey = toDateKey(day);
            const dayEvents = monthlyEvents.filter((event) => eventTouchesDate(event, day));
            const isCurrentMonth = day.getMonth() === cursor.getMonth();
            const isSelected = selectedDateKey === dateKey;
            const isToday = dateKey === toDateKey(new Date());

            return (
              <button
                key={dateKey}
                type="button"
                onClick={() => setSelectedDateKey(dateKey)}
                className={`min-h-28 border-b border-r border-white/5 px-2 py-2 text-left transition ${isSelected ? "bg-cyan-500/10" : "hover:bg-white/[0.03]"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm ${isToday ? "bg-cyan-500/20 text-cyan-100" : isCurrentMonth ? "text-white" : "text-slate-600"}`}
                  >
                    {day.getDate()}
                  </span>
                  {dayEvents.length > 0 ? (
                    <span className="text-[10px] text-slate-400">{dayEvents.length}件</span>
                  ) : null}
                </div>

                <div className="mt-2 space-y-1">
                  {dayEvents.slice(0, 3).map((event) => (
                    <div
                      key={event.id}
                      className={`h-1.5 rounded-full ${event.is_own ? "bg-cyan-400/80" : "bg-amber-300/80"}`}
                    />
                  ))}
                  {dayEvents.length === 0 ? (
                    <div className="h-1.5 rounded-full bg-transparent" />
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">{selectedDateKey.replaceAll("-", "/")}</p>
            <p className="mt-1 text-xs text-slate-400">クリックした日のイベント</p>
          </div>
          <span className="text-xs text-slate-500">{selectedEvents.length} 件</span>
        </div>

        {selectedEvents.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">この日のイベントはありません。</p>
        ) : (
          <div className="mt-4 space-y-3">
            {selectedEvents.map((event) => (
              <div
                key={event.id}
                className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${event.is_own ? "bg-cyan-500/15 text-cyan-100" : "bg-amber-400/15 text-amber-100"}`}
                  >
                    {event.is_own ? "My Event" : "Public Event"}
                  </span>
                  {event.world ? (
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-slate-300">
                      {event.world.name}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm font-medium text-white">{event.title}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {formatDateTime(event.starts_at)} 〜 {formatDateTime(event.ends_at)}
                </p>
                {showOwner && !event.is_own ? (
                  <p className="mt-1 text-xs text-slate-500">
                    主催 {event.owner_profile?.display_name?.trim() || "匿名"}
                  </p>
                ) : null}
                {event.description ? (
                  <p className="mt-2 text-sm leading-6 text-slate-300">{event.description}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-white">今月のイベント一覧</h3>
          <span className="text-xs text-slate-500">{monthlyEvents.length} 件</span>
        </div>

        {monthlyEvents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-sm text-slate-500">
            今月のイベントはありません。
          </div>
        ) : (
          <div className="space-y-3">
            {monthlyEvents.map((event) => (
              <div
                key={event.id}
                className="rounded-2xl border border-white/10 bg-slate-950/30 px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">{event.title}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {formatDateTime(event.starts_at)} 〜 {formatDateTime(event.ends_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {event.world ? (
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-slate-300">
                        {event.world.name}
                      </span>
                    ) : null}
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${event.is_own ? "bg-cyan-500/15 text-cyan-100" : "bg-amber-400/15 text-amber-100"}`}
                    >
                      {event.is_own ? "My Event" : "Public"}
                    </span>
                  </div>
                </div>
                {showOwner && !event.is_own ? (
                  <p className="mt-2 text-xs text-slate-500">
                    主催 {event.owner_profile?.display_name?.trim() || "匿名"}
                  </p>
                ) : null}
                {event.description ? (
                  <p className="mt-2 text-sm leading-6 text-slate-300">{event.description}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
