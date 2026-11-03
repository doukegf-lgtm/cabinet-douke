import { NextResponse } from 'next/server'

const FIELDS = [
  'code', 'title', 'description', 'document_type', 'authority',
  'reference_number', 'publication_date', 'official_url',
  'article_reference', 'parameter_category', 'numeric_value',
  'text_value', 'unit', 'currency', 'obligation_category',
  'periodicity', 'due_rule', 'target_group', 'source_entry_id',
  'effective_from', 'effective_to', 'verification_status',
  'validation_note',
] as const

export async function readReferentialBody(request: Request) {
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

export function validateReferentialPayload(
  input: Record<string, unknown>,
  mode: 'create' | 'update',
): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  const keys = Object.keys(input)
  if (!keys.length) return { ok: false, error: 'Aucune modification fournie.' }

  for (const key of keys) {
    if (!FIELDS.includes(key as typeof FIELDS[number])) {
      return { ok: false, error: `Champ non autorisé : ${key}` }
    }
  }

  const data: Record<string, unknown> = {}
  for (const key of ['code', 'title']) {
    if (key in input || mode === 'create') {
      const value = input[key]
      if (typeof value !== 'string' || !value.trim() || value.trim().length > 180) {
        return { ok: false, error: `Le champ ${key} est obligatoire (180 caractères maximum).` }
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
    if (value !== null && typeof value !== 'string') return { ok: false, error: `Champ textuel invalide : ${key}` }
    if (typeof value === 'string' && value.length > 5000) return { ok: false, error: `Champ trop long : ${key}` }
    data[key] = typeof value === 'string' && value.trim() ? value.trim() : null
  }

  for (const key of ['publication_date', 'effective_from', 'effective_to']) {
    if (!(key in input)) continue
    const value = input[key]
    if (value !== null && (
      typeof value !== 'string'
      || !/^\d{4}-\d{2}-\d{2}$/.test(value)
      || Number.isNaN(Date.parse(`${value}T00:00:00Z`))
      || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
    )) return { ok: false, error: `Date invalide : ${key}` }
    data[key] = value
  }

  if ('official_url' in input) {
    const value = input.official_url
    if (value === null || value === '') data.official_url = null
    else {
      try {
        if (typeof value !== 'string' || value.length > 2000) throw new Error()
        const url = new URL(value)
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error()
        data.official_url = url.toString()
      } catch {
        return { ok: false, error: 'URL HTTP ou HTTPS invalide.' }
      }
    }
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
    if (value === null || value === '') data.source_entry_id = null
    else if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
      return { ok: false, error: 'Identifiant de texte source invalide.' }
    } else data.source_entry_id = value
  }

  if ('currency' in input) {
    if (input.currency !== null && input.currency !== 'XOF') return { ok: false, error: 'Seule la devise XOF est autorisée.' }
    data.currency = input.currency
  }

  if ('verification_status' in input) {
    const statuses = ['to_verify', 'in_review', 'validated', 'replaced', 'repealed']
    if (typeof input.verification_status !== 'string' || !statuses.includes(input.verification_status)) {
      return { ok: false, error: 'Statut de vérification invalide.' }
    }
    data.verification_status = input.verification_status
    if (input.verification_status !== 'validated') {
      data.validated_by = null
      data.validated_at = null
    }
  }

  if (
    data.effective_from && data.effective_to
    && String(data.effective_to) < String(data.effective_from)
  ) return { ok: false, error: 'La date de fin doit être postérieure ou égale à la date de début.' }

  return { ok: true, data }
}

export function referentialErrorResponse(error: { code?: string }) {
  if (error.code === '23505') return NextResponse.json({ error: 'Ce code existe déjà.' }, { status: 409 })
  if (error.code === '23514') return NextResponse.json({ error: 'Les données ne respectent pas les règles de validation.' }, { status: 400 })
  if (error.code === '23503') return NextResponse.json({ error: 'Le texte juridique source est introuvable.' }, { status: 400 })
  return NextResponse.json({ error: 'Une erreur est survenue dans le référentiel.' }, { status: 500 })
}
