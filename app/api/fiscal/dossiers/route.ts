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

function integer(value: string | null, fallback: number) {
  if (value === null) return fallback
  if (!/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export async function GET(request: Request) {
  try {
    const access = await requireAdmin()
    if (!access.ok) return access.response

    const params = new URL(request.url).searchParams
    const page = integer(params.get('page'), 1)
    const pageSize = integer(params.get('pageSize'), 20)
    const search = (params.get('search') ?? '').trim()
    const status = params.get('status') || null

    if (page === null || page < 1 || page > 100000 ||
        pageSize === null || pageSize < 1 || pageSize > 100 ||
        search.length > 100) {
      return NextResponse.json({ error: 'Paramètres de recherche ou pagination invalides.' }, { status: 400 })
    }

    const { data, error } = await getServiceClient().rpc('fiscal_list_dossiers', {
      p_actor_id: access.session.sub,
      p_search: search || null,
      p_status: status,
      p_page: page,
      p_page_size: pageSize,
    })
    if (error) return dossierRpcError(error)
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return dossierServerError()
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireAdmin()
    if (!access.ok) return access.response

    const body = await readDossierBody(request)
    if (!body.ok) return body.response
    const validated = validateDossierPayload(body.data, 'create')
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })

    const { data, error } = await getServiceClient().rpc('fiscal_create_dossier', {
      p_actor_id: access.session.sub,
      p_payload: validated.data,
    })
    if (error) return dossierRpcError(error)
    return NextResponse.json(data, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return dossierServerError()
  }
}
