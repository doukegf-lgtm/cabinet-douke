import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/platform/auth'
import { getServiceClient } from '@/lib/platform/supabase-server'

export const runtime = 'nodejs'

export async function GET() {
  const a = await requireAdmin(); if (!a.ok) return a.response
  const { data, error } = await getServiceClient()
    .from('profiles').select('id, username, name, role, eden_access').order('role', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
  const a = await requireAdmin(); if (!a.ok) return a.response
  const { target_id, access_value } = await req.json().catch(() => ({}))
  if (!target_id || typeof access_value !== 'boolean') {
    return NextResponse.json({ error: 'target_id et access_value requis' }, { status: 400 })
  }
  const { error } = await getServiceClient().from('profiles').update({ eden_access: access_value }).eq('id', target_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
