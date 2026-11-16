begin;

create or replace function public.fiscal_assert_validator(p_actor_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_role text;
  v_all_modules boolean;
  v_fiscal_access boolean;
  v_validate_access boolean;
begin
  if p_actor_id is null then
    raise exception 'Utilisateur non identifié.' using errcode = '42501';
  end if;

  select role, all_modules_access, fiscal_access, fiscal_validate_access
    into v_role, v_all_modules, v_fiscal_access, v_validate_access
    from public.auth_accounts
   where id = p_actor_id;

  if not found then
    raise exception 'Compte utilisateur introuvable.' using errcode = '42501';
  end if;

  if v_role in ('Super-Admin', 'admin') then
    return;
  end if;

  if coalesce(v_validate_access, false)
     and (
       coalesce(v_fiscal_access, false)
       or coalesce(v_all_modules, false)
     ) then
    return;
  end if;

  raise exception 'Autorisation de validation fiscale insuffisante.'
    using errcode = '42501';
end;
$$;

revoke all on function public.fiscal_assert_validator(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.fiscal_assert_validator(uuid)
  to service_role;

comment on function public.fiscal_assert_validator(uuid) is
  'Autorise les administrateurs ou les utilisateurs disposant du droit de validation et de l’accès au module fiscal.';

do $$
declare
  v_signature regprocedure;
  v_definition text;
  v_signatures regprocedure[] := array[
    'public.fiscal_transition_calculation(uuid,uuid,text,text)'::regprocedure,
    'public.fiscal_transition_annual_input(uuid,uuid,text,text)'::regprocedure,
    'public.fiscal_transition_tax_profile(uuid,uuid,uuid,text,text)'::regprocedure,
    'public.fiscal_transition_cnss_periods(uuid,uuid,uuid,text,text)'::regprocedure
  ];
  v_old text := 'perform public.fiscal_assert_admin(p_actor_id);';
  v_new text := 'perform public.fiscal_assert_validator(p_actor_id);';
begin
  foreach v_signature in array v_signatures loop
    v_definition := pg_get_functiondef(v_signature::oid);

    if position(v_old in v_definition) = 0 then
      raise exception 'Contrôle attendu introuvable dans %.', v_signature;
    end if;

    execute replace(v_definition, v_old, v_new);
  end loop;
end;
$$;

comment on function public.fiscal_transition_calculation(uuid, uuid, text, text) is
  'Transition des calculs fiscaux avec contrôle des droits de validation et journalisation.';

comment on function public.fiscal_transition_annual_input(uuid, uuid, text, text) is
  'Validation ou retour pour correction des fiches annuelles avec contrôle des droits de validation.';

comment on function public.fiscal_transition_tax_profile(uuid, uuid, uuid, text, text) is
  'Validation ou retour pour correction du profil fiscal avec contrôle des droits de validation.';

comment on function public.fiscal_transition_cnss_periods(uuid, uuid, uuid, text, text) is
  'Validation ou retour pour correction des périodes CNSS avec contrôle des droits de validation.';

commit;