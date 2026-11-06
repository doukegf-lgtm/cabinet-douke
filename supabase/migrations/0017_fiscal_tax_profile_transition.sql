begin;

-- Transition dédiée au profil fiscal : aucune fiche annuelle ne peut
-- être validée par cette fonction.
create or replace function public.fiscal_transition_tax_profile(
  p_actor_id uuid,
  p_dossier_id uuid,
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
  v_dossier_status text;
  v_event text;
begin
  perform public.fiscal_assert_admin(p_actor_id);

  if p_actor_id is null
     or p_dossier_id is null
     or p_input_id is null
     or p_new_status is null
     or p_new_status not in ('validated', 'needs_changes')
     or length(coalesce(p_note, '')) > 2000 then
    raise exception 'Demande de validation invalide.'
      using errcode = '22023';
  end if;

  -- Verrouiller le dossier avant la fiche.
  select status
    into v_dossier_status
    from public.fiscal_dossiers
   where id = p_dossier_id
   for update;

  if not found then
    raise exception 'Dossier introuvable.'
      using errcode = 'P0002';
  end if;

  -- Vérifier simultanément l'identifiant, le dossier et la section.
  select *
    into v_input
    from public.fiscal_dossier_inputs
   where id = p_input_id
     and dossier_id = p_dossier_id
     and section_code = 'tax_profile'
   for update;

  if not found then
    raise exception 'Profil fiscal introuvable dans ce dossier.'
      using errcode = 'P0002';
  end if;

  if v_dossier_status in ('validated', 'closed') then
    raise exception 'Le dossier est verrouillé.'
      using errcode = '55000';
  end if;

  if v_input.status <> 'submitted' then
    raise exception 'Seul un profil soumis peut être revu.'
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
     where id = p_input_id
       and dossier_id = p_dossier_id
       and section_code = 'tax_profile';

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
     where id = p_input_id
       and dossier_id = p_dossier_id
       and section_code = 'tax_profile';

    v_event := 'returned_for_changes';
  end if;

  insert into public.fiscal_dossier_input_events (
    input_id, actor_id, event_type, details
  )
  values (
    p_input_id,
    p_actor_id,
    v_event,
    jsonb_build_object(
      'status', p_new_status,
      'section_code', 'tax_profile',
      'note', nullif(btrim(p_note), ''),
      'version', v_input.version
    )
  );

  return jsonb_build_object(
    'id', p_input_id,
    'dossier_id', p_dossier_id,
    'section_code', 'tax_profile',
    'status', p_new_status,
    'event_type', v_event
  );
end;
$$;

revoke all on function public.fiscal_transition_tax_profile(uuid, uuid, uuid, text, text)
  from public, anon, authenticated, service_role;

grant execute on function public.fiscal_transition_tax_profile(uuid, uuid, uuid, text, text)
  to service_role;

comment on function public.fiscal_transition_tax_profile(uuid, uuid, uuid, text, text) is
  'Valide ou retourne pour correction exclusivement une section tax_profile du dossier indiqué.';

commit;
