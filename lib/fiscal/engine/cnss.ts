export const CNSS_ENGINE_VERSION = '0.1.0-dev'

type Rule = {
  id: string
  code: string
  value: string
  unit: 'ratio'
  sourceId: string
  sourceCode: string
  articleReference: string
  effectiveFrom: string
  effectiveTo: string | null
}

type PeriodRules = {
  status: 'validated' | 'unvalidated'
  period: string
  roundingMode: 'per_line' | 'per_period' | null
  familyRate: Rule
  employerPensionRate: Rule
  employeePensionRate: Rule
  riskRate: Rule
}

export type CnssInput = {
  periods: Array<{
    period: string
    employeeRef: string
    baseXof: string
  }>
  rulesByPeriod: Record<string, PeriodRules>
}

type Blocker = { code: string; message: string }

export type CnssResult = {
  engineVersion: string
  status: 'blocked' | 'provisional'
  currency: 'XOF'
  employerFamilyXof: string | null
  employerPensionXof: string | null
  employerRiskXof: string | null
  employeePensionXof: string | null
  totalEmployerXof: string | null
  totalEmployeeXof: string | null
  totalCnssXof: string | null
  periods: Array<{
    period: string
    employeeCount: number
    baseXof: string
    employerXof: string
    employeeXof: string
    totalXof: string
  }>
  blockers: Blocker[]
  ruleTrace: Record<string, unknown> | null
}

const ZERO = BigInt(0)
const RATE_SCALE = BigInt(100000000)

function amountToCents(value: string): bigint {
  if (typeof value !== 'string' || !/^\d{1,15}(\.\d{1,2})?$/.test(value)) {
    throw new Error('Montant CNSS invalide : utilisez une chaîne XOF avec deux décimales maximum.')
  }

  const [whole, decimal = ''] = value.split('.')
  return BigInt(whole) * BigInt(100) +
    BigInt((decimal + '00').slice(0, 2))
}

function formatCents(value: bigint): string {
  const negative = value < ZERO
  const absolute = negative ? -value : value
  const result = `${absolute / BigInt(100)}.${(absolute % BigInt(100)).toString().padStart(2, '0')}`
  return negative ? `-${result}` : result
}

function parseRate(rule: Rule, period: string): bigint {
  if (
    !rule ||
    rule.unit !== 'ratio' ||
    typeof rule.value !== 'string' ||
    !/^(0(\.\d{1,8})?|1(\.0{1,8})?)$/.test(rule.value) ||
    !rule.id ||
    !rule.code ||
    !rule.sourceId ||
    !rule.sourceCode ||
    !rule.articleReference.trim() ||
    !rule.effectiveFrom ||
    rule.effectiveFrom > `${period}-01` ||
    (rule.effectiveTo !== null && rule.effectiveTo < `${period}-31`)
  ) {
    throw new Error(`Règle réglementaire absente, invalide ou non applicable : ${period}.`)
  }

  const [whole, decimal = ''] = rule.value.split('.')
  return BigInt(whole) * RATE_SCALE +
    BigInt((decimal + '00000000').slice(0, 8))
}

function applyRate(base: bigint, rate: bigint): bigint {
  // Arrondi arithmétique au centime supérieur à partir de 0,5 centime.
  const numerator = base * rate
  return (numerator + RATE_SCALE / BigInt(2)) / RATE_SCALE
}

function emptyResult(blockers: Blocker[]): CnssResult {
  return {
    engineVersion: CNSS_ENGINE_VERSION,
    status: 'blocked',
    currency: 'XOF',
    employerFamilyXof: null,
    employerPensionXof: null,
    employerRiskXof: null,
    employeePensionXof: null,
    totalEmployerXof: null,
    totalEmployeeXof: null,
    totalCnssXof: null,
    periods: [],
    blockers,
    ruleTrace: null,
  }
}

export function calculateCnss(input: CnssInput): CnssResult {
  const blockers: Blocker[] = []

  if (!input || !Array.isArray(input.periods) || input.periods.length === 0) {
    return emptyResult([{
      code: 'CNSS_PERIODS_MISSING',
      message: 'Aucune période de cotisation CNSS renseignée.',
    }])
  }

  if (input.periods.length > 6000) {
    return emptyResult([{
      code: 'CNSS_CAPACITY_EXCEEDED',
      message: 'La limite de 6 000 lignes de paie est dépassée.',
    }])
  }

  const seen = new Set<string>()
  const grouped = new Map<string, Array<{ employeeRef: string; base: bigint }>>()

  try {
    for (const line of input.periods) {
      if (
        !line ||
        !/^\d{4}-(0[1-9]|1[0-2])$/.test(line.period) ||
        typeof line.employeeRef !== 'string' ||
        !line.employeeRef.trim() ||
        line.employeeRef.length > 100
      ) {
        throw new Error('Une ligne CNSS contient une période ou un salarié invalide.')
      }

      const uniqueKey = `${line.period}:${line.employeeRef}`
      if (seen.has(uniqueKey)) {
        throw new Error(`Ligne CNSS dupliquée pour ${line.employeeRef} (${line.period}).`)
      }
      seen.add(uniqueKey)

      const base = amountToCents(line.baseXof)
      if (base < ZERO) throw new Error('Une assiette CNSS ne peut pas être négative.')

      const rows = grouped.get(line.period) ?? []
      rows.push({ employeeRef: line.employeeRef, base })
      grouped.set(line.period, rows)
    }

    let familyTotal = ZERO
    let employerPensionTotal = ZERO
    let riskTotal = ZERO
    let employeePensionTotal = ZERO
    let baseTotal = ZERO
    const periodResults: CnssResult['periods'] = []
    const trace: Record<string, unknown> = {}

    for (const period of Array.from(grouped.keys()).sort()) {
      const rules = input.rulesByPeriod?.[period]

      if (
        !rules ||
        rules.status !== 'validated' ||
        rules.period !== period ||
        !['per_line', 'per_period'].includes(String(rules.roundingMode))
      ) {
        throw new Error(`Règles CNSS validées ou méthode d'arrondi manquantes pour ${period}.`)
      }

      const familyRate = parseRate(rules.familyRate, period)
      const employerPensionRate = parseRate(rules.employerPensionRate, period)
      const employeePensionRate = parseRate(rules.employeePensionRate, period)
      const riskRate = parseRate(rules.riskRate, period)

      const rates = [
        rules.familyRate,
        rules.employerPensionRate,
        rules.employeePensionRate,
        rules.riskRate,
      ]

      if (new Set(rates.map(rule => rule.id)).size !== 4) {
        throw new Error(`Les paramètres CNSS doivent être distincts pour ${period}.`)
      }

      const rows = grouped.get(period)!
      const periodBase = rows.reduce((sum, row) => sum + row.base, ZERO)

      let family: bigint
      let employerPension: bigint
      let risk: bigint
      let employeePension: bigint

      if (rules.roundingMode === 'per_line') {
        family = rows.reduce((sum, row) => sum + applyRate(row.base, familyRate), ZERO)
        employerPension = rows.reduce((sum, row) => sum + applyRate(row.base, employerPensionRate), ZERO)
        risk = rows.reduce((sum, row) => sum + applyRate(row.base, riskRate), ZERO)
        employeePension = rows.reduce((sum, row) => sum + applyRate(row.base, employeePensionRate), ZERO)
      } else {
        family = applyRate(periodBase, familyRate)
        employerPension = applyRate(periodBase, employerPensionRate)
        risk = applyRate(periodBase, riskRate)
        employeePension = applyRate(periodBase, employeePensionRate)
      }

      const employer = family + employerPension + risk
      const total = employer + employeePension

      familyTotal += family
      employerPensionTotal += employerPension
      riskTotal += risk
      employeePensionTotal += employeePension
      baseTotal += periodBase

      periodResults.push({
        period,
        employeeCount: rows.length,
        baseXof: formatCents(periodBase),
        employerXof: formatCents(employer),
        employeeXof: formatCents(employeePension),
        totalXof: formatCents(total),
      })

      trace[period] = {
        roundingMode: rules.roundingMode,
        rules: rates.map(rule => ({
          id: rule.id,
          code: rule.code,
          value: rule.value,
          sourceId: rule.sourceId,
          sourceCode: rule.sourceCode,
          articleReference: rule.articleReference,
          effectiveFrom: rule.effectiveFrom,
          effectiveTo: rule.effectiveTo,
        })),
      }
    }

    const totalEmployer = familyTotal + employerPensionTotal + riskTotal
    const totalCnss = totalEmployer + employeePensionTotal

    return {
      engineVersion: CNSS_ENGINE_VERSION,
      status: 'provisional',
      currency: 'XOF',
      employerFamilyXof: formatCents(familyTotal),
      employerPensionXof: formatCents(employerPensionTotal),
      employerRiskXof: formatCents(riskTotal),
      employeePensionXof: formatCents(employeePensionTotal),
      totalEmployerXof: formatCents(totalEmployer),
      totalEmployeeXof: formatCents(employeePensionTotal),
      totalCnssXof: formatCents(totalCnss),
      periods: periodResults,
      blockers,
      ruleTrace: {
        baseTotalXof: formatCents(baseTotal),
        periods: trace,
      },
    }
  } catch (error) {
    blockers.push({
      code: 'CNSS_CALCULATION_BLOCKED',
      message: error instanceof Error ? error.message : 'Calcul CNSS impossible.',
    })
    return emptyResult(blockers)
  }
}
