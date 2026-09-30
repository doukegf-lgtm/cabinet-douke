import { NextResponse } from 'next/server'
import { getSession } from '@/lib/platform/auth'

export async function GET() {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  return NextResponse.json({ id: s.sub, role: s.role, name: s.name })
}
