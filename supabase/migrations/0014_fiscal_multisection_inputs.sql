begin;

-- ============================================================
-- 1. AUTORISER LES SECTIONS DU PARCOURS FISCAL-SOCIAL V8
-- ============================================================

do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select conname
      from pg_constraint
     where conrelid = 'public.fiscal_dossier_inputs'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%section_code%'
       and pg_get_constraintdef(oid) ilike '%annual_figures%'
  loop
    execute format(
      'alter table public.fiscal_dossier_inputs drop constraint %I',
      v_constraint.conname
    );
  end loop;
end;
$$;

alter table public.fiscal_dossier_inputs
  add constraint fiscal_dossier_inputs_section_code_check
  check (section_code in (
    'annual_figures',
    'its_vps',
    'vat',
    'aib',
    'withholding',
    'cnss_periods',
    'tax_operations',
    'social_operations',
    'payments',
    'official_notices',
    'payment_plan',
    'supporting_documents'
  ));

create index if not exists fiscal_dossier_inputs_section_idx
  on public.fiscal_dossier_inputs(dossier_id, section_code, fiscal_year);


-- ============================================================
-- 2. SAUVEGARDE GENERIQUE DES NOUVELLES SECTIONS
-- annual_figures conserve sa RPC 0013.
-- ============================================================

create or replace function public.fiscal_save_section_input(
  p_actor_id uuid,
  p_dossier_id uuid,
  p_section_code text,
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
  v_event text;
begin
  perform public.fiscal_assert_admin(p_actor_id);

  if p_dossier_id is null
     or p_fiscal_year is null
     or p_fiscal_year < 2000
     or p_fiscal_year > 2100
     or p_submit is null
     or p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
     or octet_length(p_payload::text) > 200000 then
    raise exception 'Données de section invalides.'
      using errcode = '22023';
  end if;

  if p_section_code is null
     or p_section_code not in (
       'its_vps',
       'vat',
       'aib',
       'withholding',
       'cnss_periods',
       'tax_operations',
       'social_operations',
       'payments',
       'official_notices',
       'payment_plan',
       'supporting_documents'
     ) then
    raise exception 'Section non autorisée ou prise en charge par une autre API.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
      from jsonb_object_keys(p_payload) as k(key)
     where key not in (
       'source_mode',
       'source_note',
       'data',
       'provenance'
     )
  ) then
    raise exception 'La section contient une propriété non autorisée.'
      using errcode = '22023';
  end if;

  if coalesce(p_payload->>'source_mode', '')
       not in ('actual', 'estimated', 'mixed') then
    raise exception 'Nature des données absente ou invalide.'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_payload->'data') is distinct from 'object'
     and jsonb_typeof(p_payload->'data') is distinct from 'array' then
    raise exception 'La propriété data doit être un objet ou un tableau JSON.'
      using errcode = '22023';
  end if;

  if p_payload ? 'provenance'
     and jsonb_typeof(p_payload->'provenance') is distinct from 'object' then
    raise exception 'La provenance doit être un objet JSON.'
      using errcode = '22023';
  end if;

  if p_payload ? 'source_note'
     and jsonb_typeof(p_payload->'source_note') not in ('string', 'null') then
    raise exception 'La note de provenance doit être un texte ou null.'
      using errcode = '22023';
  end if;

  if length(coalesce(p_payload->>'source_note', '')) > 2000 then
    raise exception 'La note de provenance dépasse 2 000 caractères.'
      using errcode = '22023';
  end if;

  if p_submit and (
    p_payload->'data' = '{}'::jsonb
    or p_payload->'data' = '[]'::jsonb
  ) then
    raise exception 'Une section vide ne peut pas être soumise.'
      using errcode = '22023';
  end if;

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
     and section_code = p_section_code
     and fiscal_year = p_fiscal_year
   for update;

  if found then
    if v_input.status not in ('draft', 'needs_changes') then
      raise exception 'Cette section est soumise ou validée et ne peut pas être modifiée.'
        using errcode = '55000';
    end if;

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
      dossier_id,
      section_code,
      fiscal_year,
      payload,
      status,
      version,
      created_by,
      updated_by
    )
    values (
      p_dossier_id,
      p_section_code,
      p_fiscal_year,
      p_payload,
      case when p_submit then 'submitted' else 'draft' end,
      1,
      p_actor_id,
      p_actor_id
    )
    returning * into v_input;

    v_event := case when p_submit then 'submitted' else 'created' end;
  end if;

  insert into public.fiscal_dossier_input_revisions (
    input_id, version, payload, actor_id
  )
  values (
    v_input.id, v_input.version, v_input.payload, p_actor_id
  );

  insert into public.fiscal_dossier_input_events (
    input_id, actor_id, event_type, details
  )
  values (
    v_input.id,
    p_actor_id,
    v_event,
    jsonb_build_object(
      'section_code', v_input.section_code,
      'fiscal_year', v_input.fiscal_year,
      'version', v_input.version,
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


-- ============================================================
-- 3. LECTURE GENERIQUE DES SECTIONS
-- L'historique est facultatif pour limiter le volume de réponse.
-- ============================================================

create or replace function public.fiscal_list_section_inputs(
  p_actor_id uuid,
  p_dossier_id uuid,
  p_include_history boolean default false
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
        'revisions', case
          when p_include_history then (
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
          )
          else '[]'::jsonb
        end,
        'events', case
          when p_include_history then (
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
          else '[]'::jsonb
        end
      ) order by i.section_code, i.fiscal_year
    ),
    '[]'::jsonb
  )
    into v_data
    from public.fiscal_dossier_inputs i
   where i.dossier_id = p_dossier_id;

  return jsonb_build_object(
    'dossier_id', v_dossier.id,
    'period_start', v_dossier.period_start,
    'period_end', v_dossier.period_end,
    'dossier_status', v_dossier.status,
    'data', v_data
  );
end;
$$;


-- ============================================================
-- 4. DROITS : SERVICE ROLE UNIQUEMENT
-- ============================================================

revoke all on function public.fiscal_save_section_input(
  uuid, uuid, text, integer, jsonb, boolean
) from public, anon, authenticated;

revoke all on function public.fiscal_list_section_inputs(
  uuid, uuid, boolean
) from public, anon, authenticated;

grant execute on function public.fiscal_save_section_input(
  uuid, uuid, text, integer, jsonb, boolean
) to service_role;

grant execute on function public.fiscal_list_section_inputs(
  uuid, uuid, boolean
) to service_role;

comment on function public.fiscal_save_section_input(
  uuid, uuid, text, integer, jsonb, boolean
) is
  'Sauvegarde versionnée des sections fiscales et sociales. Aucun calcul fiscal ou social effectué.';

comment on function public.fiscal_list_section_inputs(
  uuid, uuid, boolean
) is
  'Lecture serveur des sections fiscales et sociales, avec historique facultatif.';

commit;
