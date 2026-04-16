import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getPreferredEmail,
  hasPendingEmailVerification,
  hasVerifiedEmailIdentity,
} from "@/lib/auth/user-state";
import { OnboardingForm } from "./OnboardingForm";

export const dynamic = "force-dynamic";

type OnboardingPageProps = {
  searchParams?: Promise<{
    next?: string;
  }>;
};

export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const next = sanitizeNext(params?.next);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  if (hasVerifiedEmailIdentity(user)) {
    redirect(next);
  }

  const description = hasPendingEmailVerification(user)
    ? "確認メールを送信済みです。別のメールアドレスへ変更する場合は、下のフォームから再送してください。"
    : "X ログインで使うメールアドレスを登録してください。確認メールの認証後に、運営タブのメール確認ガードも通過できます。";

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-primary px-6 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-white/5 bg-bg-secondary/60 p-8 shadow-card">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Onboarding</p>
          <h1 className="mt-2 text-2xl font-bold text-white">メールアドレスを登録</h1>
          <p className="mt-2 text-sm text-slate-400">{description}</p>
        </div>

        <OnboardingForm
          initialEmail={getPreferredEmail(user) ?? ""}
          next={next}
          initialPendingEmail={hasPendingEmailVerification(user) ? user.new_email ?? null : null}
        />
      </div>
    </main>
  );
}

function sanitizeNext(value?: string): string {
  if (!value || !value.startsWith("/")) {
    return "/";
  }

  return value;
}
