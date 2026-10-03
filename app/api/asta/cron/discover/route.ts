import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { getServiceClient } from '@/lib/platform/supabase-server'
import { discover } from '@/lib/asta/ops/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorized(req: NextRequest): boolean | null {
  const secret = process.env.CRON_SECRET
  if (!secret) return null
  const a = Buffer.from(req.headers.get('authorization') ?? ''), b = Buffer.from(`Bearer ${secret}`)
  return a.length === b.length && timingSafeEqual(a, b)
}

// Une fois par jour : pour chaque campagne ACTIVE validée par l'admin, ASTA propose de nouveaux profils jusqu'à l'objectif.
export async function GET(req: NextRequest) {
  const ok = authorized(req)
  if (ok === null) return NextResponse.json({ error: 'CRON_SECRET non configuré' }, { status: 503 })
  if (!ok) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  const db = getServiceClient()
  const today = new Date().toISOString().slice(0, 10)
  const c = await db.from('asta_campaigns').select('*').eq('status', 'active').lte('start_date', today).gte('end_date', today).in('type', ['prospection', 'relance']).limit(5)
  if (c.error) return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  const out: Record<string, unknown>[] = []
  for (const camp of c.data ?? []) {
    try { out.push({ code: camp.code, ...(await discover(db, camp, 8)) }) }
    catch (e) { console.error('asta cron discover', e); out.push({ code: camp.code, error: true }) }
  }
  return NextResponse.json({ campaigns: out })
}
