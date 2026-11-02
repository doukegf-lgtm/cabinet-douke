-- Cabinet DOUKE - API clients fiscal-social.
-- Fonctions transactionnelles : mutation client + événement d'audit.
-- Exécution réservée au serveur via service_role.

begin;

create or replace function public.fiscal_assert_admin(p_actor_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_actor_id is null or not exists (
    select 1
    from public.auth_accounts a
    where a.id = p_actor_id
      and a.role in ('Super-Admin', 'admin')
  ) then
    raise exception 'Accès administrateur requis'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function public.fiscal_list_clients(
  p_actor_id uuid,
  p_search text default null,
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
  v_page integer;
  v_page_size integer;
begin
  perform public.fiscal_assert_admin(p_actor_id);

  if p_page is null or p_page < 1 or p_page > 100000 then
    raise exception 'Numéro de page invalide'
      using errcode = '22023';
  end if;

  if p_page_size is null or p_page_size < 1 or p_page_size > 100 then
    raise exception 'Taille de page invalide (1 à 100)'
      using errcode = '22023';
  end if;

  v_page := p_page;
  v_page_size := p_page_size;

  -- Échapper les caractères spéciaux LIKE pour traiter la recherche
  -- comme du texte ordinaire, et non comme un motif fourni par l'utilisateur.
  v_search := replace(
    replace(
      replace(btrim(coalesce(p_search, '')), E'\\', E'\\\\'),
      '%', E'\\%'
    ),
    '_', E'\\_'
  );

  select count(*)
    into v_total
    from public.fiscal_clients c
   where v_search = ''
      or c.legal_name ilike '%' || v_search || '%' escape E'\\'
      or coalesce(c.ifu, '') ilike '%' || v_search || '%' escape E'\\'
      or coalesce(c.rccm, '') ilike '%' || v_search || '%' escape E'\\';

  select coalesce(
    jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id desc),
    '[]'::jsonb
  )
    into v_data
    from (
      select c.*
        from public.fiscal_clients c
       where v_search = ''
          or c.legal_name ilike '%' || v_search || '%' escape E'\\'
          or coalesce(c.ifu, '') ilike '%' || v_search || '%' escape E'\\'
          or coalesce(c.rccm, '') ilike '%' || v_search || '%' escape E'\\'
       order by c.created_at desc, c.id desc
       limit v_page_size
       offset (v_page - 1) * v_page_size
    ) x;

  return jsonb_build_object(
    'data', v_data,
    'total', v_total,
    'page', v_page,
    'pageSize', v_page_size,
    'totalPages', case
      when v_total = 0 then 0
      else ceil(v_total::numeric / v_page_size)::integer
    end
  );
end;
$$;

create or replace function public.fiscal_create_client(
  p_actor_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_client public.fiscal_clients%rowtype;
  v_legal_name text;
  v_status text;
begin
  perform public.fiscal_assert_admin(p_actor_id);

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Données client invalides'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_payload) as k(key)
    where key not in (
      'legal_name', 'ifu', 'rccm', 'phone', 'email', 'address', 'status'
    )
  ) then
    raise exception 'Champ client non autorisé'
      using errcode = '22023';
  end if;

  v_legal_name := nullif(btrim(p_payload->>'legal_name'), '');
  v_status := coalesce(nullif(btrim(p_payload->>'status'), ''), 'active');

  if v_legal_name is null then
    raise exception 'La raison sociale est obligatoire'
      using errcode = '22023';
  end if;

  if v_status not in ('active', 'archived') then
    raise exception 'Statut client invalide'
      using errcode = '22023';
  end if;

  insert into public.fiscal_clients (
    legal_name, ifu, rccm, phone, email, address,
    status, created_by, updated_by
  )
  values (
    v_legal_name,
    nullif(btrim(p_payload->>'ifu'), ''),
    nullif(btrim(p_payload->>'rccm'), ''),
    nullif(btrim(p_payload->>'phone'), ''),
    nullif(btrim(p_payload->>'email'), ''),
    nullif(btrim(p_payload->>'address'), ''),
    v_status,
    p_actor_id,
    p_actor_id
  )
  returning * into v_client;

  insert into public.fiscal_audit_events (
    actor_id, action, entity_type, entity_id, metadata
  )
  values (
    p_actor_id,
    'client.created',
    'fiscal_client',
    v_client.id,
    jsonb_build_object(
      'fields',
      (
        select coalesce(
          jsonb_agg(k.key order by k.key),
          '[]'::jsonb
        )
        from jsonb_object_keys(p_payload) as k(key)
      )
    )
  );

  return to_jsonb(v_client);
end;
$$;

create or replace function public.fiscal_update_client(
  p_actor_id uuid,
  p_client_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_client public.fiscal_clients%rowtype;
  v_fields text[];
  v_status text;
begin
  perform public.fiscal_assert_admin(p_actor_id);

  if p_client_id is null
     or p_patch is null
     or jsonb_typeof(p_patch) <> 'object'
     or p_patch = '{}'::jsonb
  then
    raise exception 'Modification client invalide'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_patch) as k(key)
    where key not in (
      'legal_name', 'ifu', 'rccm', 'phone', 'email', 'address', 'status'
    )
  ) then
    raise exception 'Champ client non autorisé'
      using errcode = '22023';
  end if;

  select array_agg(key order by key)
    into v_fields
    from jsonb_object_keys(p_patch) as k(key);

  if p_patch ? 'legal_name'
     and nullif(btrim(p_patch->>'legal_name'), '') is null
  then
    raise exception 'La raison sociale ne peut pas être vide'
      using errcode = '22023';
  end if;

  if p_patch ? 'status' then
    v_status := nullif(btrim(p_patch->>'status'), '');
    if v_status is null
       or v_status not in ('active', 'archived') then
      raise exception 'Statut client invalide'
        using errcode = '22023';
    end if;
  end if;

  update public.fiscal_clients c
     set legal_name = case
           when p_patch ? 'legal_name' then btrim(p_patch->>'legal_name')
           else c.legal_name
         end,
         ifu = case
           when p_patch ? 'ifu' then nullif(btrim(p_patch->>'ifu'), '')
           else c.ifu
         end,
         rccm = case
           when p_patch ? 'rccm' then nullif(btrim(p_patch->>'rccm'), '')
           else c.rccm
         end,
         phone = case
           when p_patch ? 'phone' then nullif(btrim(p_patch->>'phone'), '')
           else c.phone
         end,
         email = case
           when p_patch ? 'email' then nullif(btrim(p_patch->>'email'), '')
           else c.email
         end,
         address = case
           when p_patch ? 'address' then nullif(btrim(p_patch->>'address'), '')
           else c.address
         end,
         status = case
           when p_patch ? 'status' then v_status
           else c.status
         end,
         updated_by = p_actor_id
   where c.id = p_client_id
   returning c.* into v_client;

  if not found then
    raise exception 'Client introuvable'
      using errcode = 'P0002';
  end if;

  insert into public.fiscal_audit_events (
    actor_id, action, entity_type, entity_id, metadata
  )
  values (
    p_actor_id,
    'client.updated',
    'fiscal_client',
    v_client.id,
    jsonb_build_object('changed_fields', to_jsonb(v_fields))
  );

  return to_jsonb(v_client);
end;
$$;

-- Les fonctions ne sont accessibles qu'au serveur authentifié par service_role.
revoke all on function public.fiscal_assert_admin(uuid)
  from public, anon, authenticated;
revoke all on function public.fiscal_list_clients(uuid, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.fiscal_create_client(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.fiscal_update_client(uuid, uuid, jsonb)
  from public, anon, authenticated;

grant execute on function public.fiscal_assert_admin(uuid) to service_role;
grant execute on function public.fiscal_list_clients(uuid, text, integer, integer) to service_role;
grant execute on function public.fiscal_create_client(uuid, jsonb) to service_role;
grant execute on function public.fiscal_update_client(uuid, uuid, jsonb) to service_role;

commit;
