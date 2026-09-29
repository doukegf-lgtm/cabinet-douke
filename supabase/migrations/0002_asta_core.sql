create extension if not exists pgcrypto;

create table if not exists public.asta_prospects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  full_name text, whatsapp text, country text, sector text, company_age text,
  stage text not null default 'nouveau'
    check (stage in ('nouveau','diagnostic_propose','diagnostic_termine','formation','pret_a_payer','client')),
  next_action text, next_action_at timestamptz,
  consent_at timestamptz, consent_text text, source text not null default 'web'
);
create unique index if not exists asta_prospects_whatsapp_uq on public.asta_prospects(whatsapp) where whatsapp is not null;

create table if not exists public.asta_diagnostic_sessions (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references public.asta_prospects(id),
  definition_version text not null,
  token_hash text not null unique,
  ip_hash text,
  mode text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create table if not exists public.asta_diagnostic_answers (
  session_id uuid not null references public.asta_diagnostic_sessions(id) on delete cascade,
  question_key text not null,
  value jsonb not null,
  answered_at timestamptz not null default now(),
  primary key (session_id, question_key)
);
create table if not exists public.asta_diagnostic_results (
  session_id uuid primary key references public.asta_diagnostic_sessions(id) on delete cascade,
  scores jsonb not null, total int not null, band text not null,
  computed_at timestamptz not null default now()
);
create table if not exists public.asta_events (
  id bigint generated always as identity primary key,
  type text not null,
  session_id uuid, prospect_id uuid,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

-- Fermé par défaut : aucune politique = aucun accès avec la clé publique. Seul le serveur (service_role) y accède.
alter table public.asta_prospects enable row level security;
alter table public.asta_diagnostic_sessions enable row level security;
alter table public.asta_diagnostic_answers enable row level security;
alter table public.asta_diagnostic_results enable row level security;
alter table public.asta_events enable row level security;
revoke all on public.asta_prospects, public.asta_diagnostic_sessions, public.asta_diagnostic_answers,
  public.asta_diagnostic_results, public.asta_events from anon, authenticated;
