const OWNER_EMAILS = (process.env.OWNER_EMAILS ?? "runbirdgensou@gmail.com")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return OWNER_EMAILS.includes(email.toLowerCase());
}

/**
 * GUEST_OPS_ENABLED=true の時のみ true を返す。
 * 明示的に文字列 "true" である場合のみ有効化する（デフォルト false）。
 *
 * 有効化すると /admin/ops と関連する読み取り API が
 * 未ログイン含む誰でも read-only で閲覧可能になる。
 */
export function isGuestOpsEnabled(): boolean {
  return process.env.GUEST_OPS_ENABLED === "true";
}

/**
 * owner email であるか、または GUEST_OPS_ENABLED=true の場合に true を返す。
 * GUEST_OPS_ENABLED=true の時は email が null/undefined でも通す（未ログインゲスト許容）。
 */
export function isOwnerOrGuestAllowed(email: string | null | undefined): boolean {
  if (isOwnerEmail(email)) return true;
  if (isGuestOpsEnabled()) return true;
  return false;
}
