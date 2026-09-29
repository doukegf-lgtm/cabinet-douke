import { createClient } from '@supabase/supabase-js'

// Client serveur strict : jamais de repli silencieux sur la clé publique.
export function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants côté serveur')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
