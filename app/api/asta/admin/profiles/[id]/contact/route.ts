import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/platform/auth'
import { hit } from '@/lib/platform/ratelimit'
import { isUuid } from '@/lib/asta/ops/campaign'
import { attachContact } from '@/lib/asta/ops/contact-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const a = await requireAdmin(); if (!a.ok) return a.response
  if (!isUuid(params.id)) return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 })
  if (!hit(`ctc:${a.session.sub}`, 60, 3600000)) return NextResponse.json({ error: 'Trop de modifications, réessayez plus tard.' }, { status: 429 })
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>
  try { const r = await attachContact(params.id, b, a.session.sub); return NextResponse.json(r.body, { status: r.status }) }
  catch (e) { console.error('asta profile contact', e); return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 }) }
}
