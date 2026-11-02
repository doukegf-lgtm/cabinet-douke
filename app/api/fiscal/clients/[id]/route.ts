import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/platform/auth'
import { getServiceClient } from '@/lib/platform/supabase-server'
import {
  readJsonBody,
  rpcErrorResponse,
  serverErrorResponse,
  validateClientPayload,
} from '@/lib/fiscal/client-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(
  request: Request,
  context: { params: { id: string } },
) {
  try {
    const access = await requireAdmin()
    if (!access.ok) return access.response

    const clientId = context.params.id

    if (!UUID_PATTERN.test(clientId)) {
      return NextResponse.json(
        { error: 'Identifiant client invalide.' },
        { status: 400 },
      )
    }

    const body = await readJsonBody(request)
    if (!body.ok) return body.response

    const validated = validateClientPayload(body.data, 'update')
    if (!validated.ok) {
      return NextResponse.json(
        { error: validated.error },
        { status: 400 },
      )
    }

    const db = getServiceClient()
    const { data, error } = await db.rpc('fiscal_update_client', {
      p_actor_id: access.session.sub,
      p_client_id: clientId,
      p_patch: validated.data,
    })

    if (error) return rpcErrorResponse(error)

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch {
    return serverErrorResponse()
  }
}
