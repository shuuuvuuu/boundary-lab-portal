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
const LOOKUP_BY_EMAIL_SQL = `
  SELECT
    a.account_id,
    l.identifier AS email,
    i.name AS identity_name,
    a.inserted_at AS created_at
  FROM accounts a
  JOIN logins l ON l.account_id = a.account_id
  LEFT JOIN identities i ON i.account_id = a.account_id
  WHERE lower(l.identifier) = lower($1)
  LIMIT 1
`;

const LOOKUP_HUB_NAMES_SQL = `
  SELECT
    hub_sid,
    name
  FROM hubs
  WHERE hub_sid = ANY($1::text[])
`;

export async function lookupAccountByEmail(email: string): Promise<HubsAccount | null> {
  const pool = getPool();
  if (!pool) return null;

  const res = await pool.query<{
    account_id: number | string;
    email: string;
    identity_name: string | null;
    created_at: Date | string;
  }>(LOOKUP_BY_EMAIL_SQL, [email]);

  const row = res.rows[0];
  if (!row) return null;

  return {
    account_id: Number(row.account_id),
    email: row.email,
    display_name: row.identity_name,
    identity_name: row.identity_name,
    created_at:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
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
