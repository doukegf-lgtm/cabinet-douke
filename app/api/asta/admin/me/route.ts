import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/platform/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Sert uniquement à savoir, côté page, si la personne connectée est administratrice.
export async function GET() {
  const a = await requireAdmin(); if (!a.ok) return a.response
  return NextResponse.json({ admin: true })
}
