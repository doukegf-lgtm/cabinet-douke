-- Cabinet DOUKE
-- Durcissement de l'intégrité du référentiel et des saisies annuelles.
-- Les données validées ne peuvent pas être réécrites.
-- Migration additive : aucune suppression de donnée.

begin;

-- ============================================================
-- 1. REFERENTIEL REGLEMENTAIRE
-- ============================================================

create or replace function public.fiscal_regulatory_entry_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  -- Une fiche validée conserve intégralement son contenu.
  -- Seul son statut peut devenir remplacé ou abrogé.
  if old.verification_status = 'validated' then
    if new.verification_status not in ('replaced', 'repealed') then
      raise exception
        'Une règle validée est immuable. Seul son remplacement ou son abrogation est autorisé.'
        using errcode = '55000';
    end if;

    if (
      to_jsonb(new) - array[
        'verification_status',
        'updated_by',
        'updated_at'
      ]::text[]
    ) is distinct from (
      to_jsonb(old) - array[
        'verification_status',
        'updated_by',
        'updated_at'
      ]::text[]
    ) then
      raise exception
        'Le contenu d''une règle validée ne peut pas être modifié. Créez une nouvelle version.'
        using errcode = '55000';
    end if;

    if new.verification_status = old.verification_status then
      raise exception
        'Aucune modification autorisée sur une règle validée sans changement de cycle de vie.'
        using errcode = '55000';
    end if;

    return new;
  end if;

  -- Une règle remplacée ou abrogée est définitivement figée.
  if old.verification_status in ('replaced', 'repealed') then
    raise exception
      'Une règle remplacée ou abrogée est immuable.'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

drop trigger if exists fiscal_regulatory_00_immutable_guard
  on public.fiscal_regulatory_entries;

create trigger fiscal_regulatory_00_immutable_guard
before update on public.fiscal_regulatory_entries
for each row
execute function public.fiscal_regulatory_entry_guard();


-- ============================================================
-- 2. SAISIES ANNUELLES
-- ============================================================

create or replace function public.fiscal_annual_input_update_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  -- Brouillon ou fiche retournée : modification contrôlée.
  if old.status in ('draft', 'needs_changes') then
    if new.status not in ('draft', 'submitted') then
      raise exception
        'Une fiche en brouillon ou à corriger ne peut devenir que brouillon ou soumise.'
        using errcode = '55000';
    end if;

    if new.version <> old.version + 1 then
      raise exception
        'Toute modification d''une fiche doit incrémenter sa version exactement d''une unité.'
        using errcode = '55000';
    end if;

    if new.validated_by is not null
       or new.validated_at is not null
       or new.validation_note is not null then
      raise exception
        'Une fiche modifiée doit perdre ses anciennes informations de validation.'
        using errcode = '55000';
    end if;

    if (
      to_jsonb(new) - array[
        'payload',
        'version',
        'status',
        'updated_by',
        'updated_at',
        'validated_by',
        'validated_at',
        'validation_note'
      ]::text[]
    ) is distinct from (
      to_jsonb(old) - array[
        'payload',
        'version',
        'status',
        'updated_by',
        'updated_at',
        'validated_by',
        'validated_at',
        'validation_note'
      ]::text[]
    ) then
      raise exception
        'Les identifiants et informations de création d''une fiche annuelle sont immuables.'
        using errcode = '55000';
    end if;

    return new;
  end if;

  -- Une fiche soumise peut uniquement être validée ou retournée.
  if old.status = 'submitted' then
    if new.status not in ('validated', 'needs_changes') then
      raise exception
        'Une fiche soumise doit être validée ou retournée pour correction.'
        using errcode = '55000';
    end if;

    if new.version <> old.version
       or new.payload is distinct from old.payload then
      raise exception
        'Le contenu d''une fiche soumise est verrouillé pendant sa revue.'
        using errcode = '55000';
    end if;

    if (
      to_jsonb(new) - array[
        'status',
        'updated_by',
        'updated_at',
        'validated_by',
        'validated_at',
        'validation_note'
      ]::text[]
    ) is distinct from (
      to_jsonb(old) - array[
        'status',
        'updated_by',
        'updated_at',
        'validated_by',
        'validated_at',
        'validation_note'
      ]::text[]
    ) then
      raise exception
        'Seule la transition de statut et ses métadonnées sont autorisées pendant la revue.'
        using errcode = '55000';
    end if;

    if new.status = 'validated' then
      if new.validated_by is null or new.validated_at is null then
        raise exception
          'La validation doit identifier son auteur et sa date.'
          using errcode = '23514';
      end if;

      if new.validation_note is not null
         and length(btrim(new.validation_note)) > 2000 then
        raise exception
          'La note de validation est trop longue.'
          using errcode = '22023';
      end if;
    else
      if new.validated_by is not null
         or new.validated_at is not null
         or nullif(btrim(new.validation_note), '') is null then
        raise exception
          'Le retour pour correction exige un motif et l''absence de validation.'
          using errcode = '23514';
      end if;
    end if;

    return new;
  end if;

  -- Une fiche validée est définitivement verrouillée.
  if old.status = 'validated' then
    raise exception
      'Une fiche annuelle validée est immuable. Une procédure de réouverture auditée sera nécessaire.'
      using errcode = '55000';
  end if;

  raise exception
    'Transition de fiche annuelle non autorisée.'
    using errcode = '55000';
end;
$$;

drop trigger if exists fiscal_annual_input_00_update_guard
  on public.fiscal_dossier_inputs;

create trigger fiscal_annual_input_00_update_guard
before update on public.fiscal_dossier_inputs
for each row
execute function public.fiscal_annual_input_update_guard();


-- ============================================================
-- 3. DOCUMENTATION
-- ============================================================

comment on function public.fiscal_regulatory_entry_guard() is
  'Empêche la modification du contenu des règles réglementaires validées, remplacées ou abrogées.';

comment on function public.fiscal_annual_input_update_guard() is
  'Verrouille les saisies annuelles soumises ou validées et encadre les modifications de brouillons.';

commit;
