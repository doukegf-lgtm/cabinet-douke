import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/platform/auth'
import { isUuid } from '@/lib/asta/ops/campaign'
import { decideProfile } from '@/lib/asta/ops/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const a = await requireAdmin(); if (!a.ok) return a.response
  if (!isUuid(params.id)) return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 })
  const b = await req.json().catch(() => ({}))
  try { const r = await decideProfile(params.id, typeof b.op === 'string' ? b.op : '', a.session.sub); return NextResponse.json(r.body, { status: r.status }) }
  catch (e) { console.error('asta profile', e); return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 }) }
}
