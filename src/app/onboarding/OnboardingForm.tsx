"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type OnboardingFormProps = {
  initialEmail: string;
  initialPendingEmail: string | null;
  next: string;
};

export function OnboardingForm({
  initialEmail,
  initialPendingEmail,
  next,
}: OnboardingFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setErrorMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ email });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }

    setStatus("success");
    window.setTimeout(() => {
      router.replace(next);
      router.refresh();
    }, 800);
  }

  const inputClass =
    "w-full rounded-md border border-white/10 bg-bg-primary px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-accent-primary focus:ring-1 focus:ring-accent-primary";

  return (
    <div className="space-y-4">
      {initialPendingEmail && status !== "success" ? (
        <p className="rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-200">
          {initialPendingEmail} 宛てに確認メールを送信済みです。別のメールアドレスに変更する場合は、下から再送してください。
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block">
          <span className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            Email
          </span>
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={status === "saving"}
            className={inputClass}
          />
        </label>

        <button
          type="submit"
          disabled={status === "saving"}
          className="w-full rounded-md bg-accent-primary py-2.5 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-50"
        >
          {status === "saving" ? "送信中…" : "確認メールを送る"}
        </button>
      </form>

      {status === "success" ? (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
          確認メールを送信しました。認証完了後に自動でホームへ戻ります。
        </p>
      ) : null}

      {status === "error" ? (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
