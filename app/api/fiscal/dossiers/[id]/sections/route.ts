import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/platform/auth'
import { getServiceClient } from '@/lib/platform/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const SECTIONS = new Set([
  'its_vps',
  'vat',
  'aib',
  'withholding',
  'cnss_periods',
  'tax_operations',
  'social_operations',
  'payments',
  'official_notices',
  'payment_plan',
  'supporting_documents',
  'tax_profile',
])

function jsonError(message: string, status = 400) {
  return NextResponse.json(
    { error: message },
    { status, headers: { 'Cache-Control': 'no-store' } },
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function validateJsonTree(value: unknown, depth = 0, counter = { nodes: 0 }): boolean {
  counter.nodes += 1

  if (counter.nodes > 20000 || depth > 12) return false

  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return typeof value !== 'string' || value.length <= 20000
  }

  if (typeof value === 'number') {
    // Les nombres JSON décimaux sont interdits dans les saisies.
    // Les montants doivent être transmis sous forme de chaînes exactes.
    // Les nombres entiers restent autorisés pour les quantités et indices.
    return Number.isSafeInteger(value)
  }

  if (Array.isArray(value)) {
    return value.length <= 6000 &&
      value.every((item) => validateJsonTree(item, depth + 1, counter))
  }

  if (isRecord(value)) {
    const entries = Object.entries(value)
    if (entries.length > 500) return false

    return entries.every(([key, item]) =>
      key.length <= 150 &&
      validateJsonTree(item, depth + 1, counter),
    )
  }

  return false
}

function validateSectionPayload(value: unknown):
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string } {
  if (!isRecord(value)) {
    return { ok: false, error: 'La fiche doit être un objet JSON.' }
  }

  const allowed = new Set([
    'source_mode',
    'source_note',
    'data',
    'provenance',
  ])

  if (Object.keys(value).some((key) => !allowed.has(key))) {
    return { ok: false, error: 'La fiche contient une propriété non autorisée.' }
  }

  if (!['actual', 'estimated', 'mixed'].includes(String(value.source_mode))) {
    return { ok: false, error: 'La nature des données est invalide.' }
  }

  if (!isRecord(value.data) && !Array.isArray(value.data)) {
    return { ok: false, error: 'La propriété data doit être un objet ou un tableau.' }
  }

  if (
    value.source_note !== undefined &&
    value.source_note !== null &&
    (typeof value.source_note !== 'string' || value.source_note.length > 2000)
  ) {
    return { ok: false, error: 'La note de provenance est invalide.' }
  }

  if (
    value.provenance !== undefined &&
    !isRecord(value.provenance)
  ) {
    return { ok: false, error: 'La provenance doit être un objet JSON.' }
  }

  if (!validateJsonTree(value)) {
    return { ok: false, error: 'La fiche est trop volumineuse ou trop complexe.' }
  }

  return { ok: true, data: value }
}

function rpcError(error: { message?: string; code?: string }) {
  const message = error.message || ''

  if (error.code === 'P0002') return jsonError('Dossier introuvable.', 404)
  if (error.code === '55000') return jsonError(message || 'Opération non autorisée dans cet état.', 409)
  if (error.code === '22023') return jsonError(message || 'Données invalides.', 400)

  console.error('[fiscal sections RPC]', error.code, message)
  return jsonError('Impossible de traiter la section fiscale pour le moment.', 500)
}

export async function GET(
  request: Request,
  context: { params: { id: string } },
) {
  try {
    const access = await requireAdmin()
    if (!access.ok) return access.response

    const dossierId = context.params.id
    if (!UUID.test(dossierId)) return jsonError('Identifiant de dossier invalide.')

    const url = new URL(request.url)
    const historyValue = url.searchParams.get('history')

    if (historyValue !== null && historyValue !== '0' && historyValue !== '1') {
      return jsonError('Paramètre history invalide.')
    }

    const { data, error } = await getServiceClient().rpc(
      'fiscal_list_section_inputs',
      {
        p_actor_id: access.session.sub,
        p_dossier_id: dossierId,
        p_include_history: historyValue === '1',
      },
    )

    if (error) return rpcError(error)

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('[fiscal sections GET]', error)
    return jsonError('Erreur serveur lors de la lecture des sections.', 500)
  }
}

export async function POST(
  request: Request,
  context: { params: { id: string } },
) {
  try {
    const access = await requireAdmin()
    if (!access.ok) return access.response

    const dossierId = context.params.id
    if (!UUID.test(dossierId)) return jsonError('Identifiant de dossier invalide.')

    const contentLength = Number(request.headers.get('content-length') || 0)
    if (contentLength > 220000) {
      return jsonError('La requête dépasse la taille maximale autorisée.', 413)
    }

    const rawBody = await request.text()

    if (Buffer.byteLength(rawBody, 'utf8') > 220000) {
      return jsonError('La requête dépasse la taille maximale autorisée.', 413)
    }

    let body: unknown
    try {
      body = JSON.parse(rawBody)
    } catch {
      return jsonError('Le corps de la requête doit être un JSON valide.')
    }

    if (!isRecord(body)) return jsonError('Corps de requête invalide.')

    const allowed = new Set([
      'section_code',
      'fiscal_year',
      'payload',
      'submit',
    ])

    if (Object.keys(body).some((key) => !allowed.has(key))) {
      return jsonError('La requête contient un champ non autorisé.')
    }

    if (
      typeof body.section_code !== 'string' ||
      !SECTIONS.has(body.section_code)
    ) {
      return jsonError('Code de section non autorisé.')
    }

    if (
      typeof body.fiscal_year !== 'number' ||
      !Number.isInteger(body.fiscal_year) ||
      body.fiscal_year < 2000 ||
      body.fiscal_year > 2100
    ) {
      return jsonError('Exercice fiscal invalide.')
    }

    if (typeof body.submit !== 'boolean') {
      return jsonError('Le mode de sauvegarde est invalide.')
    }

    const validated = validateSectionPayload(body.payload)
    if (!validated.ok) return jsonError(validated.error)

    const { data, error } = await getServiceClient().rpc(
      'fiscal_save_section_input',
      {
        p_actor_id: access.session.sub,
        p_dossier_id: dossierId,
        p_section_code: body.section_code,
        p_fiscal_year: body.fiscal_year,
        p_payload: validated.data,
        p_submit: body.submit,
      },
    )

    if (error) return rpcError(error)

    return NextResponse.json(data, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('[fiscal sections POST]', error)
    return jsonError('Erreur serveur lors de la sauvegarde de la section.', 500)
  }
}
