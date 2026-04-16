"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginShell>読み込み中…</LoginShell>}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [oauthStatus, setOauthStatus] = useState<"idle" | "starting" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [implicitRecovery, setImplicitRecovery] = useState<"idle" | "processing" | "error">("idle");
  const next = sanitizeNext(searchParams.get("next"));

  // Supabase magic link の implicit flow は tokens をハッシュで返すため、
  // サーバー側 /auth/callback は code を拾えず /login?error=no_code に転送される。
  // ここでハッシュを拾って setSession し、home に遷移する。
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash || !hash.includes("access_token")) return;

    const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!accessToken || !refreshToken) return;

    setImplicitRecovery("processing");
    const supabase = createClient();
    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (error) {
          setImplicitRecovery("error");
          setErrorMessage(`セッション復元に失敗: ${error.message}`);
          return;
        }
        // ハッシュを消して遷移（history 汚染防止）
        window.history.replaceState(null, "", window.location.pathname);
        window.location.href = next;
      });
  }, [next]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setOauthStatus("idle");
    setErrorMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: getCallbackUrl(next),
      },
    });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }
    setStatus("sent");
  }

  async function handleTwitterLogin() {
    setOauthStatus("starting");
    setStatus("idle");
    setErrorMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "x",
      options: {
        redirectTo: getCallbackUrl(next),
      },
    });

    if (error) {
      setOauthStatus("error");
      setErrorMessage(error.message);
    }
  }

  const callbackError = getCallbackErrorMessage(
    searchParams.get("error"),
    searchParams.get("oauth_error"),
    searchParams.get("oauth_error_code"),
    searchParams.get("oauth_error_description"),
  );

  if (implicitRecovery === "processing") {
    return <LoginShell>セッション復元中…</LoginShell>;
  }

  return (
    <LoginShell>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-primary/20 text-accent-soft">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">境界設計室 / Boundary LAB</h1>
          <p className="text-xs text-slate-400">Magic Link または X でサインイン</p>
        </div>
      </div>

      <div className="space-y-3">
        <button
          type="button"
          onClick={handleTwitterLogin}
          disabled={oauthStatus === "starting"}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white py-2.5 text-sm font-medium text-slate-950 transition hover:bg-slate-100 disabled:opacity-50"
        >
          <IconX />
          {oauthStatus === "starting" ? "X に接続中…" : "X でログイン"}
        </button>

        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="h-px flex-1 bg-white/10" />
          <span>または</span>
          <span className="h-px flex-1 bg-white/10" />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-3 space-y-3">
        <input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-white/10 bg-bg-primary px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-accent-primary focus:ring-1 focus:ring-accent-primary"
        />
        <button
          type="submit"
          disabled={status === "sending" || status === "sent"}
          className="w-full rounded-md bg-accent-primary py-2.5 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-50"
        >
          {status === "sending" ? "送信中…" : status === "sent" ? "送信済み" : "Magic Link を送る"}
        </button>
      </form>

      {status === "sent" && (
        <p className="mt-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
          {email} にサインインリンクを送信しました。メールを確認してください。
        </p>
      )}
      {callbackError && (
        <p className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {callbackError}
        </p>
      )}
      {status === "error" && (
        <p className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {errorMessage}
        </p>
      )}
      {oauthStatus === "error" && (
        <p className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {errorMessage}
        </p>
      )}
    </LoginShell>
  );
}

function LoginShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-primary px-6 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-white/5 bg-bg-secondary/60 p-8 shadow-card">
          {children}
        </div>
        <p className="mt-6 text-center text-xs text-slate-500">境界を越える体験を設計する</p>
      </div>
    </main>
  );
}

function sanitizeNext(value: string | null): string {
  if (!value || !value.startsWith("/")) {
    return "/";
  }

  return value;
}

function getCallbackErrorMessage(
  code: string | null,
  oauthError?: string | null,
  oauthErrorCode?: string | null,
  oauthErrorDescription?: string | null,
): string | null {
  switch (code) {
    case "no_code":
      return "認証コードが見つかりませんでした。もう一度ログインしてください。";
    case "auth_callback_failed":
      return "認証コールバックの処理に失敗しました。もう一度お試しください。";
    case "profile_sync_failed":
      return "プロフィールの同期に失敗しました。時間をおいて再度お試しください。";
    case "oauth_error": {
      const parts = [
        oauthError ? `エラー: ${oauthError}` : null,
        oauthErrorCode ? `コード: ${oauthErrorCode}` : null,
        oauthErrorDescription ? `詳細: ${oauthErrorDescription}` : null,
      ].filter(Boolean);
      return `OAuth プロバイダからエラーが返されました。${parts.length ? ` (${parts.join(" / ")})` : ""}`;
    }
    default:
      return null;
  }
}

function getCallbackUrl(next: string): string {
  return new URL(
    `/auth/callback?next=${encodeURIComponent(next)}`,
    process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin,
  ).toString();
}

function IconX() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 1200 1227" fill="none">
      <path
        fill="currentColor"
        d="M714.2 519.3 1160.9 0h-105.8L667.2 450.9 357.6 0H0l468.5 681.8L0 1226.4h105.8l409.7-476.2 327.2 476.2H1200L714.2 519.3ZM569.1 688.1l-47.4-67.8L144.2 79.8h162.8l304.7 436 47.4 67.8 396 566.6H892.3L569.1 688.1Z"
      />
    </svg>
  );
}
