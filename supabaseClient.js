import { createClient } from '@supabase/supabase-js';

// Ces variables iront dans votre fichier .env.local en local, puis dans Vercel
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://utwspojleufrbeylnazn.supabase.co';
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'votre_cle_temporaire';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
