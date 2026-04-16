import { Pool } from "pg";

// Reticulum DB への直接接続。読み取り専用ロールの接続文字列を
// RETICULUM_DB_URL に設定する想定。未設定時は機能無効化。
const connectionString = process.env.RETICULUM_DB_URL;

const globalPool = globalThis as unknown as { __reticulumPool?: Pool };

function getPool(): Pool | null {
  if (!connectionString) return null;
  if (globalPool.__reticulumPool) return globalPool.__reticulumPool;
  const pool = new Pool({
    connectionString,
    max: 3,
    idleTimeoutMillis: 30_000,
    statement_timeout: 5_000,
  });
  globalPool.__reticulumPool = pool;
  return pool;
}

export type HubsAccount = {
  account_id: number;
  email: string;
  display_name: string | null;
  identity_name: string | null;
  created_at: string;
};

// Reticulum CE (reticulum Phoenix app) の標準スキーマを前提:
//   accounts(id, state, min_token_version, inserted_at, updated_at)
//   logins(account_id, identifier)           -- identifier は email
//   accounts.identity has_one identities(account_id, name)
// スキーマ差異がある場合はここを調整する。
// Reticulum は logins.identifier_hash に base64(sha256(email + secret)) を
// 保存しているが、portal 側からはその secret が取れないため直接メール検索が
// できない。当面の運用では、Supabase 側で管理する「プロフィールに保存済みの
// hubs_account_id」を主キーに使い、DB ルックアップは以下の 2 経路に留める:
// 1) account_id が分かっている場合は account_id で直接引く
// 2) それ以外は fallback として is_admin=true のアカウントを 1 件返す
//    （現状 boundarylabo は admin 1 人運用のため）
const LOOKUP_BY_ACCOUNT_ID_SQL = `
  SELECT
    a.account_id,
    a.boundary_display_name AS identity_name_boundary,
    i.name AS identity_name,
    a.is_admin,
    a.inserted_at AS created_at
  FROM accounts a
  LEFT JOIN identities i ON i.account_id = a.account_id
  WHERE a.account_id = $1
  LIMIT 1
`;

const LOOKUP_ADMIN_SQL = `
  SELECT
    a.account_id,
    a.boundary_display_name AS identity_name_boundary,
    i.name AS identity_name,
    a.is_admin,
    a.inserted_at AS created_at
  FROM accounts a
  LEFT JOIN identities i ON i.account_id = a.account_id
  WHERE a.is_admin = true
  ORDER BY a.account_id
  LIMIT 1
`;

const LOOKUP_HUB_NAMES_SQL = `
  SELECT
    hub_sid,
    name
  FROM hubs
  WHERE hub_sid = ANY($1::text[])
`;

type AccountRow = {
  account_id: number | string;
  identity_name: string | null;
  identity_name_boundary: string | null;
  is_admin: boolean;
  created_at: Date | string;
};

function rowToAccount(row: AccountRow, email: string): HubsAccount {
  const displayName = row.identity_name_boundary ?? row.identity_name ?? null;
  return {
    account_id: Number(row.account_id),
    email,
    display_name: displayName,
    identity_name: displayName,
    created_at:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

export async function lookupAccountById(
  accountId: number | string,
  email: string,
): Promise<HubsAccount | null> {
  const pool = getPool();
  if (!pool) return null;
  const res = await pool.query<AccountRow>(LOOKUP_BY_ACCOUNT_ID_SQL, [accountId]);
  const row = res.rows[0];
  return row ? rowToAccount(row, email) : null;
}

export async function lookupAdminAccount(email: string): Promise<HubsAccount | null> {
  const pool = getPool();
  if (!pool) return null;
  const res = await pool.query<AccountRow>(LOOKUP_ADMIN_SQL);
  const row = res.rows[0];
  return row ? rowToAccount(row, email) : null;
}

/**
 * Supabase の user.email から Hubs account を探す。
 * 現状 Reticulum の identifier_hash アルゴリズムが確定していないため、
 * ADM_EMAIL と一致すれば is_admin アカウントを返す fallback 実装。
 */
export async function lookupAccountByEmail(email: string): Promise<HubsAccount | null> {
  const pool = getPool();
  if (!pool) return null;
  const admEmail = (process.env.RETICULUM_ADM_EMAIL || "").trim().toLowerCase();
  if (admEmail && admEmail === email.trim().toLowerCase()) {
    return lookupAdminAccount(email);
  }
  return null;
}

export function isReticulumDbConfigured(): boolean {
  return Boolean(connectionString);
}

export async function lookupHubNames(hubIds: string[]): Promise<Record<string, string>> {
  const pool = getPool();
  if (!pool) return {};

  const ids = [...new Set(hubIds.map((value) => value.trim()).filter(Boolean))];
  if (ids.length === 0) return {};

  const res = await pool.query<{ hub_sid: string; name: string | null }>(LOOKUP_HUB_NAMES_SQL, [ids]);

  return Object.fromEntries(
    res.rows
      .map((row) => [row.hub_sid, row.name?.trim() ?? ""] as const)
      .filter((entry) => entry[1].length > 0),
  );
}
