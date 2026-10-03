create table if not exists public.asta_campaigns (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  type text not null check (type in ('prospection','relance','publication')),
  service text, zone text, sector text,
  target_count integer not null default 20 check (target_count between 1 and 500),
  conditions text,
  start_date date not null, end_date date not null,
  status text not null default 'draft' check (status in ('draft','active','paused','completed','cancelled')),
  created_by uuid, validated_by uuid, validated_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create table if not exists public.asta_campaign_profiles (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.asta_campaigns(id) on delete cascade,
  prospect_id uuid references public.asta_prospects(id) on delete set null,
  dedupe_key text not null,
  name text not null, sector text, city text, source_url text, public_contact text, reason text, fit_score integer,
  status text not null default 'proposed' check (status in ('proposed','accepted','rejected','contacted','replied','meeting','do_not_contact')),
  contacted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, dedupe_key)
);
create table if not exists public.asta_campaign_actions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.asta_campaigns(id) on delete cascade,
  profile_id uuid references public.asta_campaign_profiles(id) on delete cascade,
  slot_key text not null,
  kind text not null check (kind in ('publication','message')),
  title text not null,
  content jsonb not null default '{}'::jsonb,
  status text not null default 'proposed' check (status in ('proposed','approved','done','cancelled')),
  scheduled_at timestamptz,
  sent_count integer not null default 0, reply_count integer not null default 0, meeting_count integer not null default 0,
  decided_by uuid, decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, slot_key)
);
create table if not exists public.asta_ai_usage (
  id bigint generated always as identity primary key,
  kind text not null,
  created_at timestamptz not null default now()
);
alter table public.asta_diagnostic_sessions add column if not exists campaign_code text;
alter table public.asta_prospects add column if not exists do_not_contact boolean not null default false;
create index if not exists asta_sessions_campaign_idx on public.asta_diagnostic_sessions(campaign_code);
create index if not exists asta_profiles_campaign_idx on public.asta_campaign_profiles(campaign_id, status);
create index if not exists asta_actions_campaign_idx on public.asta_campaign_actions(campaign_id, status);
create index if not exists asta_ai_usage_idx on public.asta_ai_usage(kind, created_at);

alter table public.asta_campaigns enable row level security;
alter table public.asta_campaign_profiles enable row level security;
alter table public.asta_campaign_actions enable row level security;
alter table public.asta_ai_usage enable row level security;
revoke all on public.asta_campaigns, public.asta_campaign_profiles, public.asta_campaign_actions, public.asta_ai_usage from anon, authenticated;
