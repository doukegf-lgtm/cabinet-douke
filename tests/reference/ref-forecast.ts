// RÉFÉRENCE INDÉPENDANTE (tests uniquement) — ne pas importer depuis le code applicatif. Sert au test différentiel contre les moteurs du dépôt.
import { DecimalError, ZERO, bmax, fmt, mulRate, parseRate } from '../../lib/fiscal/engine/decimal'
import { parseAmount, roundHalfUpToUnit } from './ref-core'
import { CalcBlockedError } from './ref-core'
import type { PlansResult } from './ref-plan'

/**
 * Prévisionnel d'arriérés et de trésorerie (feuille Previsionnel du classeur V8), exact. HYPOTHÈSES — non engageant.
 *  arriérés fin = max(0, arriérés début + nouveaux arriérés - paiements du plan)
 *  nouveaux arriérés = majoration CNSS courue (optionnelle, explicite) + ajustements saisis
 *  majoration CNSS courue = ARRONDI( solde de principal CNSS en début de mois x taux mensuel ) — taux = règle validée du référentiel
 *  trésorerie : si les données de trésorerie d'un mois manquent, elle reste INCONNUE (jamais zéro) pour ce mois et les suivants
 */
export interface CashMonth { inflows: string; currentTaxes: string; currentSocial: string; netSalaries: string; otherOutflows: string }
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
export type Alert = 'RENSEIGNER TRÉSORERIE DÉBUT' | 'TRÉSORERIE INCONNUE' | 'DÉFICIT DE TRÉSORERIE' | 'ARRIÉRÉS RESTANTS' | 'À SURVEILLER'
export interface ForecastMonth {
  month: string; arrearsStart: string; cnssPrincipalStart: string; cnssMajoration: string; adjustments: string
  planPayments: { fiscal: string; social: string; other: string; total: string }; cnssPayments: string
  arrearsEnd: string; cashStart: string | null; cashEnd: string | null; alert: Alert
}
export interface ForecastResult {
  provisional: false; hypothetical: true; months: ForecastMonth[]
  summary: { lowestCash: string | null; deficitMonths: number; majorationTotal: string; arrearsEnd: string }
  warnings: string[]
}

export function buildForecast(f: ForecastInput): ForecastResult {
  try { return run(f) } catch (e) {
    if (e instanceof DecimalError) throw new CalcBlockedError([e.message])
    throw e
  }
}

function run(f: ForecastInput): ForecastResult {
  if (!f || !f.plans || !Array.isArray(f.plans.months)) throw new CalcBlockedError(['Échéancier absent.'])
  if (typeof f.accrueCnssMajoration !== 'boolean') throw new CalcBlockedError(['Majoration CNSS courue : choix (oui/non) à faire explicitement.'])
  let rate = ZERO
  if (f.accrueCnssMajoration) {
    if (f.cnssMonthlyRate === undefined || f.cnssMonthlyRate === null) throw new CalcBlockedError(['Taux mensuel de majoration CNSS requis (règle validée du référentiel).'])
    rate = parseRate(f.cnssMonthlyRate, 'taux mensuel CNSS')
  }
  let arrears = parseAmount(f.openingArrears, 'arriérés initiaux')
  let cnss = parseAmount(f.openingCnssPrincipal, 'principal CNSS initial')
  let cash: bigint | null = f.openingCash === undefined || f.openingCash === null ? null : parseAmount(f.openingCash, 'trésorerie initiale')
  const cashStartKnown = cash !== null
  const cnssByMonth: Record<string, bigint> = {}
  f.plans.plans.forEach(pl => { if (pl.organism === 'CNSS') Object.keys(pl.schedule).forEach(m => { cnssByMonth[m] = (cnssByMonth[m] || ZERO) + parseAmount(pl.schedule[m], 'échéance CNSS') }) })

  const out: ForecastMonth[] = []
  let majTotal = ZERO, lowest: bigint | null = null, deficit = 0
  let cashKnown = cashStartKnown
  for (const m of f.plans.months) {
    const t = f.plans.totalsByMonth[m]
    const fis = parseAmount(t.fiscal, 'fiscal'), soc = parseAmount(t.social, 'social'), oth = parseAmount(t.other, 'autres')
    const paid = fis + soc + oth
    const u = cnssByMonth[m] || ZERO
    const maj = f.accrueCnssMajoration ? roundHalfUpToUnit(mulRate(cnss, rate, m + ' majoration CNSS')) : ZERO
    const adjRaw = f.manualAdjustments ? f.manualAdjustments[m] : undefined
    const adj = adjRaw === undefined || adjRaw === null ? ZERO : parseAmount(adjRaw, m + ' ajustement')
    const start = arrears
    const end = bmax(ZERO, start + maj + adj - paid)
    const cnssStart = cnss

    const cm = f.cash ? f.cash[m] : undefined
    const cashStart: bigint | null = cashKnown ? cash : null
    let cashEnd: bigint | null = null
    if (cashKnown && cm) {
      const out5 = parseAmount(cm.currentTaxes, m + ' impôts courants') + parseAmount(cm.currentSocial, m + ' cotisations courantes') + parseAmount(cm.netSalaries, m + ' salaires nets') + parseAmount(cm.otherOutflows, m + ' autres sorties') + paid
      cashEnd = (cash as bigint) + parseAmount(cm.inflows, m + ' encaissements') - out5
      cash = cashEnd
    } else cashKnown = false
    let alert: Alert
    if (!cashStartKnown) alert = 'RENSEIGNER TRÉSORERIE DÉBUT'
    else if (cashEnd === null) alert = 'TRÉSORERIE INCONNUE'
    else if (cashEnd < ZERO) alert = 'DÉFICIT DE TRÉSORERIE'
    else if (end > ZERO) alert = 'ARRIÉRÉS RESTANTS'
    else alert = 'À SURVEILLER'
    if (cashEnd !== null) { if (lowest === null || cashEnd < lowest) lowest = cashEnd; if (cashEnd < ZERO) deficit++ }
    out.push({ month: m, arrearsStart: fmt(start), cnssPrincipalStart: fmt(cnssStart), cnssMajoration: fmt(maj), adjustments: fmt(adj),
      planPayments: { fiscal: fmt(fis), social: fmt(soc), other: fmt(oth), total: fmt(paid) }, cnssPayments: fmt(u),
      arrearsEnd: fmt(end), cashStart: cashStart === null ? null : fmt(cashStart), cashEnd: cashEnd === null ? null : fmt(cashEnd), alert })
    arrears = end; cnss = bmax(ZERO, cnss - u); majTotal += maj
  }
  const warnings = ['Prévisionnel hypothétique : ne constitue ni une liquidation ni un engagement.']
  if (!cashStartKnown) warnings.push('Trésorerie initiale non renseignée : aucune projection de trésorerie.')
  return { provisional: false, hypothetical: true, months: out,
    summary: { lowestCash: lowest === null ? null : fmt(lowest), deficitMonths: deficit, majorationTotal: fmt(majTotal), arrearsEnd: fmt(arrears) }, warnings }
}
