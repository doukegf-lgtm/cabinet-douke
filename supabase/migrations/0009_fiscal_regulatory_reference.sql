-- Cabinet DOUKE - Référentiel réglementaire fiscal et social du Bénin.
-- Sources, paramètres et obligations avec dates d'effet et historique.
-- Aucun taux ou seuil n'est prérempli.
-- Accès exclusivement via le serveur avec service_role.

begin;

create table if not exists public.fiscal_regulatory_entries (
  id uuid primary key default gen_random_uuid(),

  entry_type text not null
    check (entry_type in ('legal_source', 'parameter', 'obligation')),

  code text not null unique,
  title text not null,
  description text,

  -- Référence du texte officiel
  document_type text,
  authority text,
  reference_number text,
  publication_date date,
  official_url text,
  article_reference text,

  -- Paramètres réglementaires
  parameter_category text,
  numeric_value numeric(24,8),
  text_value text,
  unit text,
  currency text check (currency is null or currency = 'XOF'),

  -- Obligations déclaratives et de paiement
  obligation_category text,
  periodicity text,
  due_rule text,
  target_group text,

  -- Lien vers le texte qui fonde le paramètre ou l'obligation
  source_entry_id uuid
    references public.fiscal_regulatory_entries(id)
    on delete restrict,

  -- Période d'application
  effective_from date,
  effective_to date,

  verification_status text not null default 'to_verify'
    check (verification_status in (
      'to_verify',
      'in_review',
      'validated',
      'replaced',
      'repealed'
    )),

  validation_note text,
  validated_by uuid,
  validated_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,

  constraint fiscal_regulatory_dates_check
    check (
      effective_to is null
      or effective_from is null
      or effective_to >= effective_from
    ),

  constraint fiscal_regulatory_validation_check
    check (
      verification_status <> 'validated'
      or (
        validated_by is not null
        and validated_at is not null
        and effective_from is not null
        and (
          entry_type = 'legal_source'
          or (
            source_entry_id is not null
            and article_reference is not null
            and length(trim(article_reference)) > 0
          )
        )
        and (
          entry_type <> 'parameter'
          or (
            parameter_category is not null
            and (numeric_value is not null or text_value is not null)
          )
        )
        and (
          entry_type <> 'obligation'
          or (
            obligation_category is not null
            and due_rule is not null
            and length(trim(due_rule)) > 0
          )
        )
      )
    ),

  constraint fiscal_regulatory_source_type_check
    check (
      entry_type = 'legal_source'
      or source_entry_id is not null
      or verification_status <> 'validated'
    ),

  constraint fiscal_regulatory_value_type_check
    check (
      entry_type <> 'parameter'
      or numeric_value is null
      or text_value is null
    )
);

create index if not exists fiscal_regulatory_type_idx
  on public.fiscal_regulatory_entries(entry_type);

create index if not exists fiscal_regulatory_status_idx
  on public.fiscal_regulatory_entries(verification_status);

create index if not exists fiscal_regulatory_effective_idx
  on public.fiscal_regulatory_entries(effective_from, effective_to);

create index if not exists fiscal_regulatory_source_idx
  on public.fiscal_regulatory_entries(source_entry_id);

create table if not exists public.fiscal_regulatory_history (
  id bigint generated always as identity primary key,
  entry_id uuid not null,
  operation text not null
    check (operation in ('INSERT', 'UPDATE')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create index if not exists fiscal_regulatory_history_entry_idx
  on public.fiscal_regulatory_history(entry_id, changed_at desc);

-- Vérification de la nature des sources réglementaires.
create or replace function public.fiscal_regulatory_validate_source()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_source_type text;
begin
  if new.entry_type = 'legal_source' and new.source_entry_id is not null then
    raise exception 'Un texte juridique ne peut pas dépendre d’une autre source.'
      using errcode = '23514';
  end if;

  if new.source_entry_id is not null then
    if new.source_entry_id = new.id then
      raise exception 'Une fiche ne peut pas être sa propre source.'
        using errcode = '23514';
    end if;

    select entry_type into v_source_type
    from public.fiscal_regulatory_entries
    where id = new.source_entry_id;

    if v_source_type is distinct from 'legal_source' then
      raise exception 'La source doit être un texte juridique existant.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists fiscal_regulatory_validate_source_trigger
  on public.fiscal_regulatory_entries;

create trigger fiscal_regulatory_validate_source_trigger
before insert or update on public.fiscal_regulatory_entries
for each row execute function public.fiscal_regulatory_validate_source();

-- Historique automatique : chaque création ou modification est conservée.
create or replace function public.fiscal_regulatory_capture_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid;
begin
  v_actor := coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
    case
      when tg_op = 'INSERT' then new.updated_by
      else new.updated_by
    end
  );

  if tg_op = 'INSERT' then
    insert into public.fiscal_regulatory_history
      (entry_id, operation, old_data, new_data, changed_by)
    values
      (new.id, 'INSERT', null, to_jsonb(new), v_actor);
    return new;
  end if;

  new.updated_at := now();

  insert into public.fiscal_regulatory_history
    (entry_id, operation, old_data, new_data, changed_by)
  values
    (new.id, 'UPDATE', to_jsonb(old), to_jsonb(new), v_actor);
  return new;
end;
$$;

drop trigger if exists fiscal_regulatory_history_trigger
  on public.fiscal_regulatory_entries;

create trigger fiscal_regulatory_history_trigger
before insert or update on public.fiscal_regulatory_entries
for each row execute function public.fiscal_regulatory_capture_history();

-- L'historique est strictement append-only.
create or replace function public.fiscal_regulatory_history_immutable()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'L''historique réglementaire est immuable.'
    using errcode = '55000';
end;
$$;

drop trigger if exists fiscal_regulatory_history_no_change
  on public.fiscal_regulatory_history;

create trigger fiscal_regulatory_history_no_change
before update or delete on public.fiscal_regulatory_history
for each row execute function public.fiscal_regulatory_history_immutable();

alter table public.fiscal_regulatory_entries enable row level security;
alter table public.fiscal_regulatory_history enable row level security;

revoke all on public.fiscal_regulatory_entries from anon, authenticated;
revoke all on public.fiscal_regulatory_history from anon, authenticated;

grant usage on schema public to service_role;
grant all on public.fiscal_regulatory_entries to service_role;
grant all on public.fiscal_regulatory_history to service_role;
revoke update, delete, truncate on public.fiscal_regulatory_history from service_role;
grant usage, select on sequence
  public.fiscal_regulatory_history_id_seq to service_role;

comment on table public.fiscal_regulatory_entries is
  'Référentiel juridique, fiscal et social avec périodes de validité et statut de vérification.';

comment on table public.fiscal_regulatory_history is
  'Historique immuable des créations et modifications du référentiel réglementaire.';

commit;
