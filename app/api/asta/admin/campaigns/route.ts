import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/platform/auth'
import { hit } from '@/lib/platform/ratelimit'
import { validateCampaign } from '@/lib/asta/ops/campaign'
import { createCampaign, listCampaigns } from '@/lib/asta/ops/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const a = await requireAdmin(); if (!a.ok) return a.response
  try { return NextResponse.json(await listCampaigns()) }
  catch (e) { console.error('asta campaigns', e); return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 }) }
}
export async function POST(req: NextRequest) {
  const a = await requireAdmin(); if (!a.ok) return a.response
  if (!hit(`camp:${a.session.sub}`, 30, 3600000)) return NextResponse.json({ error: 'Trop de créations, réessayez plus tard.' }, { status: 429 })
  const v = validateCampaign(await req.json().catch(() => ({})))
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const r = await createCampaign(v.value, a.session.sub)
  return NextResponse.json(r.body, { status: r.status })
}
