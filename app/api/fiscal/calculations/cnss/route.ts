import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/platform/auth'
import { getServiceClient } from '@/lib/platform/supabase-server'
import { computeCnss, CnssBlockedError, type Params } from '@/lib/fiscal/engine/cnss-liquidation'
import { resolveValidatedCnssRules } from '@/lib/fiscal/engine/cnss-rules'
import { parseCnssSection } from '@/lib/fiscal/cnss-input'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const ENGINE_VERSION = 'cnss-liquidation-1.0.0'
const WORKBOOK_VERSION = 'V8-reference-regles-du-referentiel'
const NO_STORE = { 'Cache-Control': 'no-store' }

const serverError = () => NextResponse.json({ error: 'Une erreur serveur est survenue.' }, { status: 500, headers: NO_STORE })

/**
 * POST /api/fiscal/calculations/cnss
 * { dossier_id, fiscal_year, calc_date: 'YYYY-MM-DD', payment_recognition?: 'verified_only' | 'all' }
 * Calcule la CNSS d'un exercice à partir de la section `cnss_periods` VALIDÉE et des règles VALIDÉES.
 * Calcul impossible => 422 avec les blocages, RIEN n'est enregistré. Succès => calcul enregistré
 * (immuable) au statut initial ; sa validation passe ensuite par PATCH /api/fiscal/calculations.
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
    const recognition = p.payment_recognition ?? 'verified_only'
    if (typeof p.dossier_id !== 'string' || !UUID_RE.test(p.dossier_id)
      || !Number.isInteger(p.fiscal_year) || (p.fiscal_year as number) < 2000 || (p.fiscal_year as number) > 2100
      || typeof p.calc_date !== 'string' || !DATE_RE.test(p.calc_date)
      || (recognition !== 'verified_only' && recognition !== 'all')) {
      return NextResponse.json({ error: 'Paramètres invalides (dossier_id, fiscal_year, calc_date).' }, { status: 400 })
    }
    const fiscalYear = p.fiscal_year as number
    const client = getServiceClient()

    // 1. Section validée
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
    const section = sections.find(s => s.section_code === 'cnss_periods' && s.fiscal_year === fiscalYear)
    if (!section) return NextResponse.json({ error: 'Section cnss_periods absente pour cet exercice.', blockers: [{ code: 'CNSS_SECTION_MISSING' }] }, { status: 422 })
    if (section.status !== 'validated') {
      return NextResponse.json({ error: 'La section cnss_periods doit être validée avant calcul.', blockers: [{ code: 'CNSS_SECTION_NOT_VALIDATED', message: `Statut actuel : ${section.status}` }] }, { status: 422 })
    }

    // 2. Règles validées (lecture serveur du référentiel)
    const resolution = await resolveValidatedCnssRules(client, fiscalYear)
    if (!resolution.ok) return NextResponse.json({ error: 'Règles CNSS non validées ou incomplètes.', blockers: resolution.blockers }, { status: 422, headers: NO_STORE })

    // 3. Calcul (jamais de repli provisoire en production)
    let result
    try {
      const parsed = parseCnssSection(section.payload)
      const rules = resolution.rules
      const params: Params = {
        mode: 'validated', calcDate: p.calc_date as string, headcount: parsed.headcount, rpRateDefault: parsed.rpRateDefault,
        paymentRecognition: recognition as 'verified_only' | 'all', contributionRules: rules.contributionRules,
        procedure: {
          periodicity: 'by_headcount', headcountThreshold: rules.procedure.headcountThreshold, dueDay: rules.procedure.dueDay,
          lateCounting: rules.procedure.lateCounting, latePenaltyRate: rules.procedure.latePenaltyRate,
          status: 'validated', legalRef: rules.procedure.legalRef,
        },
      }
      const lines = parsed.lines.filter(l => l.period.startsWith(`${fiscalYear}-`))
      if (lines.length !== parsed.lines.length) throw new CnssBlockedError(['Des lignes de paie sortent de l’exercice demandé.'])
      result = { computed: computeCnss(lines, params), rules, headcount: parsed.headcount }
    } catch (e) {
      if (e instanceof CnssBlockedError) return NextResponse.json({ error: 'Calcul CNSS impossible.', blockers: e.reasons.map(m => ({ code: 'CNSS_CALCULATION_BLOCKED', message: m })) }, { status: 422, headers: NO_STORE })
      return serverError()
    }

    // 4. Enregistrement immuable : référence de la saisie (version figée dans l'historique) + trace des règles
    const inputSnapshot = {
      kind: 'cnss', fiscal_year: fiscalYear, calc_date: p.calc_date, payment_recognition: recognition,
      source_input_id: section.id, source_input_version: section.version, headcount: result.headcount,
      rules_trace: result.rules.trace,
    }
    const { data, error } = await client.rpc('fiscal_create_calculation_result', {
      p_actor_id: access.session.sub, p_dossier_id: p.dossier_id, p_input_snapshot: inputSnapshot,
      p_result_snapshot: result.computed, p_engine_version: ENGINE_VERSION, p_workbook_version: WORKBOOK_VERSION,
    })
    if (error) {
      if (error.code === '22023') return NextResponse.json({ error: error.message }, { status: 400 })
      if (error.code === 'P0002') return NextResponse.json({ error: 'Dossier introuvable.' }, { status: 404 })
      if (error.code === '55000') return NextResponse.json({ error: error.message }, { status: 409 })
      return serverError()
    }
    return NextResponse.json(
      { data, totals: result.computed.totals, message: 'Calcul CNSS enregistré. Il doit être soumis à revue puis validé.' },
      { status: 201, headers: NO_STORE },
    )
  } catch {
    return serverError()
  }
}
