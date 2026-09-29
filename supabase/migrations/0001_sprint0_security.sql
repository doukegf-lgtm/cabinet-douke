-- ÉTAPE 1 — AVANT le déploiement : la colonne doit pouvoir contenir un hash bcrypt (60 caractères)
alter table public.auth_accounts alter column password_hash type text;

-- ÉTAPE 2 — APRÈS le déploiement ET après « bash ~/sprint0.sh verify » : rend password_hash illisible avec la clé publique
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ') into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'auth_accounts' and column_name <> 'password_hash';
  execute 'revoke select on public.auth_accounts from anon, authenticated';
  execute format('grant select (%s) on public.auth_accounts to anon, authenticated', cols);
end $$;
-- Retour arrière si un écran casse :
--   grant select on public.auth_accounts to anon, authenticated;

-- ÉTAPE 3 — Audit (à me transmettre)
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1;
select tablename, policyname, cmd, roles, qual, with_check from pg_policies where schemaname = 'public' order by 1, 2;
select table_name, grantee, privilege_type from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon', 'authenticated') order by 1, 2, 3;
