import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/platform/auth'
import { getServiceClient } from '@/lib/platform/supabase-server'
import {
  dossierRpcError,
  dossierServerError,
  readDossierBody,
  validateDossierPayload,
} from '@/lib/fiscal/dossier-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function PATCH(
  request: Request,
  context: { params: { id: string } },
) {
  try {
    const access = await requireAdmin()
    if (!access.ok) return access.response

    const id = context.params.id
    if (!UUID.test(id)) {
      return NextResponse.json({ error: 'Identifiant de dossier invalide.' }, { status: 400 })
    }

    const body = await readDossierBody(request)
    if (!body.ok) return body.response
    const validated = validateDossierPayload(body.data, 'update')
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })

    const { data, error } = await getServiceClient().rpc('fiscal_update_dossier', {
      p_actor_id: access.session.sub,
      p_dossier_id: id,
      p_patch: validated.data,
    })
    if (error) return dossierRpcError(error)
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return dossierServerError()
  }
}
