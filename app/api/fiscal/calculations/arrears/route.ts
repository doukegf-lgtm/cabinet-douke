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
import { calculateIs } from '@/lib/fiscal/engine/is'
import { resolveValidatedIsRules } from '@/lib/fiscal/engine/is-rules'
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

// Les deux moteurs utilisent une Ã©chelle BigInt de 1e14.
// Le CNSS peut produire plus de deux dÃ©cimales aprÃ¨s application des taux.
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
        { error: 'RequÃªte trop volumineuse.' },
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
        { error: 'DonnÃ©es invalides.' },
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
        { error: 'ParamÃ¨tres invalides (dossier_id, fiscal_year, calc_date).' },
        { status: 400 },
      )
    }

    const fiscalYear = p.fiscal_year as number
    const client = getServiceClient()

    // 1. RÃ©cupÃ©ration des saisies du dossier.
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
          `La section ${code} doit Ãªtre validÃ©e avant le calcul.`,
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
          'Consolidation des arriÃ©rÃ©s impossible.',
          error.blockers.map((message: string) => ({
            code: 'ARREARS_BLOCKED',
            message,
          })),
        )
      }
      throw error
    }

    // EmpÃªcher le double comptage des dettes CNSS issues de la paie.
    const cnssViolations = findCnssOriginViolations(arrears.debts)

    if (cnssViolations.length > 0) {
      return errorResponse(
        'Chaque dette CNSS de social_operations doit Ãªtre explicitement identifiÃ©e comme notification historique. Les cotisations de paie sont dÃ©jÃ  calculÃ©es depuis cnss_periods.',
        cnssViolations.map(({ code, debt_id, nature, origin }) => ({
          code,
          debt_id,
          nature,
          origin,
        })),
      )
    }
    // 3. RÃ©solution des rÃ¨gles CNSS validÃ©es.
    const resolution = await resolveValidatedCnssRules(client, fiscalYear)

    if (!resolution.ok) {
      return errorResponse(
        'RÃ¨gles CNSS non validÃ©es ou incomplÃ¨tes.',
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
          'Des lignes de paie sortent de lâ€™exercice demandÃ©.',
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

    // 6. InstantanÃ© consolidÃ© : les deux rÃ©sultats dÃ©taillÃ©s sont conservÃ©s.
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

    //  IS : récupération indépendante des données annuelles validées.
    // Une absence de données ou de règles IS ne bloque jamais DGI + CNSS.
    let annualInputStatus: string = 'missing'
    let annualInputBlockers: Array<{ code: string; message: string }> = []
    let annualPayload: Record<string, unknown> = {}

    try {
      const { data: annualListed, error: annualError } = await client.rpc(
        'fiscal_list_annual_inputs',
        {
          p_actor_id: access.session.sub,
          p_dossier_id: p.dossier_id,
        },
      )

      if (annualError) {
        annualInputBlockers.push({
          code: 'ANNUAL_INPUT_LOOKUP_FAILED',
          message: 'Impossible de récupérer les données annuelles IS.',
        })
      } else {
        const annualRows = (
          (annualListed as { data?: Array<Record<string, unknown>> } | null)?.data ?? []
        )

        const annualInput = annualRows.find(
          row => row.fiscal_year === fiscalYear,
        )

        if (!annualInput) {
          annualInputBlockers.push({
            code: 'ANNUAL_INPUT_MISSING',
            message: `Aucune saisie annuelle IS pour l'exercice ${fiscalYear}.`,
          })
        } else {
          annualInputStatus = String(annualInput.status ?? 'unknown')

          if (annualInput.status === 'validated') {
            if (
              annualInput.payload
              && typeof annualInput.payload === 'object'
              && !Array.isArray(annualInput.payload)
            ) {
              annualPayload = annualInput.payload as Record<string, unknown>
            }
          } else {
            annualInputBlockers.push({
              code: 'ANNUAL_INPUT_NOT_VALIDATED',
              message: 'La saisie annuelle IS doit être validée avant calcul.',
            })
          }
        }
      }
    } catch {
      annualInputBlockers.push({
        code: 'ANNUAL_INPUT_LOOKUP_FAILED',
        message: 'Erreur lors de la récupération des données annuelles IS.',
      })
    }

    // Résolution des trois paramètres IS depuis le référentiel validé.
    // Les codes sont configurables côté serveur : aucun taux n'est inventé.
    const isRuleCodes = {
      isRateCode: process.env.FISCAL_IS_RATE_CODE ?? '',
      minimumRateCode: process.env.FISCAL_IS_MINIMUM_RATE_CODE ?? '',
      minimumFloorCode: process.env.FISCAL_IS_MINIMUM_FLOOR_CODE ?? '',
    }

    const isRulesResolution = await resolveValidatedIsRules(
      client,
      fiscalYear,
      isRuleCodes,
    )

    const isRuleBlockers = isRulesResolution.ok
      ? []
      : isRulesResolution.blockers
    const isResult = calculateIs({
      fiscalYear,
      taxRegime: (() => {
        const profiles = sections.filter(
          section =>
            section.section_code === 'tax_profile' &&
            section.fiscal_year === fiscalYear,
        )

        if (profiles.length !== 1 || profiles[0].status !== 'validated') {
          return null
        }

        const payload = profiles[0].payload
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
          return null
        }

        const profile = payload as Record<string, unknown>
        const nested = profile.profile
        const nestedProfile =
          nested && typeof nested === 'object' && !Array.isArray(nested)
            ? nested as Record<string, unknown>
            : null

        const regime = profile.tax_regime_code ?? nestedProfile?.tax_regime_code

        return typeof regime === 'string' && regime.trim()
          ? regime.trim().toUpperCase()
          : null
      })(),
      sourceMode: annualPayload.source_mode === 'actual' ? 'actual' : 'estimated',
      amounts: {
        ca_fiscal_ht: annualPayload.ca_fiscal_ht as string | number | null ?? null,
        charges_comptables: annualPayload.charges_comptables as string | number | null ?? null,
        charges_deductibles_justifiees: annualPayload.charges_deductibles_justifiees as string | number | null ?? null,
        reintegrations_fiscales: annualPayload.reintegrations_fiscales as string | number | null ?? null,
        deductions_fiscales: annualPayload.deductions_fiscales as string | number | null ?? null,
        acomptes_is_justifies: annualPayload.acomptes_is_justifies as string | number | null ?? null,
        credits_is_valides: annualPayload.credits_is_valides as string | number | null ?? null,
      },
      // Aucun code réglementaire IS n'est encore défini dans le projet.
      rules: isRulesResolution.ok ? isRulesResolution.rules : null,
    })
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
      is: isResult,
      is_annual_input_status: annualInputStatus,
      is_annual_input_blockers: annualInputBlockers,
      is_rule_resolution_blockers: isRuleBlockers,
      warnings: [
        ...arrears.warnings,
        ...cnss.warnings,
        'RÃ©sultat consolidÃ© : vÃ©rifier la concordance avec le classeur V8 avant toute certification.',
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
        message: 'Calcul consolidÃ© DGI + CNSS enregistrÃ©. Il doit Ãªtre soumis Ã  revue puis validÃ©.',
      },
      { status: 201, headers: NO_STORE },
    )
  } catch {
    return serverError()
  }
}

