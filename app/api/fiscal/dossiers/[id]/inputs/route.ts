import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/platform/auth'
import { getServiceClient } from '@/lib/platform/supabase-server'
import {
  annualRpcError,
  annualServerError,
  readAnnualBody,
  validateAnnualPayload,
  UUID,
} from '@/lib/fiscal/annual-input-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  context: { params: { id: string } },
) {
  try {
    const access = await requireAdmin()
    if (!access.ok) return access.response

    const dossierId = context.params.id
    if (!UUID.test(dossierId)) {
      return NextResponse.json({ error: 'Identifiant de dossier invalide.' }, { status: 400 })
    }

    const { data, error } = await getServiceClient().rpc('fiscal_list_annual_inputs', {
      p_actor_id: access.session.sub,
      p_dossier_id: dossierId,
    })

    if (error) return annualRpcError(error)
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return annualServerError()
  }
}

export async function POST(
  request: Request,
  context: { params: { id: string } },
) {
  try {
    const access = await requireAdmin()
    if (!access.ok) return access.response

    const dossierId = context.params.id
    if (!UUID.test(dossierId)) {
      return NextResponse.json({ error: 'Identifiant de dossier invalide.' }, { status: 400 })
    }

    const body = await readAnnualBody(request)
    if (!body.ok) return body.response

    if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
      return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 })
    }

    const source = body.data as Record<string, unknown>
    const allowed = new Set(['fiscal_year', 'payload', 'submit'])
    if (Object.keys(source).some((key) => !allowed.has(key))) {
      return NextResponse.json({ error: 'Champ de requête non autorisé.' }, { status: 400 })
    }

    const year = source.fiscal_year
    if (typeof year !== 'number' || !Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: 'Exercice fiscal invalide.' }, { status: 400 })
    }
    if (typeof source.submit !== 'boolean') {
      return NextResponse.json({ error: 'Le mode de sauvegarde est invalide.' }, { status: 400 })
    }

    const validated = validateAnnualPayload(source.payload)
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 })
    }

    const { data, error } = await getServiceClient().rpc('fiscal_save_annual_input', {
      p_actor_id: access.session.sub,
      p_dossier_id: dossierId,
      p_fiscal_year: year,
      p_payload: validated.data,
      p_submit: source.submit,
    })

    if (error) return annualRpcError(error)
    return NextResponse.json(data, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return annualServerError()
  }
}
