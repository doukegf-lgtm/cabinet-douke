// RÉFÉRENCE INDÉPENDANTE (tests uniquement) — ne pas importer depuis le code applicatif. Sert au test différentiel contre les moteurs du dépôt.
import { DecimalError, ZERO, bmax, bmin, fmt } from '../../lib/fiscal/engine/decimal'
import { ceilCount, ceilDivToUnit, parseAmount } from './ref-core'
import { CalcBlockedError, isoDate, parseDateStrict, type YMD } from './ref-core'

/**
 * Échéancier d'apurement (feuille Plan_arrieres du classeur V8), exact. SIMULATION : aucun accord n'est présumé.
 *  base = solde figé à l'entrée dans le plan s'il existe, sinon solde estimatif
 *  mensualité indicative = base / nombre d'échéances arrondi À L'XOF SUPÉRIEUR (ROUNDUP du classeur) ; mensualité retenue = convenue si saisie
 *  paiement du mois n (depuis le premier prélèvement) = min(mensualité, max(0, base - mensualité x n))
 *  premier prélèvement = max(début du plan, début du prévisionnel) ; exclu si « accords confirmés seulement » et accord non confirmé
 * Écart au classeur : le classeur calcule la mensualité sur le solde figé mais l'échéancier sur le solde brut ; ce moteur
 * utilise le solde figé partout (cohérence). La périodicité trimestrielle/semestrielle/annuelle n'existe pas dans le classeur :
 * simulation d'extension, à valider.
 */
export const MAX_PLANS = 1000
export const MAX_HORIZON = 60
export type Agreement = 'confirmed' | 'to_negotiate' | 'simulation'
export type Control = 'SOLDÉ' | 'HORS PRÉVISIONNEL' | 'MENSUALITÉ NULLE' | 'RESTE APRÈS HORIZON' | 'OK'

export interface PlanInput {
  debtId: string; organism: string; type: 'fiscal' | 'social' | 'other'
  balance: string; frozenBalance?: string | null
  startDate: string; durationMonths: number; periodicityMonths: 1 | 3 | 6 | 12
  convenedInstallment?: string | null; agreement: Agreement
}
export interface PlanParams { forecastStart: string; horizonMonths: number; scope: 'all' | 'confirmed_only' }
export interface PlanResult {
  debtId: string; organism: string; type: string; agreementStatus: string
  base: string; installmentCount: number; indicativeInstallment: string; installment: string
  contractEndDate: string; firstDebitMonth: string | null
  schedule: Record<string, string>; scheduled: string; remainder: string
  lastPaymentMonth: string | null; control: Control
}
export interface PlansResult {
  provisional: false; simulation: true; forecastStart: string; horizonMonths: number; months: string[]
  plans: PlanResult[]
  totalsByMonth: Record<string, { fiscal: string; social: string; other: string; total: string }>
  totals: { base: string; scheduled: string; remainder: string }
  methodology: string[]
  warnings: string[]
}

const mIdx = (y: number, m: number) => y * 12 + (m - 1)
const key = (i: number) => { const y = Math.floor(i / 12), m = (i % 12) + 1; return y + '-' + (m < 10 ? '0' : '') + m }
function parseYm(s: string, l: string): number {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(s || '')
  if (!m) throw new CalcBlockedError([l + ' : mois invalide "' + s + '".'])
  return mIdx(parseInt(m[1], 10), parseInt(m[2], 10))
}
const dim = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()
/** EDATE d'Excel : même jour du mois, ramené au dernier jour du mois si nécessaire. */
export function addMonths(d: YMD, n: number): YMD {
  const i = mIdx(d.y, d.m) + n
  const y = Math.floor(i / 12), m = (i % 12) + 1
  return { y, m, d: Math.min(d.d, dim(y, m)) }
}

export function buildPlans(plans: PlanInput[], p: PlanParams): PlansResult {
  try { return run(plans, p) } catch (e) {
    if (e instanceof DecimalError) throw new CalcBlockedError([e.message])
    throw e
  }
}

function run(plans: PlanInput[], p: PlanParams): PlansResult {
  if (!Array.isArray(plans) || plans.length === 0) throw new CalcBlockedError(['Aucun plan à simuler.'])
  if (plans.length > MAX_PLANS) throw new CalcBlockedError(['Capacité dépassée : ' + MAX_PLANS + ' plans maximum.'])
  if (!Number.isInteger(p.horizonMonths) || p.horizonMonths < 1 || p.horizonMonths > MAX_HORIZON) throw new CalcBlockedError(['Horizon de prévision invalide (1..' + MAX_HORIZON + ' mois).'])
  if (p.scope !== 'all' && p.scope !== 'confirmed_only') throw new CalcBlockedError(['Périmètre « tous / accords confirmés seulement » à choisir explicitement.'])
  const fs = parseYm(p.forecastStart, 'début du prévisionnel')
  const months: string[] = []
  for (let i = 0; i < p.horizonMonths; i++) months.push(key(fs + i))

  const seen: Record<string, true> = {}
  const out: PlanResult[] = []
  const tm: Record<string, { f: bigint; s: bigint; o: bigint }> = {}
  months.forEach(m => { tm[m] = { f: ZERO, s: ZERO, o: ZERO } })
  let tBase = ZERO, tSched = ZERO, tRem = ZERO

  for (const pl of plans) {
    const id = pl.debtId
    if (typeof id !== 'string' || !id.trim()) throw new CalcBlockedError(['Identifiant de dette obligatoire sur chaque plan.'])
    if (seen[id]) throw new CalcBlockedError(['Plan en doublon pour la dette ' + id + '.'])
    seen[id] = true
    if (pl.agreement !== 'confirmed' && pl.agreement !== 'to_negotiate' && pl.agreement !== 'simulation') throw new CalcBlockedError([id + ' : statut d\'accord obligatoire.'])
    if (pl.type !== 'fiscal' && pl.type !== 'social' && pl.type !== 'other') throw new CalcBlockedError([id + ' : type de dette obligatoire.'])
    if ([1, 3, 6, 12].indexOf(pl.periodicityMonths) < 0) throw new CalcBlockedError([id + ' : périodicité invalide (1, 3, 6 ou 12 mois).'])
    if (!Number.isInteger(pl.durationMonths) || pl.durationMonths < 1 || pl.durationMonths > 120) throw new CalcBlockedError([id + ' : durée invalide (1..120 mois).'])
    if (pl.durationMonths % pl.periodicityMonths !== 0) throw new CalcBlockedError([id + ' : la durée doit être un multiple de la périodicité.'])
    const step = pl.periodicityMonths
    const count = pl.durationMonths / step
    const start = parseDateStrict(pl.startDate, id + ' début du plan')
    const balance = parseAmount(pl.balance, id + ' solde')
    const frozen = pl.frozenBalance === undefined || pl.frozenBalance === null ? null : parseAmount(pl.frozenBalance, id + ' solde figé')
    const base = frozen !== null ? frozen : balance
    const indicative = base > ZERO ? ceilDivToUnit(base, count) : ZERO
    const convened = pl.convenedInstallment === undefined || pl.convenedInstallment === null ? null : parseAmount(pl.convenedInstallment, id + ' mensualité convenue')
    const K = convened !== null ? convened : indicative
    const endMonths = convened !== null && convened > ZERO && base > ZERO ? ceilCount(base, convened) * step : pl.durationMonths
    const contractEnd = addMonths(start, endMonths)

    const excluded = p.scope === 'confirmed_only' && pl.agreement !== 'confirmed'
    const startIdx = mIdx(start.y, start.m)
    const q = excluded ? null : Math.max(startIdx, fs)
    const schedule: Record<string, string> = {}
    let sum = ZERO
    let last: string | null = null
    for (let i = 0; i < p.horizonMonths; i++) {
      const idx = fs + i
      let pay = ZERO
      if (q !== null && idx >= q && (idx - q) % step === 0) {
        const inst = (idx - q) / step
        pay = bmin(K, bmax(ZERO, base - K * BigInt(inst)))
      }
      schedule[months[i]] = fmt(pay)
      sum += pay
      if (pay > ZERO) {
        last = months[i]
        const t = tm[months[i]]
        if (pl.type === 'fiscal') t.f += pay; else if (pl.type === 'social') t.s += pay; else t.o += pay
      }
    }
    const remainder = bmax(ZERO, base - sum)
    const control: Control = base === ZERO ? 'SOLDÉ' : (q === null ? 'HORS PRÉVISIONNEL' : (K <= ZERO ? 'MENSUALITÉ NULLE' : (remainder > ZERO ? 'RESTE APRÈS HORIZON' : 'OK')))
    out.push({
      debtId: id, organism: pl.organism, type: pl.type,
      agreementStatus: pl.agreement === 'confirmed' ? 'Accord confirmé' : (pl.agreement === 'to_negotiate' ? 'À négocier' : 'Simulation seulement'),
      base: fmt(base), installmentCount: count, indicativeInstallment: fmt(indicative), installment: fmt(K),
      contractEndDate: isoDate(contractEnd), firstDebitMonth: q === null ? null : key(q), schedule, scheduled: fmt(sum), remainder: fmt(remainder),
      lastPaymentMonth: last, control,
    })
    tBase += base; tSched += sum; tRem += remainder
  }
  const totalsByMonth: PlansResult['totalsByMonth'] = {}
  months.forEach(m => { const t = tm[m]; totalsByMonth[m] = { fiscal: fmt(t.f), social: fmt(t.s), other: fmt(t.o), total: fmt(t.f + t.s + t.o) } })
  const warnings: string[] = []
  const nonConfirmed = out.filter(x => x.agreementStatus !== 'Accord confirmé').length
  if (nonConfirmed > 0) warnings.push(nonConfirmed + ' plan(s) sans accord confirmé : projection hypothétique, à ne pas présenter comme un engagement.')
  out.filter(x => x.control === 'RESTE APRÈS HORIZON').forEach(x => warnings.push('Dette ' + x.debtId + ' : ' + x.remainder + ' XOF restent dus après ' + p.horizonMonths + ' mois.'))
  return {
    provisional: false, simulation: true, forecastStart: p.forecastStart, horizonMonths: p.horizonMonths, months, plans: out, totalsByMonth,
    totals: { base: fmt(tBase), scheduled: fmt(tSched), remainder: fmt(tRem) },
    methodology: ['Mensualité arrondie à l\'XOF supérieur (règle du classeur) — décision d\'arrondi à valider.',
      'Échéancier calculé sur le solde figé ; le classeur le calculait sur le solde brut (incohérence corrigée).',
      'Périodicités trimestrielle, semestrielle et annuelle : extension de simulation non prévue par le classeur.'],
    warnings,
  }
}

/** Compare plusieurs durées/périodicités pour un même solde (simulation, aucune écriture). */
export function comparePlanOptions(base: string, startDate: string, options: Array<{ durationMonths: number; periodicityMonths: 1 | 3 | 6 | 12 }>): Array<{
  durationMonths: number; periodicityMonths: number; installmentCount: number; installment: string; effectiveInstallments: number; contractEndDate: string; effectiveLastDate: string
}> {
  try {
    const b = parseAmount(base, 'solde'); const start = parseDateStrict(startDate, 'début du plan')
    if (!Array.isArray(options) || options.length === 0) throw new CalcBlockedError(['Aucune option à comparer.'])
    return options.map(o => {
      if ([1, 3, 6, 12].indexOf(o.periodicityMonths) < 0 || !Number.isInteger(o.durationMonths) || o.durationMonths < 1 || o.durationMonths > 120 || o.durationMonths % o.periodicityMonths !== 0)
        throw new CalcBlockedError(['Option invalide (durée multiple de la périodicité, 1..120 mois).'])
      const count = o.durationMonths / o.periodicityMonths
      const k = b > ZERO ? ceilDivToUnit(b, count) : ZERO
      const eff = b > ZERO ? ceilCount(b, k) : 0
      return { durationMonths: o.durationMonths, periodicityMonths: o.periodicityMonths, installmentCount: count, installment: fmt(k), effectiveInstallments: eff,
        contractEndDate: isoDate(addMonths(start, o.durationMonths)), effectiveLastDate: eff === 0 ? isoDate(start) : isoDate(addMonths(start, (eff - 1) * o.periodicityMonths)) }
    })
  } catch (e) { if (e instanceof DecimalError) throw new CalcBlockedError([e.message]); throw e }
}
