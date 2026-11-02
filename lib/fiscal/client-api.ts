import { NextResponse } from 'next/server'

export type ClientPayload = Record<string, string | null>
type ValidationResult =
  | { ok: true; data: ClientPayload }
  | { ok: false; error: string }

const FIELD_LIMITS: Record<string, number> = {
  legal_name: 200,
  ifu: 50,
  rccm: 100,
  phone: 40,
  email: 254,
  address: 500,
}

const ALLOWED_FIELDS = new Set([
  'legal_name',
  'ifu',
  'rccm',
  'phone',
  'email',
  'address',
  'status',
])

export async function readJsonBody(
  request: Request,
): Promise<
  | { ok: true; data: unknown }
  | { ok: false; response: NextResponse }
> {
  const MAX_BODY_SIZE = 16 * 1024

  const contentLength = request.headers.get('content-length')

  if (
    contentLength !== null &&
    /^\d+$/.test(contentLength) &&
    Number(contentLength) > MAX_BODY_SIZE
  ) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Corps de requête trop volumineux (16 Ko maximum)' },
        { status: 413 },
      ),
    }
  }

  if (!request.body) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Corps JSON invalide' },
        { status: 400 },
      ),
    }
  }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let totalSize = 0

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (done) break

      totalSize += value.byteLength

      if (totalSize > MAX_BODY_SIZE) {
        try {
          await reader.cancel()
        } catch {
          // Requête déjà rejetée.
        }

        return {
          ok: false,
          response: NextResponse.json(
            { error: 'Corps de requête trop volumineux (16 Ko maximum)' },
            { status: 413 },
          ),
        }
      }

      chunks.push(value)
    }

    const bytes = new Uint8Array(totalSize)
    let offset = 0

    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }

    const raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes)

    return { ok: true, data: JSON.parse(raw) }
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Corps JSON invalide' },
        { status: 400 },
      ),
    }
  }
}

export function validateClientPayload(
  input: unknown,
  mode: 'create' | 'update',
): ValidationResult {
  if (
    input === null ||
    typeof input !== 'object' ||
    Array.isArray(input)
  ) {
    return { ok: false, error: 'Les données client doivent être un objet JSON' }
  }

  const entries = Object.entries(input as Record<string, unknown>)

  if (entries.length === 0) {
    return { ok: false, error: 'Aucune donnée client fournie' }
  }

  const data: ClientPayload = {}

  for (const [key, rawValue] of entries) {
    if (!ALLOWED_FIELDS.has(key)) {
      return { ok: false, error: `Champ non autorisé : ${key}` }
    }

    if (key === 'status') {
      if (
        typeof rawValue !== 'string' ||
        !['active', 'archived'].includes(rawValue.trim())
      ) {
        return { ok: false, error: 'Statut invalide : active ou archived attendu' }
      }

      data.status = rawValue.trim()
      continue
    }

    if (rawValue === null) {
      if (key === 'legal_name') {
        return { ok: false, error: 'La raison sociale est obligatoire' }
      }
      data[key] = null
      continue
    }

    if (typeof rawValue !== 'string') {
      return { ok: false, error: `Le champ ${key} doit être une chaîne de caractères` }
    }

    const value = rawValue.trim()

    if (key === 'legal_name' && value.length === 0) {
      return { ok: false, error: 'La raison sociale est obligatoire' }
    }

    if (value.length > FIELD_LIMITS[key]) {
      return {
        ok: false,
        error: `Le champ ${key} dépasse ${FIELD_LIMITS[key]} caractères`,
      }
    }

    if (key === 'email' && value !== '' &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return { ok: false, error: 'Adresse e-mail invalide' }
    }

    data[key] = value === '' ? null : value
  }

  if (mode === 'create' && !Object.prototype.hasOwnProperty.call(data, 'legal_name')) {
    return { ok: false, error: 'La raison sociale est obligatoire' }
  }

  if (mode === 'update' && entries.length === 0) {
    return { ok: false, error: 'Aucune modification fournie' }
  }

  return { ok: true, data }
}

export function rpcErrorResponse(error: { code?: string } | null) {
  switch (error?.code) {
    case '23505':
      return NextResponse.json(
        { error: 'Un client utilisant cet IFU existe déjà.' },
        { status: 409 },
      )
    case 'P0002':
      return NextResponse.json(
        { error: 'Client introuvable.' },
        { status: 404 },
      )
    case '42501':
      return NextResponse.json(
        { error: 'Accès administrateur requis.' },
        { status: 403 },
      )
    case '22023':
      return NextResponse.json(
        { error: 'Données client invalides.' },
        { status: 400 },
      )
    default:
      return NextResponse.json(
        { error: 'Une erreur est survenue lors du traitement de la demande.' },
        { status: 500 },
      )
  }
}

export function serverErrorResponse() {
  return NextResponse.json(
    { error: 'Configuration serveur indisponible.' },
    { status: 500 },
  )
}
