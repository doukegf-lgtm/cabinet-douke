import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/platform/auth'
import { getServiceClient } from '@/lib/platform/supabase-server'
import {
  computeCnss,
  CnssBlockedError,
  fmt as fmtCnss,
  type Params,
} from '@/lib/fiscal/engine/cnss-liquidation'
import { resolveValidatedCnssRules } from '@/lib/fiscal/engine/cnss-rules'
import { parseCnssSection } from '@/lib/fiscal/cnss-input'
import { calculateArrearsFromSections } from '@/lib/fiscal/arrears-input'
import { CalcBlockedError } from '@/lib/fiscal/engine/arrears-common'
import { findCnssOriginViolations } from '@/lib/fiscal/engine/cnss-origin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const ENGINE_VERSION = 'arrears-consolidated-1.0.0'
const WORKBOOK_VERSION = 'V8-reference-regles-CNSS-et-structure-arrieres'
const NO_STORE = { 'Cache-Control': 'no-store' }

type Section = {
  id: string
  section_code: string
  fiscal_year: number
  status: string
  version: number
  payload: unknown
}

function errorResponse(message: string, blockers: unknown[] = []) {
  return NextResponse.json(
    { error: message, blockers },
    { status: 422, headers: NO_STORE },
  )
}

function serverError() {
  return NextResponse.json(
    { error: 'Une erreur serveur est survenue.' },
    { status: 500, headers: NO_STORE },
  )
}

// Les deux moteurs utilisent une échelle BigInt de 1e14.
// Le CNSS peut produire plus de deux décimales après application des taux.
const SCALE = BigInt('100000000000000')

function parseScaled(value: string): bigint {
  const match = /^(\d{1,15})(?:\.(\d{1,14}))?$/.exec(value)
  if (!match) throw new Error('Montant interne invalide : ' + value)

  return BigInt(match[1]) * SCALE
    + BigInt((match[2] || '').padEnd(14, '0'))
}

function addMoney(a: string, b: string): string {
  return fmtCnss(parseScaled(a) + parseScaled(b))
}

export async function POST(request: Request) {
  try {
    const access = await requireAdmin()
    if (!access.ok) return access.response

    const raw = await request.text()
    if (raw.length > 10000) {
      return NextResponse.json(
        { error: 'Requête trop volumineuse.' },
        { status: 413 },
      )
    }

    let body: unknown
    try {
      body = JSON.parse(raw)
    } catch {
      return NextResponse.json(
        { error: 'Corps JSON invalide.' },
        { status: 400 },
      )
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        { error: 'Données invalides.' },
        { status: 400 },
      )
    }

    const p = body as Record<string, unknown>
    const recognition = p.payment_recognition ?? 'verified_only'

    if (
      typeof p.dossier_id !== 'string' ||
      !UUID_RE.test(p.dossier_id) ||
      !Number.isInteger(p.fiscal_year) ||
      (p.fiscal_year as number) < 2000 ||
      (p.fiscal_year as number) > 2100 ||
      typeof p.calc_date !== 'string' ||
      !DATE_RE.test(p.calc_date) ||
      (recognition !== 'verified_only' && recognition !== 'all')
    ) {
      return NextResponse.json(
        { error: 'Paramètres invalides (dossier_id, fiscal_year, calc_date).' },
        { status: 400 },
      )
    }

    const fiscalYear = p.fiscal_year as number
    const client = getServiceClient()

    // 1. Récupération des saisies du dossier.
    const { data: listed, error: listError } = await client.rpc(
      'fiscal_list_section_inputs',
      {
        p_actor_id: access.session.sub,
        p_dossier_id: p.dossier_id,
        p_include_history: false,
      },
    )

    if (listError) {
      if (listError.code === 'P0002') {
        return NextResponse.json(
          { error: 'Dossier introuvable.' },
          { status: 404 },
        )
      }
      return serverError()
    }

    const sections = (
      (listed as { data?: unknown[] } | null)?.data ?? []
    ) as Section[]

    const requiredCodes = [
      'tax_operations',
      'social_operations',
      'payments',
      'cnss_periods',
    ]

    const selected: Record<string, Section> = {}

    for (const code of requiredCodes) {
      const matches = sections.filter(
        section =>
          section.section_code === code &&
          section.fiscal_year === fiscalYear,
      )

      if (matches.length !== 1) {
        return errorResponse(
          `La section ${code} doit exister une seule fois pour ${fiscalYear}.`,
          [{ code: 'SECTION_MISSING_OR_DUPLICATED', section: code }],
        )
      }

      if (matches[0].status !== 'validated') {
        return errorResponse(
          `La section ${code} doit être validée avant le calcul.`,
          [{
            code: 'SECTION_NOT_VALIDATED',
            section: code,
            status: matches[0].status,
          }],
        )
      }

      selected[code] = matches[0]
    }

    // 2. Consolidation des dettes DGI et sociales hors paie CNSS.
    let arrears
    try {
      arrears = calculateArrearsFromSections(
        [selected.tax_operations, selected.social_operations, selected.payments],
        recognition as 'verified_only' | 'all',
      )
    } catch (error) {
      if (error instanceof CalcBlockedError) {
        return errorResponse(
          'Consolidation des arriérés impossible.',
          error.blockers.map((message: string) => ({
            code: 'ARREARS_BLOCKED',
            message,
          })),
        )
      }
      throw error
    }

    // Empêcher le double comptage des dettes CNSS issues de la paie.
    const cnssViolations = findCnssOriginViolations(arrears.debts)

    if (cnssViolations.length > 0) {
      return errorResponse(
        'Chaque dette CNSS de social_operations doit être explicitement identifiée comme notification historique. Les cotisations de paie sont déjà calculées depuis cnss_periods.',
        cnssViolations.map(({ code, debt_id, nature, origin }) => ({
          code,
          debt_id,
          nature,
          origin,
        })),
      )
    }
    // 3. Résolution des règles CNSS validées.
    const resolution = await resolveValidatedCnssRules(client, fiscalYear)

    if (!resolution.ok) {
      return errorResponse(
        'Règles CNSS non validées ou incomplètes.',
        resolution.blockers,
      )
    }

    // 4. Calcul CNSS par le moteur existant.
    let cnss
    try {
      const parsed = parseCnssSection(selected.cnss_periods.payload)

      const params: Params = {
        mode: 'validated',
        calcDate: p.calc_date as string,
        headcount: parsed.headcount,
        rpRateDefault: parsed.rpRateDefault,
        contributionRules: resolution.rules.contributionRules,
        procedure: {
          periodicity: 'by_headcount',
          headcountThreshold: resolution.rules.procedure.headcountThreshold,
          dueDay: resolution.rules.procedure.dueDay,
          lateCounting: resolution.rules.procedure.lateCounting,
          latePenaltyRate: resolution.rules.procedure.latePenaltyRate,
          status: 'validated',
          legalRef: resolution.rules.procedure.legalRef,
        },
      }

      const lines = parsed.lines.filter(
        line => line.period.startsWith(`${fiscalYear}-`),
      )

      if (lines.length !== parsed.lines.length) {
        throw new CnssBlockedError([
          'Des lignes de paie sortent de l’exercice demandé.',
        ])
      }

      cnss = computeCnss(lines, params)
    } catch (error) {
      if (error instanceof CnssBlockedError) {
        return errorResponse(
          'Calcul CNSS impossible.',
          error.reasons.map(message => ({
            code: 'CNSS_CALCULATION_BLOCKED',
            message,
          })),
        )
      }
      throw error
    }

    // 5. Consolidation des montants sans conversion en Number.
    const cnssPaid = cnss.lines.reduce(
      (total, line) => addMoney(total, line.paidRecognized),
      '0',
    )

    const cnssBalance = cnss.totals.principalPlusPenalty

    const totals = {
      principal: addMoney(
        arrears.totals.principal,
        cnss.totals.unpaid,
      ),
      penalty: addMoney(
        arrears.totals.penalty,
        cnss.totals.penalty,
      ),
      interest: arrears.totals.interest,
      paid: addMoney(arrears.totals.paid, cnssPaid),
      estimatedBalance: addMoney(
        arrears.totals.estimatedBalance,
        cnssBalance,
      ),
      principalBalance: addMoney(
        arrears.totals.principalBalance,
        cnss.totals.unpaid,
      ),
      penaltyBalance: addMoney(
        arrears.totals.penaltyBalance,
        cnss.totals.penalty,
      ),
      interestBalance: arrears.totals.interestBalance,
      currency: 'XOF',
    }

    const byType = {
      ...arrears.byType,
      social: addMoney(
        arrears.byType.social || '0',
        cnssBalance,
      ),
    }

    const byOrganism = {
      ...arrears.byOrganism,
      CNSS: addMoney(arrears.byOrganism.CNSS || '0', cnssBalance),
    }

    // 6. Instantané consolidé : les deux résultats détaillés sont conservés.
    const inputSnapshot = {
      kind: 'arrears_consolidated',
      fiscal_year: fiscalYear,
      calc_date: p.calc_date,
      payment_recognition: recognition,
      sources: {
        tax_operations: {
          id: selected.tax_operations.id,
          version: selected.tax_operations.version,
        },
        social_operations: {
          id: selected.social_operations.id,
          version: selected.social_operations.version,
        },
        payments: {
          id: selected.payments.id,
          version: selected.payments.version,
        },
        cnss_periods: {
          id: selected.cnss_periods.id,
          version: selected.cnss_periods.version,
        },
      },
      cnss_rules_trace: resolution.rules.trace,
    }

    const resultSnapshot = {
      provisional: false,
      fiscal_year: fiscalYear,
      calc_date: p.calc_date,
      currency: 'XOF',
      totals,
      byType,
      byOrganism,
      dgi_and_social: arrears,
      cnss,
      warnings: [
        ...arrears.warnings,
        ...cnss.warnings,
        'Résultat consolidé : vérifier la concordance avec le classeur V8 avant toute certification.',
      ],
    }

    if (p.dry_run === true) {
      return NextResponse.json(
        {
          data: null,
          dry_run: true,
          persisted: false,
          totals,
          input_snapshot: inputSnapshot,
          result_snapshot: resultSnapshot,
          message: 'DGI + CNSS simulation completed. No result was saved.',
        },
        {
          status: 200,
          headers: { 'Cache-Control': 'no-store, max-age=0' },
        },
      )
    }

    const { data, error } = await client.rpc(
      'fiscal_create_calculation_result',
      {
        p_actor_id: access.session.sub,
        p_dossier_id: p.dossier_id,
        p_input_snapshot: inputSnapshot,
        p_result_snapshot: resultSnapshot,
        p_engine_version: ENGINE_VERSION,
        p_workbook_version: WORKBOOK_VERSION,
      },
    )

    if (error) {
      if (error.code === '22023') {
        return NextResponse.json(
          { error: error.message },
          { status: 400 },
        )
      }
      if (error.code === 'P0002') {
        return NextResponse.json(
          { error: 'Dossier introuvable.' },
          { status: 404 },
        )
      }
      if (error.code === '55000') {
        return NextResponse.json(
          { error: error.message },
          { status: 409 },
        )
      }
      return serverError()
    }

    return NextResponse.json(
      {
        data,
        totals,
        message: 'Calcul consolidé DGI + CNSS enregistré. Il doit être soumis à revue puis validé.',
      },
      { status: 201, headers: NO_STORE },
    )
  } catch {
    return serverError()
  }
}
