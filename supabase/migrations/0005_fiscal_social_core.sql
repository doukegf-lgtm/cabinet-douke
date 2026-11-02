-- Cabinet DOUKE - Module fiscal et social indépendant.
-- Migration à examiner et appliquer explicitement dans Supabase.
-- Aucun accès direct anon/authenticated.
-- Le serveur utilise exclusivement le service_role.

begin;

create extension if not exists pgcrypto;

create table if not exists public.fiscal_clients (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  legal_name text not null,
  ifu text,
  rccm text,
  phone text,
  email text,
  address text,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  created_by uuid,
  updated_by uuid
);

create unique index if not exists fiscal_clients_ifu_uq
  on public.fiscal_clients (ifu)
  where ifu is not null and ifu <> '';

create table if not exists public.fiscal_dossiers (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null
    references public.fiscal_clients(id) on delete restrict,
  dossier_type text not null
    check (dossier_type in (
      'regularisation_fiscale',
      'regularisation_sociale',
      'suivi_fiscal',
      'suivi_social'
    )),
  period_start date not null,
  period_end date not null,
  status text not null default 'draft'
    check (status in (
      'draft',
      'pending_review',
      'blocked_unvalidated_rule',
      'validated',
      'closed'
    )),
  currency text not null default 'XOF'
    check (currency = 'XOF'),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  check (period_end >= period_start)
);

create index if not exists fiscal_dossiers_client_idx
  on public.fiscal_dossiers(client_id);

create index if not exists fiscal_dossiers_status_idx
  on public.fiscal_dossiers(status);

create table if not exists public.fiscal_documents (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null
    references public.fiscal_dossiers(id) on delete cascade,
  storage_bucket text not null,
  storage_path text not null,
  original_filename text not null,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  sha256 text,
  uploaded_by uuid,
  created_at timestamptz not null default now(),
  status text not null default 'active'
    check (status in ('active', 'archived', 'quarantined')),
  unique(storage_bucket, storage_path)
);

create index if not exists fiscal_documents_dossier_idx
  on public.fiscal_documents(dossier_id);

create table if not exists public.fiscal_legal_parameters (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  value jsonb,
  source_reference text,
  effective_from date,
  effective_to date,
  validation_status text not null default 'pending'
    check (validation_status in ('pending', 'validated', 'rejected')),
  validated_by uuid,
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    effective_to is null
    or effective_from is null
    or effective_to >= effective_from
  ),
  check (
    validation_status <> 'validated'
    or (validated_by is not null and validated_at is not null)
  )
);

create table if not exists public.fiscal_calculations (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null
    references public.fiscal_dossiers(id) on delete cascade,
  engine_version text not null,
  workbook_version text not null,
  input_snapshot jsonb not null,
  result_snapshot jsonb,
  blockers jsonb not null default '[]'::jsonb,
  validation_status text not null default 'blocked_unvalidated_rule'
    check (validation_status in (
      'blocked_unvalidated_rule',
      'pending_review',
      'validated',
      'rejected'
    )),
  created_by uuid,
  validated_by uuid,
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    validation_status <> 'validated'
    or (validated_by is not null and validated_at is not null)
  )
);

create index if not exists fiscal_calculations_dossier_idx
  on public.fiscal_calculations(dossier_id, created_at desc);

create table if not exists public.fiscal_audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists fiscal_audit_events_entity_idx
  on public.fiscal_audit_events(entity_type, entity_id, created_at desc);

-- Sécurité : RLS activé et aucune politique client.
alter table public.fiscal_clients enable row level security;
alter table public.fiscal_dossiers enable row level security;
alter table public.fiscal_documents enable row level security;
alter table public.fiscal_legal_parameters enable row level security;
alter table public.fiscal_calculations enable row level security;
alter table public.fiscal_audit_events enable row level security;

revoke all on public.fiscal_clients from anon, authenticated;
revoke all on public.fiscal_dossiers from anon, authenticated;
revoke all on public.fiscal_documents from anon, authenticated;
revoke all on public.fiscal_legal_parameters from anon, authenticated;
revoke all on public.fiscal_calculations from anon, authenticated;
revoke all on public.fiscal_audit_events from anon, authenticated;

grant usage on schema public to service_role;
grant all on public.fiscal_clients to service_role;
grant all on public.fiscal_dossiers to service_role;
grant all on public.fiscal_documents to service_role;
grant all on public.fiscal_legal_parameters to service_role;
grant all on public.fiscal_calculations to service_role;
grant all on public.fiscal_audit_events to service_role;
grant usage, select on sequence public.fiscal_audit_events_id_seq to service_role;

comment on table public.fiscal_clients is
  'Référentiel clients autonome du module fiscal-social Cabinet DOUKE.';
comment on table public.fiscal_dossiers is
  'Dossiers fiscaux et sociaux indépendants des modules EDEN et ASTA.';
comment on table public.fiscal_documents is
  'Métadonnées des documents ; stockage privé à configurer séparément.';
comment on table public.fiscal_legal_parameters is
  'Paramètres réglementaires ; validation documentaire obligatoire.';
comment on table public.fiscal_calculations is
  'Historique des calculs ; résultat définitif interdit avant validation.';
comment on table public.fiscal_audit_events is
  'Journal des événements du module fiscal-social.';

commit;
