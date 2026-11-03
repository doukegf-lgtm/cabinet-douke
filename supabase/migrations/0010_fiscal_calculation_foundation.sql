begin;

-- Les calculs restent rattachés à un dossier existant.
-- La suppression d'un dossier ayant des calculs est désormais interdite.
alter table public.fiscal_calculations
  drop constraint if exists fiscal_calculations_dossier_id_fkey;

alter table public.fiscal_calculations
  add constraint fiscal_calculations_dossier_id_fkey
  foreign key (dossier_id)
  references public.fiscal_dossiers(id)
  on delete restrict;

-- Journal append-only des événements liés aux calculs.
create table if not exists public.fiscal_calculation_events (
  id bigint generated always as identity primary key,
  calculation_id uuid not null
    references public.fiscal_calculations(id) on delete restrict,
  actor_id uuid,
  event_type text not null
    check (event_type in ('created_blocked', 'review_requested', 'validated', 'rejected')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists fiscal_calculation_events_calculation_idx
  on public.fiscal_calculation_events(calculation_id, created_at desc);

-- Une demande de calcul enregistrée ne peut pas être réécrite ou supprimée.
create or replace function public.fiscal_calculation_immutable()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Un calcul enregistré est immuable.'
    using errcode = '55000';
end;
$$;

drop trigger if exists fiscal_calculation_immutable_trigger
  on public.fiscal_calculations;

-- La suppression reste interdite. Les mises à jour passent par un garde-fou
-- qui n'autorise que les transitions de statut explicitement prévues.
create trigger fiscal_calculation_immutable_trigger
before delete on public.fiscal_calculations
for each row execute function public.fiscal_calculation_immutable();

create or replace function public.fiscal_calculation_update_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if (to_jsonb(new) - array['validation_status', 'validated_by', 'validated_at'])
     is distinct from
     (to_jsonb(old) - array['validation_status', 'validated_by', 'validated_at']) then
    raise exception 'Les données et résultats du calcul sont immuables.'
      using errcode = '55000';
  end if;

  if new.validation_status = old.validation_status then
    raise exception 'Aucune transition de statut demandée.'
      using errcode = '55000';
  end if;

  if new.validation_status = 'pending_review' then
    if old.validation_status <> 'blocked_unvalidated_rule'
       or new.blockers <> '[]'::jsonb
       or new.result_snapshot is null
       or new.engine_version = '0.1.0-preparation'
       or new.workbook_version = 'non-certifie'
       or new.validated_by is not null
       or new.validated_at is not null then
      raise exception 'Calcul non éligible à la revue.'
        using errcode = '55000';
    end if;

  elsif new.validation_status = 'validated' then
    if old.validation_status <> 'pending_review'
       or new.blockers <> '[]'::jsonb
       or new.result_snapshot is null
       or new.engine_version = '0.1.0-preparation'
       or new.workbook_version = 'non-certifie'
       or new.validated_by is null
       or new.validated_at is null then
      raise exception 'Calcul non éligible à la validation.'
        using errcode = '55000';
    end if;

  elsif new.validation_status = 'rejected' then
    if old.validation_status not in ('blocked_unvalidated_rule', 'pending_review')
       or new.validated_by is not null
       or new.validated_at is not null then
      raise exception 'Transition de rejet non autorisée.'
        using errcode = '55000';
    end if;

  else
    raise exception 'Transition de statut inconnue.'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

drop trigger if exists fiscal_calculation_update_guard_trigger
  on public.fiscal_calculations;

create trigger fiscal_calculation_update_guard_trigger
before update on public.fiscal_calculations
for each row execute function public.fiscal_calculation_update_guard();

-- L'historique des événements est lui aussi immuable.
create or replace function public.fiscal_calculation_event_immutable()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception 'L’historique des calculs est immuable.'
    using errcode = '55000';
end;
$$;

drop trigger if exists fiscal_calculation_event_immutable_trigger
  on public.fiscal_calculation_events;

create trigger fiscal_calculation_event_immutable_trigger
before update or delete on public.fiscal_calculation_events
for each row execute function public.fiscal_calculation_event_immutable();

-- RPC unique de création : elle n'exécute aucun calcul mathématique.
-- Elle enregistre une demande bloquée tant que le moteur n'est pas certifié.
create or replace function public.fiscal_create_calculation_draft(
  p_actor_id uuid,
  p_dossier_id uuid,
  p_input_snapshot jsonb,
  p_engine_version text,
  p_workbook_version text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_dossier public.fiscal_dossiers%rowtype;
  v_calculation public.fiscal_calculations%rowtype;
  v_snapshot jsonb;
  v_blockers jsonb;
begin
  perform public.fiscal_assert_admin(p_actor_id);

  if p_dossier_id is null
     or p_input_snapshot is null
     or jsonb_typeof(p_input_snapshot) <> 'object'
     or octet_length(p_input_snapshot::text) > 50000
     or p_engine_version is null
     or length(p_engine_version) < 1
     or length(p_engine_version) > 50
     or p_workbook_version is null
     or length(p_workbook_version) < 1
     or length(p_workbook_version) > 100 then
    raise exception 'Données de préparation du calcul invalides.'
      using errcode = '22023';
  end if;

  select *
    into v_dossier
    from public.fiscal_dossiers
   where id = p_dossier_id
   for share;

  if not found then
    raise exception 'Dossier introuvable.'
      using errcode = 'P0002';
  end if;

  if v_dossier.status in ('validated', 'closed') then
    raise exception 'Le dossier est verrouillé.'
      using errcode = '55000';
  end if;

  v_snapshot := jsonb_build_object(
    'schema_version', 1,
    'dossier_id', v_dossier.id,
    'client_id', v_dossier.client_id,
    'dossier_type', v_dossier.dossier_type,
    'period_start', v_dossier.period_start,
    'period_end', v_dossier.period_end,
    'currency', v_dossier.currency,
    'captured_at', now(),
    'inputs', p_input_snapshot
  );

  v_blockers := jsonb_build_array(
    jsonb_build_object(
      'code', 'ENGINE_NOT_CERTIFIED',
      'message', 'Le moteur de calcul n’est pas encore certifié.'
    ),
    jsonb_build_object(
      'code', 'REGULATORY_RULES_NOT_VERIFIED',
      'message', 'Les règles et paramètres applicables doivent être vérifiés et validés.'
    ),
    jsonb_build_object(
      'code', 'NO_COMPUTATION_PERFORMED',
      'message', 'Aucun montant fiscal ou social n’a été calculé.'
    )
  );

  insert into public.fiscal_calculations (
    dossier_id,
    engine_version,
    workbook_version,
    input_snapshot,
    result_snapshot,
    blockers,
    validation_status,
    created_by
  )
  values (
    v_dossier.id,
    p_engine_version,
    p_workbook_version,
    v_snapshot,
    null,
    v_blockers,
    'blocked_unvalidated_rule',
    p_actor_id
  )
  returning * into v_calculation;

  insert into public.fiscal_calculation_events (
    calculation_id, actor_id, event_type, details
  )
  values (
    v_calculation.id,
    p_actor_id,
    'created_blocked',
    jsonb_build_object(
      'reason', 'engine_not_certified',
      'result_created', false
    )
  );

  return jsonb_build_object(
    'id', v_calculation.id,
    'dossier_id', v_calculation.dossier_id,
    'engine_version', v_calculation.engine_version,
    'workbook_version', v_calculation.workbook_version,
    'validation_status', v_calculation.validation_status,
    'blockers', v_calculation.blockers,
    'created_at', v_calculation.created_at
  );
end;
$$;

-- Transition contrôlée : aucun changement des instantanés ou résultats.
create or replace function public.fiscal_transition_calculation(
  p_actor_id uuid,
  p_calculation_id uuid,
  p_new_status text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_calculation public.fiscal_calculations%rowtype;
  v_event_type text;
  v_note text;
begin
  perform public.fiscal_assert_admin(p_actor_id);

  if p_calculation_id is null
     or p_new_status not in ('pending_review', 'validated', 'rejected')
     or (p_note is not null and length(p_note) > 1000) then
    raise exception 'Demande de transition invalide.'
      using errcode = '22023';
  end if;

  v_note := nullif(btrim(p_note), '');

  select *
    into v_calculation
    from public.fiscal_calculations
   where id = p_calculation_id
   for update;

  if not found then
    raise exception 'Calcul introuvable.'
      using errcode = 'P0002';
  end if;

  if p_new_status = 'pending_review' then
    if v_calculation.validation_status <> 'blocked_unvalidated_rule'
       or v_calculation.blockers <> '[]'::jsonb
       or v_calculation.result_snapshot is null
       or v_calculation.engine_version = '0.1.0-preparation'
       or v_calculation.workbook_version = 'non-certifie' then
      raise exception 'Le calcul doit être complet et sans blocage avant revue.'
        using errcode = '55000';
    end if;
    v_event_type := 'review_requested';

  elsif p_new_status = 'validated' then
    if v_calculation.validation_status <> 'pending_review'
       or v_calculation.blockers <> '[]'::jsonb
       or v_calculation.result_snapshot is null
       or v_calculation.engine_version = '0.1.0-preparation'
       or v_calculation.workbook_version = 'non-certifie' then
      raise exception 'Le calcul ne satisfait pas les conditions de validation.'
        using errcode = '55000';
    end if;
    v_event_type := 'validated';

  elsif p_new_status = 'rejected' then
    if v_calculation.validation_status not in ('blocked_unvalidated_rule', 'pending_review') then
      raise exception 'Ce calcul ne peut plus être rejeté dans son état actuel.'
        using errcode = '55000';
    end if;
    v_event_type := 'rejected';
  end if;

  update public.fiscal_calculations
     set validation_status = p_new_status,
         validated_by = case when p_new_status = 'validated' then p_actor_id else null end,
         validated_at = case when p_new_status = 'validated' then now() else null end
   where id = p_calculation_id;

  insert into public.fiscal_calculation_events (
    calculation_id, actor_id, event_type, details
  )
  values (
    p_calculation_id,
    p_actor_id,
    v_event_type,
    jsonb_build_object('status', p_new_status, 'note', v_note)
  );

  return jsonb_build_object(
    'id', p_calculation_id,
    'validation_status', p_new_status,
    'event_type', v_event_type
  );
end;
$$;

revoke all on function public.fiscal_transition_calculation(uuid, uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.fiscal_transition_calculation(uuid, uuid, text, text)
  to service_role;

revoke all on function public.fiscal_create_calculation_draft(uuid, uuid, jsonb, text, text)
  from public, anon, authenticated;

grant execute on function public.fiscal_create_calculation_draft(uuid, uuid, jsonb, text, text)
  to service_role;

alter table public.fiscal_calculation_events enable row level security;

revoke all on public.fiscal_calculation_events from anon, authenticated;
grant all on public.fiscal_calculation_events to service_role;
revoke update, delete, truncate on public.fiscal_calculation_events from service_role;

revoke update, delete, truncate on public.fiscal_calculations from service_role;

grant usage, select on sequence public.fiscal_calculation_events_id_seq to service_role;

comment on table public.fiscal_calculation_events is
  'Historique append-only des demandes et validations de calcul fiscal-social.';

comment on function public.fiscal_create_calculation_draft(uuid, uuid, jsonb, text, text) is
  'Enregistre une demande de calcul bloquée ; ne calcule aucun montant.';

commit;
