import type { User } from "@supabase/supabase-js";
import type { Profile } from "@/types/database";

type UserLike = Pick<User, "email" | "email_confirmed_at" | "identities" | "new_email">;
type ProfileLike = Pick<Profile, "email">;

export function hasVerifiedEmailIdentity(user: UserLike): boolean {
  return Boolean(
    user.email_confirmed_at ||
      user.identities?.some((identity) => identity.provider === "email"),
  );
}

export function getPreferredEmail(
  user: Pick<UserLike, "email" | "new_email">,
  profile?: ProfileLike | null,
): string | null {
  return user.email ?? user.new_email ?? profile?.email ?? null;
}

export function needsEmailOnboarding(user: UserLike): boolean {
  return !user.email && !user.new_email;
}

export function hasPendingEmailVerification(user: UserLike): boolean {
  return Boolean(user.new_email && user.new_email !== user.email);
}
