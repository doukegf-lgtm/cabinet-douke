ALTER TABLE public.auth_accounts
  ADD COLUMN IF NOT EXISTS all_modules_access boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS asta_access boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fiscal_access boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fiscal_validate_access boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.auth_accounts.all_modules_access IS
  'Accès individuel à tous les modules, sans privilèges administrateur.';
COMMENT ON COLUMN public.auth_accounts.asta_access IS
  'Accès individuel au module ASTA.';
COMMENT ON COLUMN public.auth_accounts.fiscal_access IS
  'Accès individuel au module Fiscal et Social.';

COMMENT ON COLUMN public.auth_accounts.fiscal_validate_access IS
  'Autorisation individuelle de valider ou rejeter les saisies et calculs du module Fiscal et Social.';