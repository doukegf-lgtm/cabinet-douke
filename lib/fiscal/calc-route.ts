import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/platform/auth'
import { getServiceClient } from '@/lib/platform/supabase-server'
import { CalcBlockedError } from './engine/penalty-core'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const WORKBOOK_VERSION = 'V8-reference-regles-du-referentiel'
const NO_STORE = { 'Cache-Control': 'no-store' }

export type RunOutcome =
  | { ok: true; result: object; trace: Record<string, unknown>; totals: unknown }
  | { ok: false; status: number; body: Record<string, unknown> }

export interface CalcRouteConfig {
  sectionCode: 'vat' | 'aib' | 'withholding'
  kind: string
  engineVersion: string
  run(ctx: { client: SupabaseClient; fiscalYear: number; calcDate: string | null; payload: unknown }): Promise<RunOutcome>
}

export const rulesBlocked = (blockers: unknown[]): RunOutcome =>
  ({ ok: false, status: 422, body: { error: 'Règles non validées ou incomplètes.', blockers } })

export function calcError(e: unknown): RunOutcome {
  if (e instanceof CalcBlockedError) {
    return { ok: false, status: 422, body: { error: 'Calcul impossible.', blockers: e.reasons.map(m => ({ code: 'CALCULATION_BLOCKED', message: m })) } }
  }
  throw e
}

const serverError = () => NextResponse.json({ error: 'Une erreur serveur est survenue.' }, { status: 500, headers: NO_STORE })

/**
 * Circuit commun : administrateur -> section VALIDÉE -> règles VALIDÉES -> calcul exact -> enregistrement immuable.
 * Calcul impossible => 422 détaillé, rien n'est enregistré. Validation ultérieure : PATCH /api/fiscal/calculations.
 */
export async function handleCalculationPost(request: Request, cfg: CalcRouteConfig): Promise<Response> {
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
    const hasDate = p.calc_date !== undefined && p.calc_date !== null
    if (hasDate && (typeof p.calc_date !== 'string' || !DATE_RE.test(p.calc_date))) {
      return NextResponse.json({ error: 'calc_date invalide (AAAA-MM-JJ).' }, { status: 400 })
    }
    const fiscalYear = p.fiscal_year as number
    const calcDate = hasDate ? (p.calc_date as string) : null
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
    const section = sections.find(s => s.section_code === cfg.sectionCode && s.fiscal_year === fiscalYear)
    if (!section) return NextResponse.json({ error: 'Section ' + cfg.sectionCode + ' absente pour cet exercice.', blockers: [{ code: 'SECTION_MISSING' }] }, { status: 422 })
    if (section.status !== 'validated') {
      return NextResponse.json({ error: 'La section ' + cfg.sectionCode + ' doit être validée avant calcul.', blockers: [{ code: 'SECTION_NOT_VALIDATED', message: 'Statut actuel : ' + section.status }] }, { status: 422 })
    }

    const outcome = await cfg.run({ client, fiscalYear, calcDate, payload: section.payload })
    if (!outcome.ok) return NextResponse.json(outcome.body, { status: outcome.status, headers: NO_STORE })

    const inputSnapshot = {
      kind: cfg.kind, fiscal_year: fiscalYear, calc_date: calcDate, source_input_id: section.id, source_input_version: section.version, ...outcome.trace,
    }
    const { data, error } = await client.rpc('fiscal_create_calculation_result', {
      p_actor_id: access.session.sub, p_dossier_id: p.dossier_id, p_input_snapshot: inputSnapshot,
      p_result_snapshot: outcome.result, p_engine_version: cfg.engineVersion, p_workbook_version: WORKBOOK_VERSION,
    })
    if (error) {
      if (error.code === '22023') return NextResponse.json({ error: error.message }, { status: 400 })
      if (error.code === 'P0002') return NextResponse.json({ error: 'Dossier introuvable.' }, { status: 404 })
      if (error.code === '55000') return NextResponse.json({ error: error.message }, { status: 409 })
      return serverError()
    }
    return NextResponse.json(
      { data, totals: outcome.totals, message: 'Calcul enregistré. Il doit être soumis à revue puis validé.' },
      { status: 201, headers: NO_STORE },
    )
  } catch {
    return serverError()
  }
}
