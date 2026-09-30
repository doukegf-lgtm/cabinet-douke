import { NextRequest, NextResponse } from 'next/server'
import { verifySession, SESSION_COOKIE } from '@/lib/platform/session'
import { journal } from '@/lib/asta/journal/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const raw = Number(req.nextUrl.searchParams.get('limit') ?? 100)
  const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 500) : 100
  try {
    return NextResponse.json({ events: await journal(limit) })
  } catch (e) {
    console.error('asta journal', e)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
