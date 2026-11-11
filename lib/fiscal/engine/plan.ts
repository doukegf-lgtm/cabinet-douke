import { DecimalError, ZERO, bmax, bmin, fmt, parseMoney } from './decimal'
import { CalcBlockedError, addMonths, isoDate, monthIndex, monthKey, parseDateStrict } from './arrears-common'

export const MAX_PLANS = 1000
export const MAX_HORIZON = 60

export type Agreement = 'confirmed' | 'to_negotiate' | 'simulation'
export type Control = 'SOLDÉ' | 'HORS PRÉVISIONNEL' | 'MENSUALITÉ NULLE' | 'RESTE APRÈS HORIZON' | 'OK'

export interface PlanInput {
  debtId: string
  organism: string
  type: 'fiscal' | 'social' | 'other'
  origin?: 'historical_notice' | 'payroll'
  balance: string
  frozenBalance?: string | null
  startDate: string
  durationMonths: number
  periodicityMonths: 1 | 3 | 6 | 12
  convenedInstallment?: string | null
  agreement: Agreement
}

export interface PlanParams {
  forecastStart: string
  horizonMonths: number
  scope: 'all' | 'confirmed_only'
}

export interface PlanResult {
  debtId: string
  organism: string
  origin?: 'historical_notice' | 'payroll'
  type: string
  agreementStatus: string
  base: string
  installmentCount: number
  indicativeInstallment: string
  installment: string
  contractEndDate: string
  firstDebitMonth: string | null
  schedule: Record<string, string>
  scheduled: string
  remainder: string
  lastPaymentMonth: string | null
  control: Control
}

export interface PlansResult {
  provisional: false
  simulation: true
  forecastStart: string
  horizonMonths: number
  months: string[]
  plans: PlanResult[]
  totalsByMonth: Record<string, { fiscal: string; social: string; other: string; total: string }>
  totals: { base: string; scheduled: string; remainder: string }
  methodology: string[]
  warnings: string[]
}

function ceilDiv(value: bigint, divisor: bigint): bigint {
  if (divisor <= ZERO) throw new DecimalError('Diviseur nul ou négatif.')
  return (value + divisor - BigInt(1)) / divisor
}

function ceilToXof(value: bigint, count: number): bigint {
  return ceilDiv(value, BigInt(count) * BigInt(100000000000000)) *
    BigInt(100000000000000)
}

function run(plans: PlanInput[], params: PlanParams): PlansResult {
  if (!Array.isArray(plans) || plans.length === 0) {
    throw new CalcBlockedError(['Aucun plan à simuler.'])
  }
  if (plans.length > MAX_PLANS) throw new CalcBlockedError(['Nombre maximal de plans dépassé.'])
  if (!Number.isInteger(params.horizonMonths) ||
      params.horizonMonths < 1 || params.horizonMonths > MAX_HORIZON) {
    throw new CalcBlockedError(['Horizon invalide : 1 à 60 mois.'])
  }
  if (params.scope !== 'all' && params.scope !== 'confirmed_only') {
    throw new CalcBlockedError(['Périmètre du plan invalide.'])
  }

  const forecastStart = parseDateStrict(params.forecastStart + '-01', 'Début prévisionnel')
  const forecastIndex = monthIndex(forecastStart)
  const months: string[] = []
  for (let i = 0; i < params.horizonMonths; i++) months.push(monthKey(forecastIndex + i))

  const seen: Record<string, boolean> = {}
  const monthly: Record<string, { fiscal: bigint; social: bigint; other: bigint }> = {}
  months.forEach(function (m) { monthly[m] = { fiscal: ZERO, social: ZERO, other: ZERO } })

  const output: PlanResult[] = []
  let totalBase = ZERO
  let totalScheduled = ZERO
  let totalRemainder = ZERO

  plans.forEach(function (plan) {
    const id = plan.debtId
    if (!id || seen[id]) throw new CalcBlockedError(['Dette absente ou plan en doublon : ' + id])
    seen[id] = true
    if (['fiscal', 'social', 'other'].indexOf(plan.type) < 0) {
      throw new CalcBlockedError([id + ' : type de dette invalide.'])
    }
    if ([1, 3, 6, 12].indexOf(plan.periodicityMonths) < 0) {
      throw new CalcBlockedError([id + ' : périodicité invalide.'])
    }
    if (!Number.isInteger(plan.durationMonths) || plan.durationMonths < 1 ||
        plan.durationMonths > 120 || plan.durationMonths % plan.periodicityMonths !== 0) {
      throw new CalcBlockedError([id + ' : durée invalide ou non multiple de la périodicité.'])
    }
    if (['confirmed', 'to_negotiate', 'simulation'].indexOf(plan.agreement) < 0) {
      throw new CalcBlockedError([id + ' : statut d’accord obligatoire.'])
    }

    const start = parseDateStrict(plan.startDate, id + ' début du plan')
    const startIndex = monthIndex(start)
    const balance = parseMoney(plan.balance, id + ' solde')
    const frozen = plan.frozenBalance === undefined || plan.frozenBalance === null
      ? null : parseMoney(plan.frozenBalance, id + ' solde figé')
    const base = frozen === null ? balance : frozen

    const step = plan.periodicityMonths
    const count = plan.durationMonths / step
    const indicative = base > ZERO ? ceilToXof(base, count) : ZERO
    const agreed = plan.convenedInstallment === undefined || plan.convenedInstallment === null
      ? null : parseMoney(plan.convenedInstallment, id + ' mensualité convenue')
    const installment = agreed === null ? indicative : agreed

    const effectiveCount = installment > ZERO && base > ZERO
      ? Number(ceilDiv(base, installment)) : count
    const contractEnd = addMonths(start, effectiveCount * step)

    const excluded = params.scope === 'confirmed_only' && plan.agreement !== 'confirmed'

    // L'ancrage reste la date initiale du plan.
    // On saute les échéances antérieures au prévisionnel sans décaler la périodicité.
    const firstDueNumber = Math.max(
      0,
      Math.ceil((forecastIndex - startIndex) / step)
    )
    const firstDueIndex = startIndex + firstDueNumber * step
    // Un contrat arrivé à son terme ne génère plus d'échéance.
    const firstDue = excluded || firstDueNumber >= effectiveCount
      ? null
      : firstDueIndex

    const schedule: Record<string, string> = {}
    let scheduled = ZERO
    let lastPayment: string | null = null

    months.forEach(function (month, offset) {
      const index = forecastIndex + offset
      let payment = ZERO
      if (firstDue !== null && index >= firstDue && (index - startIndex) % step === 0) {
        const installmentNumber = Math.floor((index - startIndex) / step)
        // Ne jamais générer d'échéance au-delà du nombre prévu au contrat.
        if (installmentNumber < effectiveCount) {
          payment = bmin(
            installment,
            bmax(ZERO, base - installment * BigInt(installmentNumber))
          )
        }
      }
      schedule[month] = fmt(payment)
      scheduled += payment
      if (payment > ZERO) {
        lastPayment = month
        if (plan.type === 'fiscal') monthly[month].fiscal += payment
        else if (plan.type === 'social') monthly[month].social += payment
        else monthly[month].other += payment
      }
    })

    const remainder = bmax(ZERO, base - scheduled)
    const control: Control = base === ZERO ? 'SOLDÉ'
      : (firstDue === null ? 'HORS PRÉVISIONNEL'
        : (installment <= ZERO ? 'MENSUALITÉ NULLE'
          : (remainder > ZERO ? 'RESTE APRÈS HORIZON' : 'OK')))

    output.push({
      debtId: id,
      organism: plan.organism,
      origin: plan.origin,
      type: plan.type,
      agreementStatus: plan.agreement === 'confirmed' ? 'Accord confirmé'
        : (plan.agreement === 'to_negotiate' ? 'À négocier' : 'Simulation seulement'),
      base: fmt(base),
      installmentCount: count,
      indicativeInstallment: fmt(indicative),
      installment: fmt(installment),
      contractEndDate: isoDate(contractEnd),
      firstDebitMonth: firstDue === null ? null : monthKey(firstDue),
      schedule: schedule,
      scheduled: fmt(scheduled),
      remainder: fmt(remainder),
      lastPaymentMonth: lastPayment,
      control: control
    })

    totalBase += base
    totalScheduled += scheduled
    totalRemainder += remainder
  })

  const totalsByMonth: PlansResult['totalsByMonth'] = {}
  months.forEach(function (month) {
    const values = monthly[month]
    totalsByMonth[month] = {
      fiscal: fmt(values.fiscal),
      social: fmt(values.social),
      other: fmt(values.other),
      total: fmt(values.fiscal + values.social + values.other)
    }
  })

  const warnings: string[] = []
  output.forEach(function (plan) {
    if (plan.agreementStatus !== 'Accord confirmé') {
      warnings.push(plan.debtId + ' : plan non confirmé, projection hypothétique.')
    }
    if (plan.remainder !== '0') {
      warnings.push(plan.debtId + ' : solde restant après horizon : ' + plan.remainder + ' XOF.')
    }
  })

  return {
    provisional: false,
    simulation: true,
    forecastStart: params.forecastStart,
    horizonMonths: params.horizonMonths,
    months: months,
    plans: output,
    totalsByMonth: totalsByMonth,
    totals: {
      base: fmt(totalBase),
      scheduled: fmt(totalScheduled),
      remainder: fmt(totalRemainder)
    },
    methodology: [
      'La mensualité indicative est arrondie à l’XOF supérieur.',
      'Le solde figé est utilisé pour calculer la mensualité et l’échéancier.',
      'Les périodicités trimestrielle, semestrielle et annuelle sont des extensions de simulation, non une formule Excel V8.',
      'Les échéances restent ancrées sur la date initiale du plan.'
    ],
    warnings: warnings
  }
}

export function buildPlans(plans: PlanInput[], params: PlanParams): PlansResult {
  try {
    return run(plans, params)
  } catch (error) {
    if (error instanceof DecimalError) throw new CalcBlockedError([error.message])
    throw error
  }
}
