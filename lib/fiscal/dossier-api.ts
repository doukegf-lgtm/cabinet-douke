import { NextResponse } from 'next/server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TYPES = [
  'regularisation_fiscale',
  'regularisation_sociale',
  'suivi_fiscal',
  'suivi_social',
] as const
const STATUSES = ['draft', 'pending_review', 'blocked_unvalidated_rule'] as const

export type DossierPayload = {
  client_id?: string
  dossier_type?: string
  period_start?: string
  period_end?: string
  notes?: string | null
  status?: string
}

export async function readDossierBody(request: Request) {
  const max = 16 * 1024
  const length = request.headers.get('content-length')
  if (length && /^\d+$/.test(length) && Number(length) > max) {
    return { ok: false as const, response: NextResponse.json({ error: 'Requête trop volumineuse (16 Ko maximum).' }, { status: 413 }) }
  }
  if (!request.body) {
    return { ok: false as const, response: NextResponse.json({ error: 'Corps JSON manquant.' }, { status: 400 }) }
  }
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > max) {
        await reader.cancel().catch(() => undefined)
        return { ok: false as const, response: NextResponse.json({ error: 'Requête trop volumineuse (16 Ko maximum).' }, { status: 413 }) }
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.length
    }
    const raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return { ok: true as const, data: JSON.parse(raw) as unknown }
  } catch {
    return { ok: false as const, response: NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 }) }
  }
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function validateDossierPayload(
  input: unknown,
  mode: 'create' | 'update',
): { ok: true; data: DossierPayload } | { ok: false; error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Les données du dossier doivent être un objet JSON.' }
  }

  const source = input as Record<string, unknown>
  const allowed = new Set(['client_id', 'dossier_type', 'period_start', 'period_end', 'notes', 'status'])
  const keys = Object.keys(source)
  if (!keys.length) return { ok: false, error: 'Aucune donnée fournie.' }

  for (const key of keys) {
    if (!allowed.has(key)) return { ok: false, error: `Champ non autorisé : ${key}` }
  }

  const data: DossierPayload = {}

  if ('client_id' in source) {
    if (typeof source.client_id !== 'string' || !UUID.test(source.client_id)) {
      return { ok: false, error: 'Client sélectionné invalide.' }
    }
    data.client_id = source.client_id
  }
  if ('dossier_type' in source) {
    if (typeof source.dossier_type !== 'string' || !TYPES.includes(source.dossier_type as typeof TYPES[number])) {
      return { ok: false, error: 'Type de dossier invalide.' }
    }
    data.dossier_type = source.dossier_type
  }
  for (const key of ['period_start', 'period_end'] as const) {
    if (key in source) {
      if (!validDate(source[key])) return { ok: false, error: `Date invalide pour ${key}.` }
      data[key] = source[key] as string
    }
  }
  if ('notes' in source) {
    if (source.notes !== null && typeof source.notes !== 'string') {
      return { ok: false, error: 'Les notes doivent être un texte.' }
    }
    if (typeof source.notes === 'string' && source.notes.length > 5000) {
      return { ok: false, error: 'Les notes sont limitées à 5 000 caractères.' }
    }
    data.notes = typeof source.notes === 'string' && source.notes.trim() ? source.notes.trim() : null
  }
  if ('status' in source) {
    if (typeof source.status !== 'string' || !STATUSES.includes(source.status as typeof STATUSES[number])) {
      return { ok: false, error: 'Statut non autorisé. La validation et la clôture nécessitent une procédure dédiée.' }
    }
    data.status = source.status
  }

  if (mode === 'create') {
    for (const key of ['client_id', 'dossier_type', 'period_start', 'period_end'] as const) {
      if (!data[key]) return { ok: false, error: `Le champ ${key} est obligatoire.` }
    }
  } else if (!keys.length) {
    return { ok: false, error: 'Aucune modification fournie.' }
  }

  if (data.period_start && data.period_end && data.period_end < data.period_start) {
    return { ok: false, error: 'La date de fin doit être postérieure ou égale à la date de début.' }
  }

  return { ok: true, data }
}

export function dossierRpcError(error: { code?: string } | null) {
  switch (error?.code) {
    case 'P0002':
      return NextResponse.json({ error: 'Dossier ou client introuvable.' }, { status: 404 })
    case '42501':
      return NextResponse.json({ error: 'Accès administrateur requis.' }, { status: 403 })
    case '22023':
    case '22007':
    case '23514':
      return NextResponse.json({ error: 'Données du dossier invalides. Vérifiez le client, le type et les périodes.' }, { status: 400 })
    case '55000':
      return NextResponse.json({ error: 'Ce dossier est verrouillé et ne peut plus être modifié par cette opération.' }, { status: 409 })
    default:
      return NextResponse.json({ error: 'Une erreur est survenue lors du traitement du dossier.' }, { status: 500 })
  }
}

export function dossierServerError() {
  return NextResponse.json({ error: 'Configuration serveur indisponible.' }, { status: 500 })
}
