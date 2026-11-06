begin;

-- Remplacement ciblé : même logique métier et mêmes contrôles,
-- avec prise en charge des montants décimaux transmis comme chaînes.
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
  v_amount_text text;
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
      if jsonb_typeof(v_value) not in ('number', 'string', 'null') then
        raise exception 'Le champ % doit être un montant décimal ou nul.', v_key
          using errcode = '22023';
      end if;

      if jsonb_typeof(v_value) = 'string' then
        v_amount_text := v_value #>> '{}';

        if v_amount_text !~ '^[0-9]{1,15}([.][0-9]{1,2})?$' then
          raise exception 'Le champ % doit respecter le format décimal XOF.', v_key
            using errcode = '22023';
        end if;

        if v_amount_text::numeric > 999999999999999.99 then
          raise exception 'Le champ % dépasse le montant maximal autorisé.', v_key
            using errcode = '22023';
        end if;
      elsif jsonb_typeof(v_value) = 'number' then
        -- Compatibilité avec les anciennes fiches enregistrées en JSON number.
        if (v_value #>> '{}')::numeric < 0 then
          raise exception 'Le champ % ne peut pas être négatif.', v_key
            using errcode = '22023';
        end if;

        if (v_value #>> '{}')::numeric > 999999999999999.99 then
          raise exception 'Le champ % dépasse le montant maximal autorisé.', v_key
            using errcode = '22023';
        end if;
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

revoke all on function public.fiscal_save_annual_input(uuid, uuid, integer, jsonb, boolean)
  from public, anon, authenticated;

grant execute on function public.fiscal_save_annual_input(uuid, uuid, integer, jsonb, boolean)
  to service_role;

commit;
