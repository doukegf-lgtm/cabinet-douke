import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/platform/auth'
import { getServiceClient } from '@/lib/platform/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/

const allowedActions = [
  'client.created',
  'client.updated',
  'dossier.created',
  'dossier.updated',
  'document.uploaded',
  'document.archived',
]

const allowedEntities = [
  'fiscal_client',
  'fiscal_dossier',
  'fiscal_document',
]

function responseError(message: string, status = 400) {
  return NextResponse.json(
    { error: message },
    { status, headers: { 'Cache-Control': 'no-store' } },
  )
}

function validDate(value: string) {
  if (!DATE.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
}

// Ne jamais exposer directement le JSON de métadonnées.
function safeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  const source = value as Record<string, unknown>
  const result: Record<string, unknown> = {}

  const allowedKeys = [
    'fields',
    'changed_fields',
    'client_id',
    'dossier_id',
    'dossier_type',
    'period_start',
    'period_end',
    'mime_type',
    'size_bytes',
    'storage_retained',
  ]

  for (const key of allowedKeys) {
    const item = source[key]
    if (
      item === null ||
      typeof item === 'string' ||
      typeof item === 'number' ||
      typeof item === 'boolean' ||
      (Array.isArray(item) && item.every(v => typeof v === 'string'))
    ) {
      result[key] = item
    }
  }

  return result
}

export async function GET(request: Request) {
  try {
    const access = await requireAdmin()
    if (!access.ok) return access.response

    const params = new URL(request.url).searchParams

    const pageRaw = Number(params.get('page') ?? 1)
    const sizeRaw = Number(params.get('pageSize') ?? 25)

    const page = Number.isSafeInteger(pageRaw) ? Math.min(Math.max(1, pageRaw), 1000000) : 1
    const pageSize = Number.isSafeInteger(sizeRaw)
      ? Math.min(Math.max(sizeRaw, 1), 100)
      : 25

    const action = (params.get('action') ?? '').trim()
    const entityType = (params.get('entity_type') ?? '').trim()
    const actorId = (params.get('actor_id') ?? '').trim()
    const entityId = (params.get('entity_id') ?? '').trim()
    const from = (params.get('from') ?? '').trim()
    const to = (params.get('to') ?? '').trim()

    if (action && !allowedActions.includes(action)) {
      return responseError('Filtre d’action invalide.')
    }
    if (entityType && !allowedEntities.includes(entityType)) {
      return responseError('Type d’entité invalide.')
    }
    if (actorId && !UUID.test(actorId)) {
      return responseError('Identifiant acteur invalide.')
    }
    if (entityId && !UUID.test(entityId)) {
      return responseError('Identifiant entité invalide.')
    }
    if (from && !validDate(from)) {
      return responseError('Date de début invalide.')
    }
    if (to && !validDate(to)) {
      return responseError('Date de fin invalide.')
    }
    if (from && to && from > to) {
      return responseError('La date de début doit précéder la date de fin.')
    }

    const client = getServiceClient()
    const start = (page - 1) * pageSize
    const end = start + pageSize - 1

    let query = client
      .from('fiscal_audit_events')
      .select(
        'id, actor_id, action, entity_type, entity_id, metadata, created_at',
        { count: 'exact' },
      )
      .order('id', { ascending: false })
      .range(start, end)

    if (action) query = query.eq('action', action)
    if (entityType) query = query.eq('entity_type', entityType)
    if (actorId) query = query.eq('actor_id', actorId)
    if (entityId) query = query.eq('entity_id', entityId)

    if (from) {
      query = query.gte('created_at', `${from}T00:00:00+01:00`)
    }
    if (to) {
      const nextDay = new Date(`${to}T00:00:00+01:00`)
      nextDay.setUTCDate(nextDay.getUTCDate() + 1)
      query = query.lt('created_at', nextDay.toISOString())
    }

    const { data, error, count } = await query

    if (error) {
      console.error('fiscal audit read error:', error.message)
      return responseError('Lecture du journal impossible.', 500)
    }

    const events = (data ?? []).map(event => ({
      ...event,
      metadata: safeMetadata(event.metadata),
    }))

    return NextResponse.json(
      {
        data: events,
        pagination: {
          page,
          pageSize,
          total: count ?? 0,
          totalPages: Math.ceil((count ?? 0) / pageSize),
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return responseError('Erreur serveur lors de la lecture du journal.', 500)
  }
}
