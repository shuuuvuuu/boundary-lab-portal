-- service_health_checks: 外部サービスのヘルスチェック履歴
-- Phase D-1b: health poller が service_role で書き込む
-- SELECT も service_role 経由で API ルートから。通常ユーザーは RLS により全拒否。

create table if not exists public.service_health_checks (
  id uuid primary key default gen_random_uuid(),
  service text not null,
  endpoint text not null,
  status_code integer,
  response_time_ms integer,
  ok boolean not null default false,
  error_message text,
  checked_at timestamptz not null default now()
);

create index if not exists idx_health_checks_service_checked
  on public.service_health_checks (service, checked_at desc);

-- owner email のみ API ルート経由 (service_role) で select/insert する想定。
-- RLS を有効化するがポリシーは定義しないため、認証ユーザーからは全拒否。
-- service_role は RLS をバイパスするため、サーバーサイドからの INSERT / SELECT は問題なく通る。
alter table public.service_health_checks enable row level security;
