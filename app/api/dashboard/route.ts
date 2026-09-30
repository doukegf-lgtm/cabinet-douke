import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createServerSupabaseClient, dashboardRead, dashboardWrite, WritePayload } from '@/app/supabaseClient'
import { requireUser, requireAdmin } from '@/lib/platform/auth'

export const runtime = 'nodejs'

export async function GET() {
  const a = await requireUser(); if (!a.ok) return a.response
  try {
    const data = await dashboardRead(createServerSupabaseClient())
    return NextResponse.json(data)
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : JSON.stringify(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const a = await requireUser(); if (!a.ok) return a.response
  try {
    const body = await req.json()
    const { action, table, id } = body as { action: string; table: string; id?: string }
    let data = body.data as WritePayload | undefined
    if (!action || !table) return NextResponse.json({ error: 'action et table sont requis' }, { status: 400 })

    if (table === 'auth_accounts') {
      const adm = await requireAdmin(); if (!adm.ok) return adm.response
      if (data && typeof data.password_hash === 'string' && !data.password_hash.startsWith('$2')) {
        data = { ...data, password_hash: await bcrypt.hash(data.password_hash, 10) }
      }
    }

    const result = await dashboardWrite(createServerSupabaseClient(), action, table, data, id)
    if (table === 'auth_accounts' && result && typeof result === 'object') {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password_hash, ...safe } = result as Record<string, unknown>
      return NextResponse.json({ data: safe })
    }
    return NextResponse.json({ data: result })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : JSON.stringify(err) }, { status: 500 })
  }
}
