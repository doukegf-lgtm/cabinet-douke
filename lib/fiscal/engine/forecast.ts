import { DecimalError, ZERO, bmax, fmt, parseMoney, parseRate } from './decimal'
import { CalcBlockedError } from './arrears-common'
import type { PlansResult } from './plan'

export interface CashMonth {
  inflows: string
  currentTaxes: string
  currentSocial: string
  netSalaries: string
  otherOutflows: string
}

export interface ForecastInput {
  plans: PlansResult
  openingArrears: string
  openingCnssPrincipal: string
  accrueCnssMajoration: boolean
  cnssMonthlyRate?: string | null
  openingCash?: string | null
  cash?: Record<string, CashMonth | undefined>
  manualAdjustments?: Record<string, string | null | undefined>
}

export type Alert =
  | 'RENSEIGNER TRÉSORERIE DÉBUT'
  | 'TRÉSORERIE INCONNUE'
  | 'DÉFICIT DE TRÉSORERIE'
  | 'ARRIÉRÉS RESTANTS'
  | 'À SURVEILLER'

export interface ForecastMonth {
  month: string
  arrearsStart: string
  cnssPrincipalStart: string
  cnssMajoration: string
  adjustments: string
  planPayments: { fiscal: string; social: string; other: string; total: string }
  cnssPayments: string
  arrearsEnd: string
  cashStart: string | null
  cashEnd: string | null
  alert: Alert
}

export interface ForecastResult {
  provisional: false
  hypothetical: true
  months: ForecastMonth[]
  summary: {
    lowestCash: string | null
    deficitMonths: number
    majorationTotal: string
    arrearsEnd: string
  }
  warnings: string[]
}

const SCALE = BigInt('100000000000000')
const RATE_SCALE = BigInt(1000000)

/** ROUND(x,0) explicite du classeur : moitié vers le haut, en XOF entiers. */
function multiplyRateRounded(amount: bigint, rate: bigint): bigint {
  const product = amount * rate
  const denominator = SCALE * RATE_SCALE
  return ((product + denominator / BigInt(2)) / denominator) * SCALE
}

function run(input: ForecastInput): ForecastResult {
  if (!input || !input.plans || !Array.isArray(input.plans.months)) {
    throw new CalcBlockedError(['Échéancier absent.'])
  }
  if (typeof input.accrueCnssMajoration !== 'boolean') {
    throw new CalcBlockedError(['Choix de majoration CNSS obligatoire.'])
  }

  let rate = ZERO
  if (input.accrueCnssMajoration) {
    if (input.cnssMonthlyRate === undefined || input.cnssMonthlyRate === null) {
      throw new CalcBlockedError(['Taux mensuel CNSS validé requis.'])
    }
    rate = parseRate(input.cnssMonthlyRate, 'taux mensuel CNSS')
  }

  let arrears = parseMoney(input.openingArrears, 'arriérés initiaux')
  let cnssPrincipal = parseMoney(input.openingCnssPrincipal, 'principal CNSS initial')
  let cash: bigint | null = input.openingCash === undefined || input.openingCash === null
    ? null : parseMoney(input.openingCash, 'trésorerie initiale')

  const cashInitiallyKnown = cash !== null
  let cashKnown = cashInitiallyKnown
  const cnssPayments: Record<string, bigint> = {}

  input.plans.plans.forEach(function (plan) {
    // Le classeur recherche les natures contenant CNSS, pas uniquement l'égalité stricte.
    if ((plan.organism || '').toUpperCase().indexOf('CNSS') >= 0) {
      Object.keys(plan.schedule).forEach(function (month) {
        cnssPayments[month] = (cnssPayments[month] || ZERO) +
          parseMoney(plan.schedule[month], 'paiement CNSS ' + month)
      })
    }
  })

  const output: ForecastMonth[] = []
  let majorationTotal = ZERO
  let lowestCash: bigint | null = null
  let deficitMonths = 0

  input.plans.months.forEach(function (month) {
    const totals = input.plans.totalsByMonth[month]
    if (!totals) throw new CalcBlockedError(['Totaux du plan absents pour ' + month])

    const fiscal = parseMoney(totals.fiscal, month + ' fiscal')
    const social = parseMoney(totals.social, month + ' social')
    const other = parseMoney(totals.other, month + ' autres')
    const paid = fiscal + social + other
    const cnssPaid = cnssPayments[month] || ZERO

    const arrearsStart = arrears
    const cnssStart = cnssPrincipal
    const majoration = input.accrueCnssMajoration
      ? multiplyRateRounded(cnssPrincipal, rate) : ZERO

    const adjustmentValue = input.manualAdjustments
      ? input.manualAdjustments[month] : undefined
    const adjustment = adjustmentValue === undefined || adjustmentValue === null
      ? ZERO : parseMoney(adjustmentValue, month + ' ajustement')

    const arrearsEnd = bmax(ZERO, arrearsStart + majoration + adjustment - paid)

    const cashStart = cashKnown ? cash : null
    const cashInput = input.cash ? input.cash[month] : undefined
    let cashEnd: bigint | null = null

    if (cashKnown && cashInput) {
      const outflows =
        parseMoney(cashInput.currentTaxes, month + ' impôts courants') +
        parseMoney(cashInput.currentSocial, month + ' cotisations courantes') +
        parseMoney(cashInput.netSalaries, month + ' salaires') +
        parseMoney(cashInput.otherOutflows, month + ' autres sorties') + paid

      cashEnd = (cash as bigint) +
        parseMoney(cashInput.inflows, month + ' encaissements') - outflows
      cash = cashEnd
    } else {
      cashKnown = false
    }

    let alert: Alert
    if (!cashInitiallyKnown) alert = 'RENSEIGNER TRÉSORERIE DÉBUT'
    else if (cashEnd === null) alert = 'TRÉSORERIE INCONNUE'
    else if (cashEnd < ZERO) alert = 'DÉFICIT DE TRÉSORERIE'
    else if (arrearsEnd > ZERO) alert = 'ARRIÉRÉS RESTANTS'
    else alert = 'À SURVEILLER'

    if (cashEnd !== null) {
      if (lowestCash === null || cashEnd < lowestCash) lowestCash = cashEnd
      if (cashEnd < ZERO) deficitMonths++
    }

    output.push({
      month: month,
      arrearsStart: fmt(arrearsStart),
      cnssPrincipalStart: fmt(cnssStart),
      cnssMajoration: fmt(majoration),
      adjustments: fmt(adjustment),
      planPayments: {
        fiscal: fmt(fiscal),
        social: fmt(social),
        other: fmt(other),
        total: fmt(paid)
      },
      cnssPayments: fmt(cnssPaid),
      arrearsEnd: fmt(arrearsEnd),
      cashStart: cashStart === null ? null : fmt(cashStart),
      cashEnd: cashEnd === null ? null : fmt(cashEnd),
      alert: alert
    })

    arrears = arrearsEnd
    cnssPrincipal = bmax(ZERO, cnssPrincipal - cnssPaid)
    majorationTotal += majoration
  })

  const warnings = ['Prévisionnel hypothétique : ne constitue ni une liquidation ni un engagement.']
  if (!cashInitiallyKnown) warnings.push('Trésorerie initiale non renseignée.')
  if (cashInitiallyKnown && !cashKnown) warnings.push('Projection de trésorerie interrompue à partir du premier mois incomplet.')

  return {
    provisional: false,
    hypothetical: true,
    months: output,
    summary: {
      lowestCash: lowestCash === null ? null : fmt(lowestCash),
      deficitMonths: deficitMonths,
      majorationTotal: fmt(majorationTotal),
      arrearsEnd: fmt(arrears)
    },
    warnings: warnings
  }
}

export function buildForecast(input: ForecastInput): ForecastResult {
  try {
    return run(input)
  } catch (error) {
    if (error instanceof DecimalError) throw new CalcBlockedError([error.message])
    throw error
  }
}
