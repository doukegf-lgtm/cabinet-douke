import { NextRequest, NextResponse } from 'next/server'
import { hit } from '@/lib/platform/ratelimit'
import { chatTurn, handoff } from '@/lib/asta/chat/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const LIMITS: Record<string, number> = { turn: 40, handoff: 5 } // par IP et par heure

export async function POST(req: NextRequest, { params }: { params: { action: string } }) {
  const a = params.action
  if (!Object.prototype.hasOwnProperty.call(LIMITS, a)) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
  const ip = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim()
  if (!hit(`chat:${a}:${ip}`, LIMITS[a], 3600000)) return NextResponse.json({ error: 'Trop de messages, réessayez plus tard.' }, { status: 429 })
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>
  try {
    const r = a === 'turn' ? await chatTurn(b) : await handoff(b)
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) { console.error('asta chat route', e); return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 }) }
}
