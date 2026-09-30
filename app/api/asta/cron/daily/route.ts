import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { buildDailyReport } from '@/lib/asta/journal/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// null = CRON_SECRET non configuré (fermé par défaut)
function authorized(req: NextRequest): boolean | null {
  const secret = process.env.CRON_SECRET
  if (!secret) return null
  const a = Buffer.from(req.headers.get('authorization') ?? '')
  const b = Buffer.from(`Bearer ${secret}`)
  return a.length === b.length && timingSafeEqual(a, b)
}
const yesterday = () => new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10)

export async function GET(req: NextRequest) {
  const ok = authorized(req)
  if (ok === null) return NextResponse.json({ error: 'CRON_SECRET non configuré' }, { status: 503 })
  if (!ok) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  const day = req.nextUrl.searchParams.get('day') ?? yesterday()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day))) return NextResponse.json({ error: 'Date invalide' }, { status: 400 })
  try {
    return NextResponse.json(await buildDailyReport(day))
  } catch (e) {
    console.error('asta daily', e)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
