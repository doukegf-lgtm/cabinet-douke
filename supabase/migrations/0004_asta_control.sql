create table if not exists public.asta_actions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  type text not null,
  title text not null,
  description text,

  state text not null default 'propose'
    check (state in (
      'propose',
      'a_valider',
      'autorise',
      'execute',
      'refuse',
      'annule',
      'echec'
    )),

  priority text not null default 'normal'
    check (priority in ('basse','normal','haute','critique')),

  source text not null default 'asta',
  payload jsonb not null default '{}'::jsonb,
  result jsonb,

  proposed_at timestamptz,
  validated_at timestamptz,
  authorized_at timestamptz,
  executed_at timestamptz,

  error text,
  idempotency_key text unique
);

create index if not exists asta_actions_state_idx
  on public.asta_actions(state);

create index if not exists asta_actions_created_idx
  on public.asta_actions(created_at desc);


create table if not exists public.asta_memory (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  scope text not null default 'global'
    check (scope in ('global','prospect','mission','session')),

  memory_type text not null,

  content text not null,

  metadata jsonb not null default '{}'::jsonb,

  importance int not null default 50
    check (importance between 0 and 100),

  active boolean not null default true,

  expires_at timestamptz
);

create index if not exists asta_memory_scope_idx
  on public.asta_memory(scope);

create index if not exists asta_memory_active_idx
  on public.asta_memory(active);


alter table public.asta_actions enable row level security;
alter table public.asta_memory enable row level security;

revoke all on public.asta_actions from anon, authenticated;
revoke all on public.asta_memory from anon, authenticated;
