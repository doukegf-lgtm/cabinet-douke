import { getServiceClient } from '@/lib/platform/supabase-server'
import { computeKpis, dayBounds } from './kpi'

// Limite Supabase par défaut : 1000 lignes par requête. Suffisant à ce volume ; à paginer au-delà.
export async function buildDailyReport(day: string) {
  const db = getServiceClient()
  const { startIso, endIso } = dayBounds(day)
  const [s, e] = await Promise.all([
    db.from('asta_diagnostic_sessions').select('started_at, completed_at').gte('started_at', startIso).lt('started_at', endIso),
    db.from('asta_events').select('type, created_at').gte('created_at', startIso).lt('created_at', endIso),
  ])
  if (s.error || e.error) throw new Error('Lecture impossible')
  const kpis = computeKpis(day, s.data ?? [], e.data ?? [])
  const up = await db.from('asta_daily_reports').upsert({ day, kpis }, { onConflict: 'day' })
  if (up.error) throw new Error('Écriture impossible')
  return kpis
}

// Journal : aucune donnée personnelle (ni nom ni numéro), seulement type, session et payload technique.
export async function journal(limit: number) {
  const db = getServiceClient()
  const { data, error } = await db.from('asta_events')
    .select('id, type, session_id, payload, created_at').order('id', { ascending: false }).limit(limit)
  if (error) throw new Error('Lecture impossible')
  return data ?? []
}
