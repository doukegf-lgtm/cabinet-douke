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

function parseInteger(value: string | null, fallback: number): number | null {
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
    const page = parseInteger(params.get('page'), 1)
    const pageSize = parseInteger(params.get('pageSize'), 20)
    const search = (params.get('search') ?? '').trim()

    if (page === null || page < 1 || page > 100000) {
      return NextResponse.json(
        { error: 'Numéro de page invalide.' },
        { status: 400 },
      )
    }

    if (pageSize === null || pageSize < 1 || pageSize > 100) {
      return NextResponse.json(
        { error: 'Taille de page invalide (1 à 100).' },
        { status: 400 },
      )
    }

    if (search.length > 100) {
      return NextResponse.json(
        { error: 'Recherche limitée à 100 caractères.' },
        { status: 400 },
      )
    }

    const db = getServiceClient()
    const { data, error } = await db.rpc('fiscal_list_clients', {
      p_actor_id: access.session.sub,
      p_search: search || null,
      p_page: page,
      p_page_size: pageSize,
    })

    if (error) return rpcErrorResponse(error)

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch {
    return serverErrorResponse()
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireAdmin()
    if (!access.ok) return access.response

    const body = await readJsonBody(request)
    if (!body.ok) return body.response

    const validated = validateClientPayload(body.data, 'create')
    if (!validated.ok) {
      return NextResponse.json(
        { error: validated.error },
        { status: 400 },
      )
    }

    const db = getServiceClient()
    const { data, error } = await db.rpc('fiscal_create_client', {
      p_actor_id: access.session.sub,
      p_payload: validated.data,
    })

    if (error) return rpcErrorResponse(error)

    return NextResponse.json(data, {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch {
    return serverErrorResponse()
  }
}
