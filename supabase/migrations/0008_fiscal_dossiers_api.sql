begin;

create or replace function public.fiscal_list_dossiers(
  p_actor_id uuid,
  p_search text default null,
  p_status text default null,
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_search text;
  v_total bigint;
  v_data jsonb;
begin
  perform public.fiscal_assert_admin(p_actor_id);

  if p_page is null or p_page < 1 or p_page > 100000
     or p_page_size is null or p_page_size < 1 or p_page_size > 100 then
    raise exception 'Pagination invalide' using errcode = '22023';
  end if;

  if p_status is not null and p_status not in (
    'draft', 'pending_review', 'blocked_unvalidated_rule', 'validated', 'closed'
  ) then
    raise exception 'Statut invalide' using errcode = '22023';
  end if;

  v_search := replace(replace(replace(btrim(coalesce(p_search, '')), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_');

  select count(*)
    into v_total
    from public.fiscal_dossiers d
    join public.fiscal_clients c on c.id = d.client_id
   where (p_status is null or d.status = p_status)
     and (
       v_search = ''
       or c.legal_name ilike '%' || v_search || '%' escape E'\\'
       or coalesce(d.notes, '') ilike '%' || v_search || '%' escape E'\\'
       or d.dossier_type ilike '%' || v_search || '%' escape E'\\'
     );

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id desc), '[]'::jsonb)
    into v_data
    from (
      select d.id, d.client_id, c.legal_name as client_name,
             d.dossier_type, d.period_start, d.period_end, d.status,
             d.currency, d.notes, d.created_at, d.updated_at
        from public.fiscal_dossiers d
        join public.fiscal_clients c on c.id = d.client_id
       where (p_status is null or d.status = p_status)
         and (
           v_search = ''
           or c.legal_name ilike '%' || v_search || '%' escape E'\\'
           or coalesce(d.notes, '') ilike '%' || v_search || '%' escape E'\\'
           or d.dossier_type ilike '%' || v_search || '%' escape E'\\'
         )
       order by d.created_at desc, d.id desc
       limit p_page_size offset (p_page - 1) * p_page_size
    ) x;

  return jsonb_build_object(
    'data', v_data,
    'total', v_total,
    'page', p_page,
    'pageSize', p_page_size,
    'totalPages', case when v_total = 0 then 0 else ceil(v_total::numeric / p_page_size)::integer end
  );
end;
$$;

create or replace function public.fiscal_create_dossier(
  p_actor_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_dossier public.fiscal_dossiers%rowtype;
  v_client_status text;
begin
  perform public.fiscal_assert_admin(p_actor_id);

  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or exists (
       select 1 from jsonb_object_keys(p_payload) k(key)
       where key not in ('client_id', 'dossier_type', 'period_start', 'period_end', 'notes')
     ) then
    raise exception 'Données de dossier invalides' using errcode = '22023';
  end if;

  if nullif(p_payload->>'client_id', '') is null
     or nullif(p_payload->>'dossier_type', '') is null
     or nullif(p_payload->>'period_start', '') is null
     or nullif(p_payload->>'period_end', '') is null then
    raise exception 'Champs obligatoires manquants' using errcode = '22023';
  end if;

  if p_payload->>'dossier_type' not in (
    'regularisation_fiscale', 'regularisation_sociale', 'suivi_fiscal', 'suivi_social'
  ) then
    raise exception 'Type de dossier invalide' using errcode = '22023';
  end if;

  if length(coalesce(p_payload->>'notes', '')) > 5000 then
    raise exception 'Notes trop longues' using errcode = '22023';
  end if;

  select status into v_client_status
    from public.fiscal_clients
   where id = (p_payload->>'client_id')::uuid;

  if not found then
    raise exception 'Client introuvable' using errcode = 'P0002';
  end if;
  if v_client_status <> 'active' then
    raise exception 'Un dossier ne peut être ouvert pour un client archivé' using errcode = '22023';
  end if;

  insert into public.fiscal_dossiers (
    client_id, dossier_type, period_start, period_end, notes,
    status, currency, created_by, updated_by
  )
  values (
    (p_payload->>'client_id')::uuid,
    p_payload->>'dossier_type',
    (p_payload->>'period_start')::date,
    (p_payload->>'period_end')::date,
    nullif(btrim(p_payload->>'notes'), ''),
    'draft', 'XOF', p_actor_id, p_actor_id
  )
  returning * into v_dossier;

  insert into public.fiscal_audit_events(actor_id, action, entity_type, entity_id, metadata)
  values (
    p_actor_id, 'dossier.created', 'fiscal_dossier', v_dossier.id,
    jsonb_build_object('client_id', v_dossier.client_id, 'dossier_type', v_dossier.dossier_type,
      'period_start', v_dossier.period_start, 'period_end', v_dossier.period_end)
  );

  return to_jsonb(v_dossier);
end;
$$;

create or replace function public.fiscal_update_dossier(
  p_actor_id uuid,
  p_dossier_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_dossier public.fiscal_dossiers%rowtype;
  v_fields text[];
  v_client_status text;
  v_new_start date;
  v_new_end date;
begin
  perform public.fiscal_assert_admin(p_actor_id);

  if p_dossier_id is null or p_patch is null
     or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb
     or exists (
       select 1 from jsonb_object_keys(p_patch) k(key)
       where key not in ('client_id', 'dossier_type', 'period_start', 'period_end', 'notes', 'status')
     ) then
    raise exception 'Modification de dossier invalide' using errcode = '22023';
  end if;

  select * into v_dossier
    from public.fiscal_dossiers
   where id = p_dossier_id
   for update;

  if not found then
    raise exception 'Dossier introuvable' using errcode = 'P0002';
  end if;

  if v_dossier.status in ('validated', 'closed') then
    raise exception 'Dossier verrouillé' using errcode = '55000';
  end if;

  if p_patch ? 'status' and p_patch->>'status' not in (
    'draft', 'pending_review', 'blocked_unvalidated_rule'
  ) then
    raise exception 'Transition de statut non autorisée' using errcode = '22023';
  end if;

  if p_patch ? 'dossier_type' and p_patch->>'dossier_type' not in (
    'regularisation_fiscale', 'regularisation_sociale', 'suivi_fiscal', 'suivi_social'
  ) then
    raise exception 'Type de dossier invalide' using errcode = '22023';
  end if;

  if p_patch ? 'notes' and length(coalesce(p_patch->>'notes', '')) > 5000 then
    raise exception 'Notes trop longues' using errcode = '22023';
  end if;

  if p_patch ? 'client_id' then
    select status into v_client_status
      from public.fiscal_clients
     where id = (p_patch->>'client_id')::uuid;
    if not found then
      raise exception 'Client introuvable' using errcode = 'P0002';
    end if;
    if v_client_status <> 'active' then
      raise exception 'Le client sélectionné est archivé' using errcode = '22023';
    end if;
  end if;

  v_new_start := case when p_patch ? 'period_start' then (p_patch->>'period_start')::date else v_dossier.period_start end;
  v_new_end := case when p_patch ? 'period_end' then (p_patch->>'period_end')::date else v_dossier.period_end end;
  if v_new_end < v_new_start then
    raise exception 'Période incohérente' using errcode = '22023';
  end if;

  select array_agg(key order by key) into v_fields
    from jsonb_object_keys(p_patch) k(key);

  update public.fiscal_dossiers d
     set client_id = case when p_patch ? 'client_id' then (p_patch->>'client_id')::uuid else d.client_id end,
         dossier_type = case when p_patch ? 'dossier_type' then p_patch->>'dossier_type' else d.dossier_type end,
         period_start = v_new_start,
         period_end = v_new_end,
         notes = case when p_patch ? 'notes' then nullif(btrim(p_patch->>'notes'), '') else d.notes end,
         status = case when p_patch ? 'status' then p_patch->>'status' else d.status end,
         updated_by = p_actor_id
   where d.id = p_dossier_id
   returning d.* into v_dossier;

  insert into public.fiscal_audit_events(actor_id, action, entity_type, entity_id, metadata)
  values (
    p_actor_id, 'dossier.updated', 'fiscal_dossier', v_dossier.id,
    jsonb_build_object('changed_fields', to_jsonb(v_fields))
  );

  return to_jsonb(v_dossier);
end;
$$;

revoke all on function public.fiscal_list_dossiers(uuid, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.fiscal_create_dossier(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.fiscal_update_dossier(uuid, uuid, jsonb) from public, anon, authenticated;

grant execute on function public.fiscal_list_dossiers(uuid, text, text, integer, integer) to service_role;
grant execute on function public.fiscal_create_dossier(uuid, jsonb) to service_role;
grant execute on function public.fiscal_update_dossier(uuid, uuid, jsonb) to service_role;

commit;
