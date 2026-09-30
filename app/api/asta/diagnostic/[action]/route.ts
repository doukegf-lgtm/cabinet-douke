import { NextRequest, NextResponse } from 'next/server'
import { hit } from '@/lib/platform/ratelimit'
import { start, answer, lead } from '@/lib/asta/diagnostic/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const LIMITS: Record<string, number> = { start: 15, answer: 150, lead: 10 } // par IP et par heure

export async function POST(req: NextRequest, { params }: { params: { action: string } }) {
  const a = params.action
  if (!Object.prototype.hasOwnProperty.call(LIMITS, a)) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
  const ip = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim()
  if (!hit(`asta:${a}:${ip}`, LIMITS[a], 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Trop de requêtes, réessayez plus tard.' }, { status: 429 })
  }
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>
  try {
    const r = a === 'start' ? await start(ip) : a === 'answer' ? await answer(b.token, b.key, b.value) : await lead(b.token, b)
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) {
    console.error('asta', a, e)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
