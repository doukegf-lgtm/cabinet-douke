import { getServiceClient } from '@/lib/platform/supabase-server'
import { underCap } from './campaign'

const env = (k: string, d: number) => { const n = Number(process.env[k]); return Number.isFinite(n) && n > 0 ? n : d }
export const CAPS = { discovery: env('ASTA_CAP_DISCOVERY', 10), chat: env('ASTA_CAP_CHAT', 300), admin: env('ASTA_CAP_ADMIN', 100) }
export type UsageKind = keyof typeof CAPS

// Réserve un appel IA pour aujourd'hui (UTC). Faux si le plafond est atteint ou si la base est en défaut : l'IA ne tourne jamais sans compteur.
export async function reserve(kind: UsageKind): Promise<boolean> {
  const db = getServiceClient()
  const start = new Date(); start.setUTCHours(0, 0, 0, 0)
  const c = await db.from('asta_ai_usage').select('id', { count: 'exact', head: true }).eq('kind', kind).gte('created_at', start.toISOString())
  if (c.error || !underCap(c.count ?? 0, CAPS[kind])) return false
  const ins = await db.from('asta_ai_usage').insert({ kind })
  return !ins.error
}
