import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/platform/auth'
import { getServiceClient } from '@/lib/platform/supabase-server'
import { computeItsVps, ItsVpsBlockedError } from '@/lib/fiscal/engine/its-vps'
import { resolveValidatedItsRules } from '@/lib/fiscal/engine/its-rules'
import { parseItsVpsSection } from '@/lib/fiscal/its-input'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ENGINE_VERSION = 'its-vps-1.0.0'
const WORKBOOK_VERSION = 'V8-reference-regles-du-referentiel'
const NO_STORE = { 'Cache-Control': 'no-store' }
const serverError = () => NextResponse.json({ error: 'Une erreur serveur est survenue.' }, { status: 500, headers: NO_STORE })

/**
 * POST /api/fiscal/calculations/its-vps   { dossier_id, fiscal_year }
 * Calcule ITS + VPS d'un exercice depuis la section `its_vps` VALIDÉE et des règles VALIDÉES du référentiel.
 * Impossible => 422 avec blocages, rien n'est enregistré. Réussi => calcul immuable enregistré
 * (résultat figé), validation ultérieure via PATCH /api/fiscal/calculations.
 * Les pénalités et intérêts DGI ne sont PAS calculés ici (lot dédié).
 */
export async function POST(request: Request) {
  try {
    const access = await requireAdmin()
    if (!access.ok) return access.response

    const raw = await request.text()
    if (raw.length > 5000) return NextResponse.json({ error: 'Requête trop volumineuse.' }, { status: 413 })
    let body: unknown
    try { body = JSON.parse(raw) } catch { return NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 }) }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Données invalides.' }, { status: 400 })
    const p = body as Record<string, unknown>
    if (typeof p.dossier_id !== 'string' || !UUID_RE.test(p.dossier_id)
      || !Number.isInteger(p.fiscal_year) || (p.fiscal_year as number) < 2000 || (p.fiscal_year as number) > 2100) {
      return NextResponse.json({ error: 'Paramètres invalides (dossier_id, fiscal_year).' }, { status: 400 })
    }
    const fiscalYear = p.fiscal_year as number
    const client = getServiceClient()

    const { data: listed, error: listErr } = await client.rpc('fiscal_list_section_inputs', {
      p_actor_id: access.session.sub, p_dossier_id: p.dossier_id, p_include_history: false,
    })
    if (listErr) {
      if (listErr.code === 'P0002') return NextResponse.json({ error: 'Dossier introuvable.' }, { status: 404 })
      return serverError()
    }
    const sections = ((listed as { data?: unknown[] } | null)?.data ?? []) as Array<{
      id: string; section_code: string; fiscal_year: number; status: string; version: number; payload: unknown
    }>
    const section = sections.find(s => s.section_code === 'its_vps' && s.fiscal_year === fiscalYear)
    if (!section) return NextResponse.json({ error: 'Section its_vps absente pour cet exercice.', blockers: [{ code: 'ITS_SECTION_MISSING' }] }, { status: 422 })
    if (section.status !== 'validated') {
      return NextResponse.json({ error: 'La section its_vps doit être validée avant calcul.', blockers: [{ code: 'ITS_SECTION_NOT_VALIDATED', message: 'Statut actuel : ' + section.status }] }, { status: 422 })
    }

    const resolution = await resolveValidatedItsRules(client, fiscalYear)
    if (!resolution.ok) return NextResponse.json({ error: 'Règles ITS/VPS non validées ou incomplètes.', blockers: resolution.blockers }, { status: 422, headers: NO_STORE })

    let computed
    try {
      computed = computeItsVps(parseItsVpsSection(section.payload), resolution.rules)
    } catch (e) {
      if (e instanceof ItsVpsBlockedError) return NextResponse.json({ error: 'Calcul ITS/VPS impossible.', blockers: e.reasons.map(m => ({ code: 'ITS_VPS_CALCULATION_BLOCKED', message: m })) }, { status: 422, headers: NO_STORE })
      return serverError()
    }

    // Un résultat incomplet ne doit jamais devenir validable : le garde-fou SQL ne contrôle que `blockers`.
    if (!computed.complete) {
      const u = computed.unknown
      return NextResponse.json({
        error: 'Données incomplètes : calcul non enregistré.',
        blockers: [{ code: 'ITS_VPS_INPUT_INCOMPLETE', message: 'Lignes sans ITS retenu : ' + u.itsWithheld + ', sans ITS reversé : ' + u.itsPaid + ', sans VPS déclaré : ' + u.vpsDeclared + ', sans VPS payé : ' + u.vpsPaid + '. Renseigner explicitement 0 si aucun montant.' }],
      }, { status: 422, headers: NO_STORE })
    }

    const inputSnapshot = {
      kind: 'its_vps', fiscal_year: fiscalYear, source_input_id: section.id, source_input_version: section.version,
      rules_trace: resolution.trace,
    }
    const { data, error } = await client.rpc('fiscal_create_calculation_result', {
      p_actor_id: access.session.sub, p_dossier_id: p.dossier_id, p_input_snapshot: inputSnapshot,
      p_result_snapshot: computed, p_engine_version: ENGINE_VERSION, p_workbook_version: WORKBOOK_VERSION,
    })
    if (error) {
      if (error.code === '22023') return NextResponse.json({ error: error.message }, { status: 400 })
      if (error.code === 'P0002') return NextResponse.json({ error: 'Dossier introuvable.' }, { status: 404 })
      if (error.code === '55000') return NextResponse.json({ error: error.message }, { status: 409 })
      return serverError()
    }
    return NextResponse.json(
      { data, totals: computed.totals, message: 'Calcul ITS/VPS enregistré. Il doit être soumis à revue puis validé.' },
      { status: 201, headers: NO_STORE },
    )
  } catch {
    return serverError()
  }
}
