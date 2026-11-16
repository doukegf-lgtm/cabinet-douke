import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/platform/auth'
import { getServiceClient } from '@/lib/platform/supabase-server'

export const runtime = 'nodejs'

const FIELDS = [
  'all_modules_access',
  'asta_access',
  'eden_access',
  'scout_access',
  'fiscal_access',
  'fiscal_validate_access',
] as const

type AccessField = typeof FIELDS[number]

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { data, error } = await getServiceClient()
    .from('auth_accounts')
    .select('id, username, name, role, all_modules_access, asta_access, eden_access, scout_access, fiscal_access, fiscal_validate_access')
    .order('name')

  if (error) return NextResponse.json({ error: 'Chargement impossible.' }, { status: 500 })
  return NextResponse.json({ data })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => null) as {
    target_id?: string
    field?: string
    access_value?: boolean
  } | null

  if (
    !body ||
    typeof body.target_id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.target_id) ||
    !FIELDS.includes(body.field as AccessField) ||
    typeof body.access_value !== 'boolean'
  ) {
    return NextResponse.json({ error: 'Paramètres invalides.' }, { status: 400 })
  }

  if (body.target_id === auth.session.sub) {
    return NextResponse.json({ error: 'Modification de ses propres droits interdite.' }, { status: 403 })
  }

  const db = getServiceClient()
  const field = body.field as AccessField


  const { data: target, error: readError } = await db
    .from('auth_accounts')
    .select('id, all_modules_access, eden_access, fiscal_access, fiscal_validate_access')
    .eq('id', body.target_id)
    .maybeSingle()

  if (readError || !target) {
    return NextResponse.json({ error: 'Compte introuvable.' }, { status: 404 })
  }

  if (
    field === 'fiscal_validate_access' &&
    body.access_value === true &&
    target.fiscal_access !== true &&
    target.all_modules_access !== true
  ) {
    return NextResponse.json(
      { error: 'Accordez d’abord l’accès au module Fiscal et Social à cet utilisateur.' },
      { status: 409 }
    )
  }

  const { error } = await db
    .from('auth_accounts')
    .update({ [field]: body.access_value })
    .eq('id', body.target_id)

  if (error) return NextResponse.json({ error: 'Mise à jour impossible.' }, { status: 500 })

  if (field === 'eden_access' || field === 'all_modules_access') {
    const oldValue = field === 'eden_access'
      ? target.eden_access
      : target.all_modules_access

    const effectiveEden = field === 'eden_access'
      ? body.access_value || target.all_modules_access === true
      : body.access_value || target.eden_access === true

    const { error: profileError } = await db
      .from('profiles')
      .update({ eden_access: effectiveEden })
      .eq('id', body.target_id)

    if (profileError) {
      await db.from('auth_accounts').update({ [field]: oldValue }).eq('id', body.target_id)
      return NextResponse.json({ error: 'Synchronisation EDEN impossible ; modification annulée.' }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
