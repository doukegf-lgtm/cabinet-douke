import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/platform/auth'
import { getServiceClient } from '@/lib/platform/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TYPES = ['legal_source', 'parameter', 'obligation'] as const
const STATUSES = ['to_verify', 'in_review', 'validated', 'replaced', 'repealed'] as const

const FIELDS = [
  'entry_type', 'code', 'title', 'description',
  'document_type', 'authority', 'reference_number',
  'publication_date', 'official_url', 'article_reference',
  'parameter_category', 'numeric_value', 'text_value',
  'unit', 'currency', 'obligation_category',
  'periodicity', 'due_rule', 'target_group',
  'source_entry_id', 'effective_from', 'effective_to',
  'verification_status', 'validation_note',
] as const

type EntryField = typeof FIELDS[number]

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const length = request.headers.get('content-length')
    if (length && Number(length) > 20000) return null
    const body = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null
    return body as Record<string, unknown>
  } catch {
    return null
  }
}

function validatePayload(
  input: Record<string, unknown>,
  mode: 'create' | 'update',
): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  const keys = Object.keys(input)
  if (!keys.length) return { ok: false, error: 'Aucune donnée fournie.' }

  for (const key of keys) {
    if (!FIELDS.includes(key as EntryField)) {
      return { ok: false, error: `Champ non autorisé : ${key}` }
    }
  }

  if (mode === 'create' && !TYPES.includes(input.entry_type as typeof TYPES[number])) {
    return { ok: false, error: 'Type de fiche invalide.' }
  }

  const data: Record<string, unknown> = {}
  const requiredText = ['code', 'title'] as const

  for (const key of requiredText) {
    if (key in input || mode === 'create') {
      const value = input[key]
      if (typeof value !== 'string' || !value.trim() || value.trim().length > 180) {
        return { ok: false, error: `Le champ ${key} est obligatoire et limité à 180 caractères.` }
      }
      data[key] = value.trim()
    }
  }

  const textFields = [
    'description', 'document_type', 'authority', 'reference_number',
    'article_reference', 'parameter_category', 'text_value', 'unit',
    'obligation_category', 'periodicity', 'due_rule', 'target_group',
    'validation_note',
  ]
  for (const key of textFields) {
    if (!(key in input)) continue
    const value = input[key]
    if (value !== null && typeof value !== 'string') {
      return { ok: false, error: `Valeur textuelle invalide pour ${key}.` }
    }
    if (typeof value === 'string' && value.length > 5000) {
      return { ok: false, error: `Le champ ${key} est trop long.` }
    }
    data[key] = typeof value === 'string' && value.trim() ? value.trim() : null
  }

  const dates = ['publication_date', 'effective_from', 'effective_to']
  for (const key of dates) {
    if (!(key in input)) continue
    const value = input[key]
    if (value !== null && (
      typeof value !== 'string'
      || !/^\d{4}-\d{2}-\d{2}$/.test(value)
      || Number.isNaN(Date.parse(`${value}T00:00:00Z`))
      || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
    )) {
      return { ok: false, error: `Date invalide pour ${key}.` }
    }
    data[key] = value
  }

  if ('official_url' in input) {
    const value = input.official_url
    if (value !== null && value !== '') {
      if (typeof value !== 'string' || value.length > 2000) {
        return { ok: false, error: 'URL invalide.' }
      }
      try {
        const url = new URL(value)
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error()
        data.official_url = url.toString()
      } catch {
        return { ok: false, error: 'L’URL doit être une adresse HTTP ou HTTPS valide.' }
      }
    } else data.official_url = null
  }

  if ('numeric_value' in input) {
    const value = input.numeric_value
    if (value === null || value === '') data.numeric_value = null
    else if (
      (typeof value !== 'number' && typeof value !== 'string')
      || !/^-?\d+(\.\d{1,8})?$/.test(String(value))
      || !Number.isFinite(Number(value))
    ) return { ok: false, error: 'Valeur numérique invalide.' }
    else data.numeric_value = String(value)
  }

  if ('source_entry_id' in input) {
    const value = input.source_entry_id
    if (value !== null && value !== '') {
      if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
        return { ok: false, error: 'Référence de texte source invalide.' }
      }
      data.source_entry_id = value
    } else data.source_entry_id = null
  }

  if ('currency' in input) {
    if (input.currency !== null && input.currency !== 'XOF') {
      return { ok: false, error: 'La devise autorisée est le XOF.' }
    }
    data.currency = input.currency
  }

  if ('verification_status' in input) {
    if (!STATUSES.includes(input.verification_status as typeof STATUSES[number])) {
      return { ok: false, error: 'Statut de vérification invalide.' }
    }
    data.verification_status = input.verification_status
    if (input.verification_status !== 'validated') {
      data.validated_by = null
      data.validated_at = null
    }
  }

  if ('entry_type' in input && mode === 'update') {
    return { ok: false, error: 'Le type d’une fiche ne peut pas être modifié.' }
  }

  if (
    data.effective_from && data.effective_to
    && String(data.effective_to) < String(data.effective_from)
  ) {
    return { ok: false, error: 'La date de fin doit être postérieure ou égale à la date de début.' }
  }

  return { ok: true, data }
}

export async function GET(request: Request) {
  try {
    const access = await requireAdmin()
    if (!access.ok) return access.response

    const params = new URL(request.url).searchParams
    const type = params.get('type')
    const search = (params.get('search') ?? '').trim()

    if (type && !TYPES.includes(type as typeof TYPES[number])) {
      return NextResponse.json({ error: 'Type de fiche invalide.' }, { status: 400 })
    }
    if (search.length > 100) {
      return NextResponse.json({ error: 'Recherche limitée à 100 caractères.' }, { status: 400 })
    }

    let query = getServiceClient()
      .from('fiscal_regulatory_entries')
      .select('*')
      .order('entry_type')
      .order('code')
      .limit(500)

    if (type) query = query.eq('entry_type', type)
    if (search) query = query.or(`code.ilike.%${search}%,title.ilike.%${search}%`)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ data: data ?? [] }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch {
    return NextResponse.json({ error: 'Impossible de charger le référentiel.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireAdmin()
    if (!access.ok) return access.response

    const body = await readBody(request)
    if (!body) return NextResponse.json({ error: 'Corps JSON invalide ou trop volumineux.' }, { status: 400 })

    const validated = validatePayload(body, 'create')
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })

    if (validated.data.verification_status === 'validated') {
      return NextResponse.json(
        { error: 'Une nouvelle fiche doit d’abord être créée « À vérifier ». La validation se fait après contrôle des justificatifs.' },
        { status: 400 },
      )
    }

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

    const payload = {
      ...validated.data,
      verification_status: 'to_verify',
      created_by: access.session.sub,
      updated_by: access.session.sub,
    }

    const { data, error } = await getServiceClient()
      .from('fiscal_regulatory_entries')
      .insert(payload)
      .select('*')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Ce code existe déjà.' }, { status: 409 })
      }
      if (error.code === '23514') {
        return NextResponse.json({ error: 'Les informations fournies ne respectent pas les règles de validation.' }, { status: 400 })
      }
      throw error
    }

    return NextResponse.json({ data }, {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch {
    return NextResponse.json({ error: 'Impossible de créer cette fiche.' }, { status: 500 })
  }
}
