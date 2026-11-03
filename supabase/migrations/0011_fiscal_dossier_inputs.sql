begin;

-- Saisie annuelle S2 : une fiche par dossier et par exercice.
create table public.fiscal_dossier_inputs (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null
    references public.fiscal_dossiers(id) on delete restrict,
  section_code text not null
    check (section_code = 'annual_figures'),
  fiscal_year integer not null
    check (fiscal_year between 2000 and 2100),
  payload jsonb not null
    check (jsonb_typeof(payload) = 'object'),
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'needs_changes', 'validated')),
  version integer not null default 1 check (version > 0),
  created_by uuid not null,
  updated_by uuid not null,
  validated_by uuid,
  validated_at timestamptz,
  validation_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dossier_id, section_code, fiscal_year),
  check (
    (status = 'validated' and validated_by is not null and validated_at is not null)
    or
    (status <> 'validated' and validated_by is null and validated_at is null)
  )
);

create index fiscal_dossier_inputs_dossier_idx
  on public.fiscal_dossier_inputs(dossier_id, fiscal_year);

-- Chaque version est conservée intégralement.
create table public.fiscal_dossier_input_revisions (
  id bigint generated always as identity primary key,
  input_id uuid not null
    references public.fiscal_dossier_inputs(id) on delete restrict,
  version integer not null,
  payload jsonb not null,
  actor_id uuid not null,
  created_at timestamptz not null default now(),
  unique(input_id, version)
);

create table public.fiscal_dossier_input_events (
  id bigint generated always as identity primary key,
  input_id uuid not null
    references public.fiscal_dossier_inputs(id) on delete restrict,
  actor_id uuid not null,
  event_type text not null
    check (event_type in (
      'created', 'updated', 'submitted',
      'validated', 'returned_for_changes'
    )),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index fiscal_dossier_input_events_idx
  on public.fiscal_dossier_input_events(input_id, created_at desc);

-- Révisions et événements : aucune modification ni suppression.
create or replace function public.fiscal_dossier_input_history_immutable()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception 'L’historique des saisies est immuable.'
    using errcode = '55000';
end;
$$;

create trigger fiscal_dossier_input_revisions_immutable
before update or delete on public.fiscal_dossier_input_revisions
for each row execute function public.fiscal_dossier_input_history_immutable();

create trigger fiscal_dossier_input_events_immutable
before update or delete on public.fiscal_dossier_input_events
for each row execute function public.fiscal_dossier_input_history_immutable();

-- Sauvegarde d'une fiche annuelle.
-- Les données restent déclaratives : aucune liquidation fiscale n'est effectuée.
create or replace function public.fiscal_save_annual_input(
  p_actor_id uuid,
  p_dossier_id uuid,
  p_fiscal_year integer,
  p_payload jsonb,
  p_submit boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_dossier public.fiscal_dossiers%rowtype;
  v_input public.fiscal_dossier_inputs%rowtype;
  v_key text;
  v_value jsonb;
  v_event text;
begin
  perform public.fiscal_assert_admin(p_actor_id);

  if p_dossier_id is null
     or p_fiscal_year is null
     or p_fiscal_year < 2000 or p_fiscal_year > 2100
     or p_payload is null
     or p_submit is null
     or jsonb_typeof(p_payload) <> 'object'
     or octet_length(p_payload::text) > 20000 then
    raise exception 'Données annuelles invalides.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
      from jsonb_object_keys(p_payload) as k(key)
     where key not in (
       'source_mode',
       'source_note',
       'ca_fiscal_ht',
       'charges_comptables',
       'charges_deductibles_justifiees',
       'reintegrations_fiscales',
       'deductions_fiscales',
       'acomptes_is_justifies',
       'credits_is_valides'
     )
  ) then
    raise exception 'La fiche contient un champ non autorisé.'
      using errcode = '22023';
  end if;

  if coalesce(p_payload->>'source_mode', '') not in ('actual', 'estimated') then
    raise exception 'Précisez si les données sont réelles ou estimées.'
      using errcode = '22023';
  end if;

  if p_submit and not (
    p_payload ?& array[
      'ca_fiscal_ht',
      'charges_comptables',
      'charges_deductibles_justifiees',
      'reintegrations_fiscales',
      'deductions_fiscales',
      'acomptes_is_justifies',
      'credits_is_valides'
    ]
  ) then
    raise exception 'Pour soumettre la fiche, renseignez les sept champs financiers. Utilisez null si une donnée est indisponible.'
      using errcode = '22023';
  end if;

  if length(coalesce(p_payload->>'source_note', '')) > 2000 then
    raise exception 'La note de provenance est trop longue.'
      using errcode = '22023';
  end if;

  for v_key, v_value in
    select key, value from jsonb_each(p_payload)
  loop
    if v_key not in ('source_mode', 'source_note') then
      if jsonb_typeof(v_value) not in ('number', 'null') then
        raise exception 'Le champ % doit être un montant numérique ou nul.', v_key
          using errcode = '22023';
      end if;

      if jsonb_typeof(v_value) = 'number'
         and (v_value::text)::numeric < 0 then
        raise exception 'Le champ % ne peut pas être négatif.', v_key
          using errcode = '22023';
      end if;
    end if;
  end loop;

  select *
    into v_dossier
    from public.fiscal_dossiers
   where id = p_dossier_id
   for update;

  if not found then
    raise exception 'Dossier introuvable.'
      using errcode = 'P0002';
  end if;

  if v_dossier.status in ('validated', 'closed') then
    raise exception 'Le dossier est verrouillé.'
      using errcode = '55000';
  end if;

  if p_fiscal_year < extract(year from v_dossier.period_start)::integer
     or p_fiscal_year > extract(year from v_dossier.period_end)::integer then
    raise exception 'Exercice hors de la période du dossier.'
      using errcode = '22023';
  end if;

  select *
    into v_input
    from public.fiscal_dossier_inputs
   where dossier_id = p_dossier_id
     and section_code = 'annual_figures'
     and fiscal_year = p_fiscal_year
   for update;

  if found then
    update public.fiscal_dossier_inputs
       set payload = p_payload,
           version = version + 1,
           status = case when p_submit then 'submitted' else 'draft' end,
           updated_by = p_actor_id,
           updated_at = now(),
           validated_by = null,
           validated_at = null,
           validation_note = null
     where id = v_input.id
     returning * into v_input;

    v_event := case when p_submit then 'submitted' else 'updated' end;
  else
    insert into public.fiscal_dossier_inputs (
      dossier_id, section_code, fiscal_year, payload,
      status, version, created_by, updated_by
    )
    values (
      p_dossier_id, 'annual_figures', p_fiscal_year, p_payload,
      case when p_submit then 'submitted' else 'draft' end,
      1, p_actor_id, p_actor_id
    )
    returning * into v_input;

    v_event := case when p_submit then 'submitted' else 'created' end;
  end if;

  insert into public.fiscal_dossier_input_revisions (
    input_id, version, payload, actor_id
  )
  values (v_input.id, v_input.version, v_input.payload, p_actor_id);

  insert into public.fiscal_dossier_input_events (
    input_id, actor_id, event_type, details
  )
  values (
    v_input.id, p_actor_id, v_event,
    jsonb_build_object(
      'version', v_input.version,
      'fiscal_year', v_input.fiscal_year,
      'source_mode', v_input.payload->>'source_mode'
    )
  );

  return jsonb_build_object(
    'id', v_input.id,
    'dossier_id', v_input.dossier_id,
    'section_code', v_input.section_code,
    'fiscal_year', v_input.fiscal_year,
    'version', v_input.version,
    'status', v_input.status,
    'updated_at', v_input.updated_at
  );
end;
$$;

-- Validation ou retour pour correction par le cabinet.
create or replace function public.fiscal_transition_annual_input(
  p_actor_id uuid,
  p_input_id uuid,
  p_new_status text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_input public.fiscal_dossier_inputs%rowtype;
  v_dossier_id uuid;
  v_dossier_status text;
  v_event text;
begin
  perform public.fiscal_assert_admin(p_actor_id);

  if p_input_id is null
     or p_new_status is null
     or p_new_status not in ('validated', 'needs_changes')
     or length(coalesce(p_note, '')) > 2000 then
    raise exception 'Demande de validation invalide.'
      using errcode = '22023';
  end if;

  select dossier_id
    into v_dossier_id
    from public.fiscal_dossier_inputs
   where id = p_input_id;

  if not found then
    raise exception 'Fiche annuelle introuvable.'
      using errcode = 'P0002';
  end if;

  select status
    into v_dossier_status
    from public.fiscal_dossiers
   where id = v_dossier_id
   for update;

  if not found then
    raise exception 'Dossier introuvable.'
      using errcode = 'P0002';
  end if;

  select *
    into v_input
    from public.fiscal_dossier_inputs
   where id = p_input_id
   for update;

  if not found then
    raise exception 'Fiche annuelle introuvable.'
      using errcode = 'P0002';
  end if;

  if v_dossier_status in ('validated', 'closed') then
    raise exception 'Le dossier est verrouillé.'
      using errcode = '55000';
  end if;

  if v_input.status <> 'submitted' then
    raise exception 'Seule une fiche soumise peut être revue.'
      using errcode = '55000';
  end if;

  if p_new_status = 'validated' then
    update public.fiscal_dossier_inputs
       set status = 'validated',
           validated_by = p_actor_id,
           validated_at = now(),
           validation_note = nullif(btrim(p_note), ''),
           updated_by = p_actor_id,
           updated_at = now()
     where id = p_input_id;

    v_event := 'validated';
  else
    if nullif(btrim(p_note), '') is null then
      raise exception 'Un motif est obligatoire pour demander une correction.'
        using errcode = '22023';
    end if;

    update public.fiscal_dossier_inputs
       set status = 'needs_changes',
           validated_by = null,
           validated_at = null,
           validation_note = btrim(p_note),
           updated_by = p_actor_id,
           updated_at = now()
     where id = p_input_id;

    v_event := 'returned_for_changes';
  end if;

  insert into public.fiscal_dossier_input_events (
    input_id, actor_id, event_type, details
  )
  values (
    p_input_id, p_actor_id, v_event,
    jsonb_build_object(
      'status', p_new_status,
      'note', nullif(btrim(p_note), ''),
      'version', v_input.version
    )
  );

  return jsonb_build_object(
    'id', p_input_id,
    'status', p_new_status,
    'event_type', v_event
  );
end;
$$;


-- Lecture des fiches annuelles et de leur historique, réservée au cabinet.
create or replace function public.fiscal_list_annual_inputs(
  p_actor_id uuid,
  p_dossier_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_dossier public.fiscal_dossiers%rowtype;
  v_data jsonb;
begin
  perform public.fiscal_assert_admin(p_actor_id);

  if p_dossier_id is null then
    raise exception 'Identifiant de dossier obligatoire.'
      using errcode = '22023';
  end if;

  select *
    into v_dossier
    from public.fiscal_dossiers
   where id = p_dossier_id;

  if not found then
    raise exception 'Dossier introuvable.'
      using errcode = 'P0002';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', i.id,
        'dossier_id', i.dossier_id,
        'section_code', i.section_code,
        'fiscal_year', i.fiscal_year,
        'payload', i.payload,
        'status', i.status,
        'version', i.version,
        'created_by', i.created_by,
        'updated_by', i.updated_by,
        'validated_by', i.validated_by,
        'validated_at', i.validated_at,
        'validation_note', i.validation_note,
        'created_at', i.created_at,
        'updated_at', i.updated_at,
        'revisions', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'id', r.id,
                'version', r.version,
                'payload', r.payload,
                'actor_id', r.actor_id,
                'created_at', r.created_at
              ) order by r.version desc
            ),
            '[]'::jsonb
          )
          from public.fiscal_dossier_input_revisions r
          where r.input_id = i.id
        ),
        'events', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'id', e.id,
                'actor_id', e.actor_id,
                'event_type', e.event_type,
                'details', e.details,
                'created_at', e.created_at
              ) order by e.created_at desc
            ),
            '[]'::jsonb
          )
          from public.fiscal_dossier_input_events e
          where e.input_id = i.id
        )
      ) order by i.fiscal_year
    ),
    '[]'::jsonb
  )
    into v_data
    from public.fiscal_dossier_inputs i
   where i.dossier_id = p_dossier_id
     and i.section_code = 'annual_figures';

  return jsonb_build_object(
    'dossier_id', v_dossier.id,
    'period_start', v_dossier.period_start,
    'period_end', v_dossier.period_end,
    'dossier_status', v_dossier.status,
    'data', v_data
  );
end;
$$;

-- Accès exclusivement par les RPC authentifiées côté serveur.
alter table public.fiscal_dossier_inputs enable row level security;
alter table public.fiscal_dossier_input_revisions enable row level security;
alter table public.fiscal_dossier_input_events enable row level security;

revoke all on public.fiscal_dossier_inputs from public, anon, authenticated, service_role;
revoke all on public.fiscal_dossier_input_revisions from public, anon, authenticated, service_role;
revoke all on public.fiscal_dossier_input_events from public, anon, authenticated, service_role;

revoke all on sequence public.fiscal_dossier_input_revisions_id_seq from public, anon, authenticated, service_role;
revoke all on sequence public.fiscal_dossier_input_events_id_seq from public, anon, authenticated, service_role;

revoke all on function public.fiscal_save_annual_input(uuid, uuid, integer, jsonb, boolean)
  from public, anon, authenticated;
revoke all on function public.fiscal_transition_annual_input(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.fiscal_list_annual_inputs(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.fiscal_save_annual_input(uuid, uuid, integer, jsonb, boolean)
  to service_role;
grant execute on function public.fiscal_transition_annual_input(uuid, uuid, text, text)
  to service_role;
grant execute on function public.fiscal_list_annual_inputs(uuid, uuid)
  to service_role;

comment on table public.fiscal_dossier_inputs is
  'Fiches de saisie par rubrique et exercice ; distinctes des calculs fiscaux.';
comment on table public.fiscal_dossier_input_revisions is
  'Instantanés immuables de chaque version des fiches de saisie.';
comment on table public.fiscal_dossier_input_events is
  'Journal append-only des sauvegardes, soumissions et validations.';
comment on function public.fiscal_save_annual_input(uuid, uuid, integer, jsonb, boolean) is
  'Enregistre les données annuelles S2 sans calcul ni liquidation fiscale.';
comment on function public.fiscal_transition_annual_input(uuid, uuid, text, text) is
  'Valide une fiche annuelle soumise ou la retourne pour correction.';

commit;
