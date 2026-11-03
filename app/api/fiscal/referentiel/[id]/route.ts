import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/platform/auth'
import { getServiceClient } from '@/lib/platform/supabase-server'
import { readReferentialBody, validateReferentialPayload } from '@/lib/fiscal/referential-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function PATCH(request: Request, context: { params: { id: string } }) {
  try {
    const access = await requireAdmin()
    if (!access.ok) return access.response

    const id = context.params.id
    if (!UUID.test(id)) return NextResponse.json({ error: 'Identifiant invalide.' }, { status: 400 })

    const body = await readReferentialBody(request)
    if (!body) return NextResponse.json({ error: 'Corps JSON invalide ou trop volumineux.' }, { status: 400 })

    const validated = validateReferentialPayload(body, 'update')
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })

    if (validated.data.source_entry_id) {
      const { data: source } = await getServiceClient()
        .from('fiscal_regulatory_entries')
        .select('id, entry_type')
        .eq('id', validated.data.source_entry_id)
        .maybeSingle()

      if (!source || source.entry_type !== 'legal_source') {
        return NextResponse.json(
          { error: 'La source sélectionnée doit être un texte officiel existant.' },
          { status: 400 },
        )
      }
    }

    const payload: Record<string, unknown> = {
      ...validated.data,
      updated_by: access.session.sub,
    }

    if (payload.verification_status === 'validated') {
      payload.validated_by = access.session.sub
      payload.validated_at = new Date().toISOString()
    }

    const { data, error } = await getServiceClient()
      .from('fiscal_regulatory_entries')
      .update(payload)
      .eq('id', id)
      .select('*')
      .maybeSingle()

    if (error) {
      if (error.code === '23514') {
        return NextResponse.json({ error: 'Validation impossible : vérifiez la source officielle, l’article et les dates d’application.' }, { status: 400 })
      }
      throw error
    }
    if (!data) return NextResponse.json({ error: 'Fiche introuvable.' }, { status: 404 })

    return NextResponse.json({ data }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch {
    return NextResponse.json({ error: 'Impossible de modifier cette fiche.' }, { status: 500 })
  }
}
