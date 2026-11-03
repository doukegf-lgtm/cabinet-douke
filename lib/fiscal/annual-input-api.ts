import { NextResponse } from 'next/server'

export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const AMOUNT_FIELDS = [
  'ca_fiscal_ht',
  'charges_comptables',
  'charges_deductibles_justifiees',
  'reintegrations_fiscales',
  'deductions_fiscales',
  'acomptes_is_justifies',
  'credits_is_valides',
] as const

export type AnnualPayload = {
  source_mode: 'actual' | 'estimated'
  source_note: string | null
  ca_fiscal_ht: number | null
  charges_comptables: number | null
  charges_deductibles_justifiees: number | null
  reintegrations_fiscales: number | null
  deductions_fiscales: number | null
  acomptes_is_justifies: number | null
  credits_is_valides: number | null
}

export async function readAnnualBody(request: Request) {
  const max = 24 * 1024
  const length = request.headers.get('content-length')

  if (length && /^\d+$/.test(length) && Number(length) > max) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Requête trop volumineuse (24 Ko maximum).' },
        { status: 413 },
      ),
    }
  }

  try {
    const raw = await request.text()
    if (new TextEncoder().encode(raw).byteLength > max) {
      return {
        ok: false as const,
        response: NextResponse.json(
          { error: 'Requête trop volumineuse (24 Ko maximum).' },
          { status: 413 },
        ),
      }
    }
    return { ok: true as const, data: JSON.parse(raw) as unknown }
  } catch {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 }),
    }
  }
}

export function validateAnnualPayload(
  input: unknown,
): { ok: true; data: AnnualPayload } | { ok: false; error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Les données annuelles doivent être un objet JSON.' }
  }

  const source = input as Record<string, unknown>
  const allowed = new Set(['source_mode', 'source_note', ...AMOUNT_FIELDS])

  for (const key of Object.keys(source)) {
    if (!allowed.has(key)) {
      return { ok: false, error: `Champ non autorisé : ${key}` }
    }
  }

  if (source.source_mode !== 'actual' && source.source_mode !== 'estimated') {
    return { ok: false, error: 'Précisez si les données sont réelles ou estimées.' }
  }

  const note = source.source_note ?? null
  if (note !== null && typeof note !== 'string') {
    return { ok: false, error: 'La note de source doit être un texte.' }
  }
  if (typeof note === 'string' && note.length > 2000) {
    return { ok: false, error: 'La note est limitée à 2 000 caractères.' }
  }

  const data = {
    source_mode: source.source_mode,
    source_note: typeof note === 'string' && note.trim() ? note.trim() : null,
  } as AnnualPayload

  for (const field of AMOUNT_FIELDS) {
    const value = source[field]
    if (value === undefined || value === null || value === '') {
      data[field] = null
      continue
    }
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 999999999999999
    ) {
      return { ok: false, error: `Montant invalide pour ${field}.` }
    }
    data[field] = value
  }

  return { ok: true, data }
}

export function annualRpcError(error: { code?: string } | null) {
  switch (error?.code) {
    case 'P0002':
      return NextResponse.json({ error: 'Dossier ou fiche annuelle introuvable.' }, { status: 404 })
    case '42501':
      return NextResponse.json({ error: 'Accès administrateur requis.' }, { status: 403 })
    case '22023':
    case '22007':
    case '23514':
      return NextResponse.json({ error: 'Données invalides. Vérifiez l’exercice, les montants et les champs obligatoires.' }, { status: 400 })
    case '55000':
      return NextResponse.json({ error: 'Cette fiche ou ce dossier est verrouillé pour cette opération.' }, { status: 409 })
    default:
      return NextResponse.json({ error: 'Une erreur est survenue lors du traitement de la fiche annuelle.' }, { status: 500 })
  }
}

export function annualServerError() {
  return NextResponse.json({ error: 'Configuration serveur indisponible.' }, { status: 500 })
}
