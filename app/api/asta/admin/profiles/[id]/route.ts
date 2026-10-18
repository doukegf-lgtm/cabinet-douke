import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/platform/auth'
import { hit } from '@/lib/platform/ratelimit'
import { isUuid } from '@/lib/asta/ops/campaign'
import { deleteProfile } from '@/lib/asta/ops/delete-service'
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

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const a = await requireAdmin(); if (!a.ok) return a.response
  if (!isUuid(params.id)) return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 })
  if (!hit(`del:${a.session.sub}`, 60, 3600000)) return NextResponse.json({ error: 'Trop de suppressions, réessayez plus tard.' }, { status: 429 })
  const force = new URL(req.url).searchParams.get('force') === '1'
  try { const r = await deleteProfile(params.id, a.session.sub, force); return NextResponse.json(r.body, { status: r.status }) }
  catch (e) { console.error('asta profile delete', e); return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 }) }
}
