import { DecimalError, ZERO, bmax, fmt, mulRate, parseMoney, parseRate } from './decimal'
import { CalcBlockedError, applyMonthlyMinimum, delayAt, dueDateNextMonth, isoDate, parseDateStrict } from './penalty-core'

/**
 * Moteurs AIB et retenues à la source (feuilles AIB et Retenues du classeur V8), exacts.
 *  AIB     : base x taux ; dû net = max(0, AIB - reversé - crédit justifié)
 *  Retenue : base x taux ; dû net = max(0, retenue - reversée)
 *  Pénalité art. 491 sur le dû net si calcDate > échéance (jour `dueDay` du mois suivant) :
 *    taux, ou taux majoré si mois PLEINS > seuil ; minimum appliqué par mois sur la somme du mois.
 * Taux par défaut = règles validées du référentiel ; un taux saisi sur la ligne reste possible mais est signalé.
 * Pas d'intérêt art. 488 sur l'AIB ni sur les retenues (règle du classeur).
 */
export const MAX_WH_LINES = 500

export interface Penalty491Rules { rate491: string; rate491Raised: string; raisedAfterFullMonths: number; min491Monthly: string }
export type AibOpType = 'import' | 'services' | 'wholesale_goods' | 'goods_supply'
export interface AibRules extends Penalty491Rules { importRate: string; noIfuRate: string; servicesIfuRate: string; goodsIfuRate: string; dueDay: number; legalRef: string }
export interface RetenueRules extends Penalty491Rules { nonResidentNaturalRate: string; nonResidentLegalRate: string; dueDay: number; legalRef: string }

export interface AibLine {
  reference: string; date: string; opType: AibOpType; hasIfu: boolean; base: string
  rate?: string | null; reversed: string; credit: string; suffered?: string | null
  provenance: 'real' | 'estimated' | 'flat_split'
}
export interface RetenueLine {
  reference: string; date: string; kind: 'non_resident' | 'other'; payeeType?: 'natural' | 'legal' | null
  exemptionClaimed: boolean; base: string; rate?: string | null; reversed: string
  provenance: 'real' | 'estimated' | 'flat_split'
}

export interface WhLineResult {
  reference: string; date: string; provenance: string
  rateApplied: string; rateSource: 'line' | 'rule'
  calculated: string; reversed: string; credit: string | null; suffered: string | null
  netDue: string; settled: string
  dueDate: string; overdue: boolean | null; fullMonths: number | null
  rate491Applied: string | null; penalty491: string | null
  warnings: string[]
}
export interface WhResult {
  provisional: false; kind: 'aib' | 'retenues'; fiscalYear: number; calcDate: string | null
  lines: WhLineResult[]
  by491Month: Record<string, { lineSum: string; applied: string }> | null
  totals: { calculated: string; netDue: string; penalty491: string | null }
  assumptions: string[]
  warnings: string[]
}

interface Core { reference: string; date: string; provenance: string; base: bigint; rate: string; rateSource: 'line' | 'rule'; reversed: bigint; credit: bigint | null; suffered: bigint | null; extraWarnings: string[] }

export function computeAib(lines: AibLine[], rules: AibRules, fiscalYear: number, calcDate: string | null): WhResult {
  try {
    const cores: Core[] = lines.map((l, i) => {
      const id = 'ligne ' + (i + 1) + ' (' + l.reference + ')'
      let rate: string | null = null
      let src: 'line' | 'rule' = 'rule'
      const w: string[] = []
      if (l.rate !== undefined && l.rate !== null) { rate = l.rate; src = 'line'; w.push('Taux saisi sur la ligne (non issu du référentiel) : à justifier') }
      else if (l.opType === 'import') rate = rules.importRate
      else if (l.hasIfu === false) rate = rules.noIfuRate
      else if (l.hasIfu === true && l.opType === 'services') rate = rules.servicesIfuRate
      else if (l.hasIfu === true && (l.opType === 'wholesale_goods' || l.opType === 'goods_supply')) rate = rules.goodsIfuRate
      if (typeof l.hasIfu !== 'boolean') throw new CalcBlockedError([id + ' : IFU (oui/non) à renseigner explicitement.'])
      if (rate === null) throw new CalcBlockedError([id + " : taux AIB à saisir (type d'opération inconnu)."])
      return { reference: l.reference, date: l.date, provenance: l.provenance, base: parseMoney(l.base, id + ' base'), rate, rateSource: src,
        reversed: parseMoney(l.reversed, id + ' AIB reversé'), credit: parseMoney(l.credit, id + ' crédit justifié'),
        suffered: l.suffered === undefined || l.suffered === null ? null : parseMoney(l.suffered, id + ' AIB subi'), extraWarnings: w }
    })
    return settle('aib', cores, rules, rules.dueDay, rules.legalRef, fiscalYear, calcDate)
  } catch (e) { if (e instanceof DecimalError) throw new CalcBlockedError([e.message]); throw e }
}

export function computeRetenues(lines: RetenueLine[], rules: RetenueRules, fiscalYear: number, calcDate: string | null): WhResult {
  try {
    const cores: Core[] = lines.map((l, i) => {
      const id = 'ligne ' + (i + 1) + ' (' + l.reference + ')'
      let rate: string | null = null
      let src: 'line' | 'rule' = 'rule'
      const w: string[] = []
      if (typeof l.exemptionClaimed !== 'boolean') throw new CalcBlockedError([id + ' : convention/exonération (oui/non) à renseigner explicitement.'])
      if (l.rate !== undefined && l.rate !== null) { rate = l.rate; src = 'line'; w.push('Taux saisi sur la ligne (non issu du référentiel) : à justifier') }
      else {
        if (l.exemptionClaimed) throw new CalcBlockedError([id + " : convention/exonération invoquée — le taux applicable doit être saisi explicitement (aucun taux par défaut appliqué)."])
        if (l.kind === 'non_resident' && l.payeeType === 'natural') rate = rules.nonResidentNaturalRate
        else if (l.kind === 'non_resident' && l.payeeType === 'legal') rate = rules.nonResidentLegalRate
      }
      if (rate === null) throw new CalcBlockedError([id + ' : taux de retenue à saisir (type ou bénéficiaire non couvert par une règle validée).'])
      return { reference: l.reference, date: l.date, provenance: l.provenance, base: parseMoney(l.base, id + ' base'), rate, rateSource: src,
        reversed: parseMoney(l.reversed, id + ' retenue reversée'), credit: null, suffered: null, extraWarnings: w }
    })
    return settle('retenues', cores, rules, rules.dueDay, rules.legalRef, fiscalYear, calcDate)
  } catch (e) { if (e instanceof DecimalError) throw new CalcBlockedError([e.message]); throw e }
}

function settle(kind: 'aib' | 'retenues', cores: Core[], pen: Penalty491Rules, dueDay: number, legalRef: string, fiscalYear: number, calcDate: string | null): WhResult {
  if (cores.length === 0) throw new CalcBlockedError(['Aucune ligne.'])
  if (cores.length > MAX_WH_LINES) throw new CalcBlockedError(['Capacité dépassée : ' + MAX_WH_LINES + ' lignes maximum.'])
  if (!legalRef || !legalRef.trim()) throw new CalcBlockedError(['Référence juridique des règles absente.'])
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) throw new CalcBlockedError(["Jour d'échéance hors 1..28."])
  if (!Number.isInteger(pen.raisedAfterFullMonths) || pen.raisedAfterFullMonths < 0) throw new CalcBlockedError(['Seuil de mois pleins invalide.'])
  const r491 = parseRate(pen.rate491, 'taux art. 491'), r491b = parseRate(pen.rate491Raised, 'taux art. 491 majoré')
  const min491 = parseMoney(pen.min491Monthly, 'minimum art. 491')
  const calc = calcDate === null ? null : parseDateStrict(calcDate, 'date de calcul')

  const seen: Record<string, true> = {}
  const out: WhLineResult[] = []
  const monthSum: Record<string, bigint> = {}
  let tCalc = ZERO, tNet = ZERO
  for (const c of cores) {
    if (typeof c.reference !== 'string' || !c.reference.trim()) throw new CalcBlockedError(['Pièce de référence (facture/quittance) obligatoire sur chaque ligne.'])
    if (seen[c.reference]) throw new CalcBlockedError(['Pièce de référence en doublon : ' + c.reference + '.'])
    seen[c.reference] = true
    const d = parseDateStrict(c.date, c.reference + ' date')
    if (d.y !== fiscalYear) throw new CalcBlockedError([c.reference + " : date hors de l'exercice " + fiscalYear + '.'])
    const calculated = mulRate(c.base, parseRate(c.rate, c.reference + ' taux'), c.reference + ' retenue')
    const net = bmax(ZERO, calculated - c.reversed - (c.credit === null ? ZERO : c.credit))
    const settled = calculated - net
    const w = c.extraWarnings.slice()
    if (c.provenance !== 'real') w.push('Donnée ' + (c.provenance === 'estimated' ? 'ESTIMÉE' : 'en RÉPARTITION FORFAITAIRE'))
    const due = dueDateNextMonth(d.y, d.m, dueDay)
    let overdue: boolean | null = null, full: number | null = null, rateApplied: string | null = null, p: bigint | null = null
    if (calc !== null) {
      const dl = delayAt(calc, due)
      overdue = dl.overdue; full = dl.full
      p = ZERO
      if (dl.overdue && net > ZERO) {
        const raised = dl.full > pen.raisedAfterFullMonths
        rateApplied = raised ? pen.rate491Raised : pen.rate491
        p = mulRate(net, raised ? r491b : r491, c.reference + ' art. 491')
      }
      const key = c.date.slice(0, 7)
      monthSum[key] = (monthSum[key] === undefined ? ZERO : monthSum[key]) + p
    }
    out.push({ reference: c.reference, date: c.date, provenance: c.provenance, rateApplied: c.rate, rateSource: c.rateSource,
      calculated: fmt(calculated), reversed: fmt(c.reversed), credit: c.credit === null ? null : fmt(c.credit), suffered: c.suffered === null ? null : fmt(c.suffered),
      netDue: fmt(net), settled: fmt(settled), dueDate: isoDate(due), overdue, fullMonths: full, rate491Applied: rateApplied, penalty491: p === null ? null : fmt(p), warnings: w })
    tCalc += calculated; tNet += net
  }
  let by: WhResult['by491Month'] = null
  let t491: string | null = null
  if (calc !== null) {
    const m = applyMonthlyMinimum(monthSum, min491)
    by = {}
    Object.keys(monthSum).sort().forEach(k => { (by as Record<string, { lineSum: string; applied: string }>)[k] = { lineSum: fmt(monthSum[k]), applied: fmt(m.applied[k]) } })
    t491 = fmt(m.total)
  }
  return {
    provisional: false, kind, fiscalYear, calcDate, lines: out, by491Month: by,
    totals: { calculated: fmt(tCalc), netDue: fmt(tNet), penalty491: t491 },
    assumptions: ['Minimum art. 491 appliqué par mois de déclaration sur la somme du mois (hypothèse du classeur : 1 infraction = 1 mois) — à valider juridiquement.',
      "Aucun intérêt art. 488 sur l'AIB ni sur les retenues (règle du classeur) — à confirmer."],
    warnings: [],
  }
}
