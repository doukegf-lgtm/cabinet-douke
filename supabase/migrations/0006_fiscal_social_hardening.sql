-- Cabinet DOUKE - Durcissement du module fiscal-social.
-- Migration complémentaire à 0005.
-- À examiner avant toute application dans Supabase.

begin;

-- 1. Mise à jour automatique des dates updated_at.
create or replace function public.fiscal_touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists fiscal_clients_touch_updated_at
  on public.fiscal_clients;

create trigger fiscal_clients_touch_updated_at
before update on public.fiscal_clients
for each row execute function public.fiscal_touch_updated_at();

drop trigger if exists fiscal_dossiers_touch_updated_at
  on public.fiscal_dossiers;

create trigger fiscal_dossiers_touch_updated_at
before update on public.fiscal_dossiers
for each row execute function public.fiscal_touch_updated_at();

drop trigger if exists fiscal_legal_parameters_touch_updated_at
  on public.fiscal_legal_parameters;

create trigger fiscal_legal_parameters_touch_updated_at
before update on public.fiscal_legal_parameters
for each row execute function public.fiscal_touch_updated_at();

-- 2. Protection supplémentaire du journal d'audit.
create or replace function public.fiscal_reject_audit_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception
    'Le journal fiscal-social est append-only : modification et suppression interdites.';
end;
$$;

drop trigger if exists fiscal_audit_no_mutation
  on public.fiscal_audit_events;

create trigger fiscal_audit_no_mutation
before update or delete on public.fiscal_audit_events
for each row execute function public.fiscal_reject_audit_mutation();

revoke update, delete, truncate
on public.fiscal_audit_events
from service_role;

-- 3. Réduire l'exposition des fonctions techniques.
revoke all on function public.fiscal_touch_updated_at()
from public, anon, authenticated;

revoke all on function public.fiscal_reject_audit_mutation()
from public, anon, authenticated;

-- 4. Bucket documentaire privé.
-- Ne pas rendre ce bucket public.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'fiscal-documents',
  'fiscal-documents',
  false,
  20971520,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/csv',
    'image/jpeg',
    'image/png'
  ]
)
on conflict (id) do nothing;

-- Vérifier sans modifier une ressource préexistante.
do $$
declare
  bucket storage.buckets%rowtype;
begin
  select *
    into bucket
    from storage.buckets
   where id = 'fiscal-documents';

  if not found
     or bucket.public is distinct from false
     or bucket.name is distinct from 'fiscal-documents'
     or bucket.file_size_limit is distinct from 20971520
     or bucket.allowed_mime_types is distinct from array[
       'application/pdf',
       'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
       'application/vnd.ms-excel',
       'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
       'text/csv',
       'image/jpeg',
       'image/png'
     ]::text[]
  then
    raise exception
      'Bucket fiscal-documents absent ou incompatible. Aucune modification automatique autorisée.';
  end if;
end;
$$;

commit;
