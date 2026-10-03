import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/platform/auth'
import { hit } from '@/lib/platform/ratelimit'
import { isUuid } from '@/lib/asta/ops/campaign'
import { getCampaign, setStatus, runDiscovery, proposeActions } from '@/lib/asta/ops/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type P = { params: { id: string } }

export async function GET(_: NextRequest, { params }: P) {
  const a = await requireAdmin(); if (!a.ok) return a.response
  if (!isUuid(params.id)) return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 })
  try {
    const d = await getCampaign(params.id)
    return d ? NextResponse.json(d) : NextResponse.json({ error: 'Campagne introuvable' }, { status: 404 })
  } catch (e) { console.error('asta campaign', e); return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 }) }
}
export async function PATCH(req: NextRequest, { params }: P) {
  const a = await requireAdmin(); if (!a.ok) return a.response
  if (!isUuid(params.id)) return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 })
  const b = await req.json().catch(() => ({}))
  const op = typeof b.op === 'string' ? b.op : ''
  try {
    if (op === 'discover') {
      if (!hit(`disc:${a.session.sub}`, 10, 3600000)) return NextResponse.json({ error: 'Trop de recherches, réessayez plus tard.' }, { status: 429 })
      const r = await runDiscovery(params.id); return NextResponse.json(r.body, { status: r.status })
    }
    if (op === 'propose_actions') { const r = await proposeActions(params.id); return NextResponse.json(r.body, { status: r.status }) }
    const r = await setStatus(params.id, op, a.session.sub)
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) { console.error('asta campaign op', e); return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 }) }
}
