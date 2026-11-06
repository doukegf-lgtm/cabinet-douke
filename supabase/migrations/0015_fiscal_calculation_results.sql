begin;

-- Nouveau type d'événement : calcul effectivement réalisé (résultat enregistré, immuable).
do $$
declare v record;
begin
  for v in
    select conname from pg_constraint
     where conrelid = 'public.fiscal_calculation_events'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%event_type%'
  loop
    execute format('alter table public.fiscal_calculation_events drop constraint %I', v.conname);
  end loop;
end;
$$;

alter table public.fiscal_calculation_events
  add constraint fiscal_calculation_events_event_type_check
  check (event_type in ('created_blocked', 'created_computed', 'review_requested', 'validated', 'rejected'));

-- Enregistre un calcul RÉALISÉ côté serveur. Le résultat est écrit à l'insertion
-- (le garde-fou 0010 interdit toute modification ultérieure). Statut initial identique
-- aux calculs existants : la revue et la validation restent des transitions humaines.
create or replace function public.fiscal_create_calculation_result(
  p_actor_id uuid,
  p_dossier_id uuid,
  p_input_snapshot jsonb,
  p_result_snapshot jsonb,
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
begin
  perform public.fiscal_assert_admin(p_actor_id);

  if p_dossier_id is null
     or p_input_snapshot is null or jsonb_typeof(p_input_snapshot) <> 'object'
     or octet_length(p_input_snapshot::text) > 200000
     or p_result_snapshot is null or jsonb_typeof(p_result_snapshot) <> 'object'
     or octet_length(p_result_snapshot::text) > 5000000
     or coalesce((p_result_snapshot->>'provisional')::boolean, true) is not false
     or p_engine_version is null or length(p_engine_version) not between 1 and 50
     or p_engine_version = '0.1.0-preparation'
     or p_workbook_version is null or length(p_workbook_version) not between 1 and 100
     or p_workbook_version = 'non-certifie' then
    raise exception 'Données de calcul invalides ou provisoires.'
      using errcode = '22023';
  end if;

  select * into v_dossier from public.fiscal_dossiers where id = p_dossier_id for share;
  if not found then
    raise exception 'Dossier introuvable.' using errcode = 'P0002';
  end if;
  if v_dossier.status in ('validated', 'closed') then
    raise exception 'Le dossier est verrouillé.' using errcode = '55000';
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

  insert into public.fiscal_calculations (
    dossier_id, engine_version, workbook_version, input_snapshot,
    result_snapshot, blockers, validation_status, created_by
  )
  values (
    v_dossier.id, p_engine_version, p_workbook_version, v_snapshot,
    p_result_snapshot, '[]'::jsonb, 'blocked_unvalidated_rule', p_actor_id
  )
  returning * into v_calculation;

  insert into public.fiscal_calculation_events (calculation_id, actor_id, event_type, details)
  values (
    v_calculation.id, p_actor_id, 'created_computed',
    jsonb_build_object('engine_version', p_engine_version, 'result_created', true)
  );

  return jsonb_build_object(
    'id', v_calculation.id,
    'dossier_id', v_calculation.dossier_id,
    'engine_version', v_calculation.engine_version,
    'workbook_version', v_calculation.workbook_version,
    'validation_status', v_calculation.validation_status,
    'created_at', v_calculation.created_at
  );
end;
$$;

revoke all on function public.fiscal_create_calculation_result(uuid, uuid, jsonb, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.fiscal_create_calculation_result(uuid, uuid, jsonb, jsonb, text, text)
  to service_role;

comment on function public.fiscal_create_calculation_result(uuid, uuid, jsonb, jsonb, text, text) is
  'Enregistre un calcul réalisé côté serveur (résultat immuable, non provisoire). Validation = transition ultérieure.';

commit;
