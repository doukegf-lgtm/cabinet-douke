import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/platform/auth'
import { getServiceClient } from '@/lib/platform/supabase-server'
import {
  annualRpcError,
  annualServerError,
  readAnnualBody,
  UUID,
} from '@/lib/fiscal/annual-input-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(
  request: Request,
  context: { params: { id: string; inputId: string } },
) {
  try {
    const access = await requireAdmin()
    if (!access.ok) return access.response

    if (!UUID.test(context.params.id) || !UUID.test(context.params.inputId)) {
      return NextResponse.json({ error: 'Identifiant invalide.' }, { status: 400 })
    }

    const body = await readAnnualBody(request)
    if (!body.ok) return body.response

    if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
      return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 })
    }

    const source = body.data as Record<string, unknown>
    if (Object.keys(source).some((key) => !['status', 'note'].includes(key))) {
      return NextResponse.json({ error: 'Champ de requête non autorisé.' }, { status: 400 })
    }

    if (source.status !== 'validated' && source.status !== 'needs_changes') {
      return NextResponse.json({ error: 'Transition de statut non autorisée.' }, { status: 400 })
    }

    if (source.note !== undefined && source.note !== null && typeof source.note !== 'string') {
      return NextResponse.json({ error: 'Le motif doit être un texte.' }, { status: 400 })
    }
    const note = typeof source.note === 'string' ? source.note.trim() : null
    if (note && note.length > 2000) {
      return NextResponse.json({ error: 'Le motif est limité à 2 000 caractères.' }, { status: 400 })
    }
    if (source.status === 'needs_changes' && !note) {
      return NextResponse.json({ error: 'Un motif est obligatoire pour demander une correction.' }, { status: 400 })
    }

    const { data, error } = await getServiceClient().rpc('fiscal_transition_annual_input', {
      p_actor_id: access.session.sub,
      p_input_id: context.params.inputId,
      p_new_status: source.status,
      p_note: note,
    })

    if (error) return annualRpcError(error)
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return annualServerError()
  }
}
