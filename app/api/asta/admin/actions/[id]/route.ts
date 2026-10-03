import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/platform/auth'
import { hit } from '@/lib/platform/ratelimit'
import { isUuid } from '@/lib/asta/ops/campaign'
import { decideAction } from '@/lib/asta/ops/service'
import { editAction } from '@/lib/asta/ops/edit-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const a = await requireAdmin(); if (!a.ok) return a.response
  if (!isUuid(params.id)) return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 })
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>
  const op = typeof b.op === 'string' ? b.op : ''
  try {
    if (op === 'edit') {
      if (!hit(`edit:${a.session.sub}`, 120, 3600000)) return NextResponse.json({ error: 'Trop de modifications, réessayez plus tard.' }, { status: 429 })
      const r = await editAction(params.id, b, a.session.sub)
      return NextResponse.json(r.body, { status: r.status })
    }
    const r = await decideAction(params.id, op, b, a.session.sub)
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) { console.error('asta action', e); return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 }) }
}
