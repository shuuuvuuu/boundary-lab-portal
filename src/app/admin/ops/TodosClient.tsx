"use client";

import { useCallback, useEffect, useState } from "react";
import { TabDescription } from "./TabDescription";

type Todo = {
  id: string;
  title: string;
  notes: string | null;
  due_at: string | null;
  status: "open" | "done" | "cancelled";
  priority: number;
  created_at: string;
  updated_at: string;
};

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; todos: Todo[]; note?: string }
  | { kind: "error"; message: string };

function priorityClass(p: number): string {
  if (p >= 2) return "bg-red-500/20 text-red-300 border-red-500/30";
  if (p === 1) return "bg-amber-500/20 text-amber-300 border-amber-500/30";
  return "bg-slate-600/20 text-slate-300 border-slate-500/30";
}

function dueClass(dueAt: string | null): string {
  if (!dueAt) return "text-slate-500";
  const ms = new Date(dueAt).getTime() - Date.now();
  if (ms < 0) return "text-red-300";
  if (ms < 7 * 24 * 60 * 60 * 1000) return "text-amber-300";
  return "text-slate-300";
}

export function TodosClient() {
  const [state, setState] = useState<FetchState>({ kind: "idle" });
  const [filter, setFilter] = useState<"open" | "all" | "done">("open");
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [priority, setPriority] = useState(0);
  const [hint, setHint] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch(`/api/admin/todos?status=${filter}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { todos: Todo[]; note?: string };
      setState({ kind: "ready", todos: json.todos, note: json.note });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "unknown error",
      });
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = useCallback(async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/admin/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          due_at: dueAt || undefined,
          priority,
        }),
      });
      if (res.status === 401 || res.status === 403) {
        setHint("owner ログインが必要です");
      } else if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setHint(`追加失敗: ${body.error ?? res.status}`);
      } else {
        setTitle("");
        setDueAt("");
        setPriority(0);
        setHint("追加しました");
        await load();
      }
    } catch (err) {
      setHint(`通信失敗: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCreating(false);
      setTimeout(() => setHint(null), 4000);
    }
  }, [title, dueAt, priority, load]);

  const handleStatusChange = useCallback(
    async (id: string, next: "open" | "done" | "cancelled") => {
      try {
        const res = await fetch("/api/admin/todos", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, status: next }),
        });
        if (res.status === 401 || res.status === 403) {
          setHint("owner ログインが必要です");
        } else if (!res.ok) {
          setHint(`更新失敗: HTTP ${res.status}`);
        } else {
          await load();
        }
      } catch (err) {
        setHint(`通信失敗: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setTimeout(() => setHint(null), 3000);
      }
    },
    [load],
  );

  const todos = state.kind === "ready" ? state.todos : [];

  return (
    <div className="space-y-4">
      <TabDescription>
        運用 TODO の追加・期限管理を行うシンプルなタブです。期限を設定すると、
        毎日 UTC 23:00 に
        <code className="mx-1 rounded bg-slate-800 px-1">todo-notify</code>
        ジョブが「期限切れ」「期限まで 7 日以内」を集計して Discord に投げます。
        優先度 (0 / 1 / 2) で色分け、完了したら「done」に切り替えてアーカイブできます。
      </TabDescription>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40">
        <header className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-4 py-3">
          <h2 className="font-medium">TODO 追加</h2>
        </header>
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="タイトル"
            className="flex-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100 placeholder:text-slate-500"
          />
          <input
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100"
          />
          <select
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100"
          >
            <option value={0}>普通</option>
            <option value={1}>注意</option>
            <option value={2}>最優先</option>
          </select>
          <button
            type="button"
            disabled={creating || !title.trim()}
            onClick={handleCreate}
            className="rounded bg-sky-600 px-3 py-1 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-60"
          >
            {creating ? "追加中…" : "追加"}
          </button>
        </div>
        {hint && <p className="border-t border-slate-800 px-4 py-2 text-xs text-amber-300">{hint}</p>}
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40">
        <header className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-4 py-3">
          <h2 className="font-medium">一覧</h2>
          <div className="flex rounded border border-slate-700 bg-slate-800 p-0.5 text-xs">
            {(["open", "done", "all"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setFilter(opt)}
                className={`rounded px-2 py-1 transition ${
                  filter === opt ? "bg-slate-700 text-slate-100" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </header>
        <ul className="divide-y divide-slate-800">
          {state.kind === "ready" && state.note && (
            <li className="px-4 py-3 text-xs text-amber-300">{state.note}</li>
          )}
          {todos.map((todo) => (
            <li key={todo.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <span className={`rounded border px-1.5 py-0.5 text-xs ${priorityClass(todo.priority)}`}>
                P{todo.priority}
              </span>
              <span className="flex-1 text-slate-100">{todo.title}</span>
              <span className={`text-xs ${dueClass(todo.due_at)}`}>
                {todo.due_at ? new Date(todo.due_at).toLocaleString("ja-JP") : "(期限なし)"}
              </span>
              <span className="text-xs text-slate-500">{todo.status}</span>
              {todo.status === "open" && (
                <button
                  type="button"
                  onClick={() => handleStatusChange(todo.id, "done")}
                  className="rounded bg-emerald-600 px-2 py-0.5 text-xs text-white hover:bg-emerald-500"
                >
                  完了
                </button>
              )}
              {todo.status === "done" && (
                <button
                  type="button"
                  onClick={() => handleStatusChange(todo.id, "open")}
                  className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800"
                >
                  戻す
                </button>
              )}
            </li>
          ))}
          {todos.length === 0 && state.kind === "ready" && (
            <li className="px-4 py-6 text-sm text-slate-400">該当する TODO はありません</li>
          )}
          {state.kind === "error" && (
            <li className="px-4 py-6 text-sm text-red-300">エラー: {state.message}</li>
          )}
        </ul>
      </section>
    </div>
  );
}
