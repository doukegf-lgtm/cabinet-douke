import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://utwspojleufrbeylnazn.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'votre_cle_temporaire';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey;

export const createBrowserSupabaseClient = () => createClient(supabaseUrl, supabaseAnonKey);
export const createServerSupabaseClient = () => createClient(supabaseUrl, supabaseServiceRoleKey);

export const TABLES = ['auth_accounts', 'collaborators', 'objectives', 'activities', 'realisations', 'remarques'] as const;
export type TableName = typeof TABLES[number];
export const isTableName = (value: string): value is TableName => (TABLES as readonly string[]).includes(value);

export type WritePayload = Record<string, string | number | boolean | null | undefined>;

export const dashboardRead = async (client: SupabaseClient) => {
  const [authAccounts, collaborators, objectives, activities, realisations, remarques] = await Promise.all([
    client.from('auth_accounts').select('*').order('created_at', { ascending: true }),
    client.from('collaborators').select('*').order('created_at', { ascending: true }),
    client.from('objectives').select('*').order('deadline', { ascending: true }),
    client.from('activities').select('*').order('created_at', { ascending: false }).limit(50),
    client.from('realisations').select('*').order('date', { ascending: false }),
    client.from('remarques').select('*').order('date', { ascending: false }),
  ]);
  return {
    auth_accounts: authAccounts.data ?? [],
    collaborators: collaborators.data ?? [],
    objectives: objectives.data ?? [],
    activities: activities.data ?? [],
    realisations: realisations.data ?? [],
    remarques: remarques.data ?? [],
    errors: [authAccounts.error, collaborators.error, objectives.error, activities.error, realisations.error, remarques.error].filter(Boolean),
  };
};

export const dashboardWrite = async (
  client: SupabaseClient,
  action: string,
  table: string,
  data?: WritePayload,
  id?: string
) => {
  if (!isTableName(table)) throw new Error('Table invalide');
  if (action === 'insert') {
    if (!data) throw new Error('data requis pour insert');
    const { data: inserted, error } = await client.from(table).insert(data).select('*').single();
    if (error) throw error;
    return inserted;
  }
  if (action === 'update') {
    if (!data) throw new Error('data requis pour update');
    if (!id) throw new Error('id requis pour update');
    const { data: updated, error } = await client.from(table).update(data).eq('id', id).select('*').single();
    if (error) throw error;
    return updated;
  }
  if (action === 'delete') {
    if (!id) throw new Error('id requis pour delete');
    const { error } = await client.from(table).delete().eq('id', id);
    if (error) throw error;
    return { ok: true };
  }
  throw new Error('Action invalide');
};
