-- 0021 : accès au module Fiscal pour les utilisateurs avec fiscal_access
create or replace function public.fiscal_assert_module_access(p_actor_id uuid)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_role text;
  v_all_modules boolean;
  v_fiscal_access boolean;
begin
  if p_actor_id is null then
    raise exception 'Utilisateur non identifié.' using errcode = '42501';
  end if;

  select role, all_modules_access, fiscal_access
    into v_role, v_all_modules, v_fiscal_access
    from public.auth_accounts
   where id = p_actor_id;

  if not found then
    raise exception 'Compte utilisateur introuvable.' using errcode = '42501';
  end if;

  if v_role in ('Super-Admin', 'admin') then
    return;
  end if;

  if coalesce(v_fiscal_access, false) or coalesce(v_all_modules, false) then
    return;
  end if;

  raise exception 'Accès au module Fiscal non autorisé.' using errcode = '42501';
end;
$$;

revoke all on function public.fiscal_assert_module_access(uuid) from public, anon, authenticated;
grant execute on function public.fiscal_assert_module_access(uuid) to service_role;

do $$
declare
  r record;
  n int := 0;
begin
  for r in
    select p.oid
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.prokind = 'f'
      and p.proname not in ('fiscal_assert_admin','fiscal_assert_validator',
                            'fiscal_reopen_validated_input','fiscal_assert_module_access')
      and pg_get_functiondef(p.oid) like '%fiscal_assert_admin%'
  loop
    execute replace(pg_get_functiondef(r.oid), 'fiscal_assert_admin', 'fiscal_assert_module_access');
    n := n + 1;
  end loop;

  if n <> 12 then
    raise exception 'Attendu 12 fonctions, trouvé %. Aucune modification conservée.', n;
  end if;
end $$;