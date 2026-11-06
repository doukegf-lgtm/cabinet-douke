import type { SupabaseClient } from '@supabase/supabase-js'
import type { ContributionRule } from './cnss-liquidation'

/**
 * Résolveur des règles CNSS depuis fiscal_regulatory_entries.
 * Ne renvoie QUE des règles `validated`, couvrant tout l'exercice, adossées à une
 * source juridique `legal_source` elle-même validée. Aucune valeur par défaut.
 *
 * Conventions d'encodage (numeric_value + unit) :
 *  - taux         : unit 'ratio', ex. 0.09
 *  - plafond      : unit 'XOF' = plafond mensuel d'assiette ; unit 'none' + valeur 0 = ABSENCE de plafond validée
 *  - jour limite  : unit 'day' (1..28)
 *  - seuil effectif mensuel : unit 'employees' (entier >= 1) ; effectif >= seuil => mensuel, sinon trimestriel
 *  - mode de retard : unit 'enum' ; 1 = date à date, 2 = mois civils
 * Le taux risques professionnels n'est PAS une règle : c'est une donnée du dossier (taux notifié CNSS).
 */
export const CNSS_RULE_CODES = {
  pfRate: 'CNSS_PF_RATE',
  pfCeiling: 'CNSS_PF_CEILING_MONTHLY',
  pensionEmployerRate: 'CNSS_PENSION_EMPLOYER_RATE',
  pensionEmployerCeiling: 'CNSS_PENSION_EMPLOYER_CEILING_MONTHLY',
  pensionEmployeeRate: 'CNSS_PENSION_EMPLOYEE_RATE',
  pensionEmployeeCeiling: 'CNSS_PENSION_EMPLOYEE_CEILING_MONTHLY',
  rpCeiling: 'CNSS_RP_CEILING_MONTHLY',
  dueDay: 'CNSS_DUE_DAY',
  monthlyMinHeadcount: 'CNSS_MONTHLY_MIN_HEADCOUNT',
  lateCountingMode: 'CNSS_LATE_COUNTING_MODE',
  latePenaltyRate: 'CNSS_LATE_PENALTY_RATE_MONTHLY',
} as const

export type Blocker = { code: string; message: string }

export type ResolvedCnssRules = {
  fiscalYear: number
  contributionRules: ContributionRule[]
  procedure: {
    headcountThreshold: number
    dueDay: number
    lateCounting: 'date_to_date' | 'calendar_months'
    latePenaltyRate: string
    legalRef: string
  }
  trace: Array<{
    code: string; id: string; value: string; unit: string | null
    sourceId: string; sourceCode: string; articleReference: string
    effectiveFrom: string; effectiveTo: string | null
  }>
}

export type CnssRulesResolution =
  | { ok: true; rules: ResolvedCnssRules }
  | { ok: false; blockers: Blocker[] }

type Row = {
  id: string; entry_type: string; code: string
  numeric_value: string | number | null
  unit: string | null; currency: string | null
  source_entry_id: string | null; article_reference: string | null
  effective_from: string | null; effective_to: string | null
  verification_status: string
}
type SourceRow = { id: string; entry_type: string; code: string; verification_status: string }

const RATIO = /^(0(\.\d{1,6})?|1(\.0{1,6})?)$/
const AMOUNT = /^\d{1,15}(\.\d{1,2})?$/
const INT = /^\d{1,3}(\.0+)?$/
const num = (v: string | number | null) => (v === null ? '' : String(v))
const int = (s: string) => parseInt(s, 10)

export async function resolveValidatedCnssRules(
  client: SupabaseClient,
  fiscalYear: number,
): Promise<CnssRulesResolution> {
  if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100) {
    return { ok: false, blockers: [{ code: 'INVALID_FISCAL_YEAR', message: 'Exercice fiscal invalide.' }] }
  }
  const start = `${fiscalYear}-01-01`
  const end = `${fiscalYear}-12-31`
  const codes = Object.values(CNSS_RULE_CODES)

  const { data, error } = await client
    .from('fiscal_regulatory_entries')
    .select('id,entry_type,code,numeric_value,unit,currency,source_entry_id,article_reference,effective_from,effective_to,verification_status')
    .in('code', codes)
    .eq('entry_type', 'parameter')
    .eq('verification_status', 'validated')
    .lte('effective_from', start)
    .or(`effective_to.is.null,effective_to.gte.${end}`)

  if (error) return { ok: false, blockers: [{ code: 'CNSS_RULES_LOOKUP_FAILED', message: 'Référentiel CNSS inconsultable.' }] }

  const blockers: Blocker[] = []
  const byCode = new Map<string, Row[]>()
  for (const r of (data ?? []) as Row[]) {
    // contrôle redondant côté code (ne pas dépendre uniquement du filtre SQL)
    if (r.verification_status !== 'validated' || !r.effective_from || r.effective_from > start
        || (r.effective_to !== null && r.effective_to < end)) continue
    byCode.set(r.code, [...(byCode.get(r.code) ?? []), r])
  }
  for (const [code, rows] of Array.from(byCode.entries())) {
    if (rows.length > 1) blockers.push({ code: 'CNSS_RULE_OVERLAP', message: `${code} : plusieurs règles validées se chevauchent sur ${fiscalYear}.` })
  }
  if (blockers.length) return { ok: false, blockers }

  const get = (c: string) => byCode.get(c)?.[0]
  const need = (c: string) => {
    const r = get(c)
    if (!r) blockers.push({ code: 'CNSS_RULE_MISSING_OR_NOT_VALIDATED', message: `${c} : absent, non validé ou ne couvrant pas tout l'exercice ${fiscalYear}.` })
    return r
  }
  const required = [CNSS_RULE_CODES.pfRate, CNSS_RULE_CODES.pfCeiling, CNSS_RULE_CODES.pensionEmployerRate,
    CNSS_RULE_CODES.pensionEmployerCeiling, CNSS_RULE_CODES.pensionEmployeeRate, CNSS_RULE_CODES.pensionEmployeeCeiling,
    CNSS_RULE_CODES.rpCeiling, CNSS_RULE_CODES.dueDay, CNSS_RULE_CODES.monthlyMinHeadcount,
    CNSS_RULE_CODES.lateCountingMode, CNSS_RULE_CODES.latePenaltyRate].map(need)
  if (blockers.length) return { ok: false, blockers }
  const rows = required as Row[]

  for (const r of rows) {
    if (!r.source_entry_id || !r.article_reference?.trim()) {
      blockers.push({ code: 'CNSS_RULE_TRACE_INCOMPLETE', message: `${r.code} : source juridique ou article manquant.` })
    }
    if (r.numeric_value === null) blockers.push({ code: 'CNSS_RULE_VALUE_MISSING', message: `${r.code} : valeur absente.` })
  }
  if (blockers.length) return { ok: false, blockers }

  const { data: srcData, error: srcErr } = await client
    .from('fiscal_regulatory_entries')
    .select('id,entry_type,code,verification_status')
    .in('id', Array.from(new Set(rows.map(r => r.source_entry_id as string))))
  if (srcErr) return { ok: false, blockers: [{ code: 'CNSS_SOURCES_LOOKUP_FAILED', message: 'Sources juridiques inconsultables.' }] }
  const sources = new Map(((srcData ?? []) as SourceRow[]).map(s => [s.id, s]))
  for (const r of rows) {
    const s = sources.get(r.source_entry_id as string)
    if (!s || s.entry_type !== 'legal_source' || s.verification_status !== 'validated') {
      blockers.push({ code: 'CNSS_LEGAL_SOURCE_NOT_VALIDATED', message: `${r.code} : texte juridique source non validé.` })
    }
  }
  if (blockers.length) return { ok: false, blockers }

  const rate = (c: string) => {
    const r = get(c)!
    if (r.unit !== 'ratio' || !RATIO.test(num(r.numeric_value)))
      blockers.push({ code: 'CNSS_RATE_FORMAT_INVALID', message: `${c} : ratio décimal (0..1) avec unité ratio exigé.` })
    return num(r.numeric_value)
  }
  const ceiling = (c: string): ContributionRule['ceiling'] => {
    const r = get(c)!
    const v = num(r.numeric_value)
    if (r.unit === 'none' && /^0(\.0+)?$/.test(v)) return { kind: 'none' }
    if (r.unit === 'XOF' && r.currency === 'XOF' && AMOUNT.test(v) && !/^0(\.0+)?$/.test(v)) return { kind: 'monthly', amount: v }
    blockers.push({ code: 'CNSS_CEILING_FORMAT_INVALID', message: `${c} : plafond XOF > 0, ou unité none + valeur 0 pour « aucun plafond ».` })
    return { kind: 'unknown' }
  }
  const mk = (code: string, payer: 'employer' | 'employee', rateCode: string | null, ceilCode: string): ContributionRule => {
    const ref = get(rateCode ?? ceilCode)!
    return {
      code, payer, rate: rateCode ? rate(rateCode) : null, ceiling: ceiling(ceilCode), status: 'validated',
      legalRef: `${sources.get(ref.source_entry_id as string)!.code} ${ref.article_reference}`,
      validFrom: `${fiscalYear}-01`, validTo: `${fiscalYear}-12`,
    }
  }
  const contributionRules = [
    mk('CNSS_PF', 'employer', CNSS_RULE_CODES.pfRate, CNSS_RULE_CODES.pfCeiling),
    mk('CNSS_RP', 'employer', null, CNSS_RULE_CODES.rpCeiling),
    mk('CNSS_PENSION_EMPLOYER', 'employer', CNSS_RULE_CODES.pensionEmployerRate, CNSS_RULE_CODES.pensionEmployerCeiling),
    mk('CNSS_PENSION_EMPLOYEE', 'employee', CNSS_RULE_CODES.pensionEmployeeRate, CNSS_RULE_CODES.pensionEmployeeCeiling),
  ]

  const dueDayRow = get(CNSS_RULE_CODES.dueDay)!, thrRow = get(CNSS_RULE_CODES.monthlyMinHeadcount)!
  const modeRow = get(CNSS_RULE_CODES.lateCountingMode)!, penRow = get(CNSS_RULE_CODES.latePenaltyRate)!
  if (dueDayRow.unit !== 'day' || !INT.test(num(dueDayRow.numeric_value)) || int(num(dueDayRow.numeric_value)) < 1 || int(num(dueDayRow.numeric_value)) > 28)
    blockers.push({ code: 'CNSS_DUE_DAY_INVALID', message: 'Jour limite : unité day, entier 1..28.' })
  if (thrRow.unit !== 'employees' || !INT.test(num(thrRow.numeric_value)) || int(num(thrRow.numeric_value)) < 1)
    blockers.push({ code: 'CNSS_THRESHOLD_INVALID', message: 'Seuil d\'effectif : unité employees, entier >= 1.' })
  if (modeRow.unit !== 'enum' || !['1', '2'].includes(num(modeRow.numeric_value).replace(/\.0+$/, '')))
    blockers.push({ code: 'CNSS_LATE_MODE_INVALID', message: 'Mode de retard : unité enum, 1 (date à date) ou 2 (mois civils).' })
  const penaltyRate = (penRow.unit === 'ratio' && RATIO.test(num(penRow.numeric_value))) ? num(penRow.numeric_value) : (blockers.push({ code: 'CNSS_PENALTY_RATE_INVALID', message: 'Taux de majoration : ratio décimal exigé.' }), '')
  if (blockers.length) return { ok: false, blockers }

  const ref = (r: Row) => `${sources.get(r.source_entry_id as string)!.code} ${r.article_reference}`
  return {
    ok: true,
    rules: {
      fiscalYear, contributionRules,
      procedure: {
        headcountThreshold: int(num(thrRow.numeric_value)),
        dueDay: int(num(dueDayRow.numeric_value)),
        lateCounting: num(modeRow.numeric_value).replace(/\.0+$/, '') === '1' ? 'date_to_date' : 'calendar_months',
        latePenaltyRate: penaltyRate,
        legalRef: [dueDayRow, thrRow, modeRow, penRow].map(ref).join(' ; '),
      },
      trace: rows.map(r => ({
        code: r.code, id: r.id, value: num(r.numeric_value), unit: r.unit,
        sourceId: r.source_entry_id as string, sourceCode: sources.get(r.source_entry_id as string)!.code,
        articleReference: r.article_reference as string, effectiveFrom: r.effective_from as string, effectiveTo: r.effective_to,
      })),
    },
  }
}
