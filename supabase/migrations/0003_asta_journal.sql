create table if not exists public.asta_daily_reports (
  day date primary key,
  kpis jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.asta_daily_reports enable row level security;
revoke all on public.asta_daily_reports from anon, authenticated;
create index if not exists asta_events_created_idx on public.asta_events(created_at);
create index if not exists asta_sessions_started_idx on public.asta_diagnostic_sessions(started_at);
