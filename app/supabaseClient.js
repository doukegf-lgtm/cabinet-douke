import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://utwspojleufrbeylnazn.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'votre_cle_temporaire';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey;

export const createBrowserSupabaseClient = () => createClient(supabaseUrl, supabaseAnonKey);
export const createServerSupabaseClient = () => createClient(supabaseUrl, supabaseServiceRoleKey);

export const forceSupabaseConnection = async (client) => {
  const { error } = await client.from('auth_accounts').select('id').limit(1);
  if (error) throw error;
  return true;
};

export const TABLES = ['auth_accounts', 'collaborators', 'objectives', 'activities', 'realisations', 'remarques'];

export const isTableName = (value) => TABLES.includes(value);

export const dashboardRead = async (client) => {
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

export const dashboardWrite = async (client, action, table, data, id) => {
  if (!isTableName(table)) {
    throw new Error('Table invalide');
  }

  const normalizedData = table === 'objectives' && data && typeof data === 'object'
    ? (({ category, ...rest }) => rest)(data)
    : data;

  if (action === 'insert') {
    const { data: inserted, error } = await client.from(table).insert(normalizedData).select('*').single();
    if (error) throw error;
    return inserted;
  }

  if (action === 'update') {
    const { data: updated, error } = await client.from(table).update(normalizedData).eq('id', id).select('*').single();
    if (error) throw error;
    return updated;
  }

  if (action === 'delete') {
    const { error } = await client.from(table).delete().eq('id', id);
    if (error) throw error;
    return { ok: true };
  }

  throw new Error('Action invalide');
};
