"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }
    setStatus("sent");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="mb-2 text-2xl font-bold">境界設計室 / Boundary LAB</h1>
      <p className="mb-8 text-sm text-neutral-600">Magic Link でサインイン</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-black px-4 py-2 outline-none"
        />
        <button
          type="submit"
          disabled={status === "sending" || status === "sent"}
          className="w-full bg-black py-2 text-white disabled:opacity-50"
        >
          {status === "sending" ? "送信中…" : "Magic Link を送る"}
        </button>
      </form>

      {status === "sent" && (
        <p className="mt-4 text-sm">
          {email} にサインインリンクを送信しました。メールを確認してください。
        </p>
      )}
      {status === "error" && <p className="mt-4 text-sm text-red-600">{errorMessage}</p>}
    </main>
  );
}
