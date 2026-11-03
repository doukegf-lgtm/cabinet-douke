import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/platform/auth'
import { getServiceClient } from '@/lib/platform/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ENGINE_VERSION = '0.1.0-preparation'
const WORKBOOK_VERSION = 'non-certifie'

function serverError() {
  return NextResponse.json(
    { error: 'Une erreur serveur est survenue.' },
    { status: 500, headers: { 'Cache-Control': 'no-store' } }
  )
}

export async function GET(request: Request) {
  try {
    const access = await requireAdmin()
    if (!access.ok) return access.response

    const params = new URL(request.url).searchParams
    const dossierId = params.get('dossier_id')

    if (dossierId && !UUID_RE.test(dossierId)) {
      return NextResponse.json({ error: 'Identifiant de dossier invalide.' }, { status: 400 })
    }

    let query = getServiceClient()
      .from('fiscal_calculations')
      .select('id,dossier_id,engine_version,workbook_version,blockers,validation_status,created_at')
      .order('created_at', { ascending: false })
      .limit(100)

    if (dossierId) query = query.eq('dossier_id', dossierId)

    const { data, error } = await query
    if (error) return serverError()

    return NextResponse.json(
      { data: data ?? [], limit: 100 },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch {
    return serverError()
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireAdmin()
    if (!access.ok) return access.response

    const raw = await request.text()
    if (raw.length > 60000) {
      return NextResponse.json({ error: 'Requête trop volumineuse.' }, { status: 413 })
    }

    let body: unknown
    try {
      body = JSON.parse(raw)
    } catch {
      return NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 })
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Données invalides.' }, { status: 400 })
    }

    const payload = body as Record<string, unknown>
    if (
      typeof payload.dossier_id !== 'string' ||
      !UUID_RE.test(payload.dossier_id) ||
      !payload.input_snapshot ||
      typeof payload.input_snapshot !== 'object' ||
      Array.isArray(payload.input_snapshot)
    ) {
      return NextResponse.json(
        { error: 'Un dossier valide et un instantané des données sont obligatoires.' },
        { status: 400 }
      )
    }

    const snapshot = JSON.stringify(payload.input_snapshot)
    if (snapshot.length > 50000) {
      return NextResponse.json({ error: 'Instantané trop volumineux.' }, { status: 413 })
    }

    const { data, error } = await getServiceClient().rpc('fiscal_create_calculation_draft', {
      p_actor_id: access.session.sub,
      p_dossier_id: payload.dossier_id,
      p_input_snapshot: payload.input_snapshot,
      p_engine_version: ENGINE_VERSION,
      p_workbook_version: WORKBOOK_VERSION,
    })

    if (error) {
      if (error.code === '22023') {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
      if (error.code === 'P0002') {
        return NextResponse.json({ error: 'Dossier introuvable.' }, { status: 404 })
      }
      if (error.code === '55000') {
        return NextResponse.json({ error: error.message }, { status: 409 })
      }
      return serverError()
    }

    return NextResponse.json(
      { data, message: 'Demande enregistrée et bloquée : aucun montant n’a été calculé.' },
      { status: 201, headers: { 'Cache-Control': 'no-store' } }
    )
  } catch {
    return serverError()
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await requireAdmin()
    if (!access.ok) return access.response

    const raw = await request.text()
    if (raw.length > 5000) {
      return NextResponse.json({ error: 'Requête trop volumineuse.' }, { status: 413 })
    }

    let body: unknown
    try {
      body = JSON.parse(raw)
    } catch {
      return NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 })
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Données invalides.' }, { status: 400 })
    }

    const payload = body as Record<string, unknown>
    if (
      typeof payload.calculation_id !== 'string' ||
      !UUID_RE.test(payload.calculation_id) ||
      !['pending_review', 'validated', 'rejected'].includes(String(payload.status)) ||
      (payload.note !== undefined && payload.note !== null &&
        (typeof payload.note !== 'string' || payload.note.length > 1000))
    ) {
      return NextResponse.json({ error: 'Paramètres de transition invalides.' }, { status: 400 })
    }

    const { data, error } = await getServiceClient().rpc('fiscal_transition_calculation', {
      p_actor_id: access.session.sub,
      p_calculation_id: payload.calculation_id,
      p_new_status: payload.status,
      p_note: payload.note ?? null,
    })

    if (error) {
      if (error.code === '22023') {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
      if (error.code === 'P0002') {
        return NextResponse.json({ error: 'Calcul introuvable.' }, { status: 404 })
      }
      if (error.code === '55000') {
        return NextResponse.json({ error: error.message }, { status: 409 })
      }
      return serverError()
    }

    return NextResponse.json(
      { data, message: 'Transition enregistrée dans l’historique.' },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch {
    return serverError()
  }
}
