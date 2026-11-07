import { DecimalError, ZERO, bmax, bmin, fmt, mulRate, parseMoney, parseRate } from './decimal'
import { CalcBlockedError, delayAt, dueDateNextMonth, isoDate, parseDateStrict } from './penalty-core'

/**
 * Moteur TVA (feuille TVA du classeur V8), exact. Taux, échéance et pénalités viennent de règles VALIDÉES.
 *  collectée = ventes HT x taux (0 si exonérée / hors champ) ; nette = collectée - déductible - régularisations
 *  à payer = max(0, nette - crédit antérieur) ; crédit suivant = max(0, crédit - nette)
 *  dû retenu = max(à payer, déclaré) si déclarée, sinon à payer ; base de pénalité = dû retenu - min(dû retenu, payé)
 * Aucun montant absent n'est remplacé par zéro : déclaré/payé/déductible/régularisations sont explicites.
 */
export type TvaRegime = 'taxable' | 'exempt' | 'out_of_scope' | 'partial'
export const MAX_TVA_LINES = 240

export interface TvaRules { vatRate: string; dueDay: number; rate487: string; rate488Monthly: string; legalRef: string }
export interface TvaLine {
  month: string; regime: TvaRegime; salesHt: string; deductibleVat: string; adjustments: string
  filed: boolean; declared?: string | null; paid: string
  provenance: 'real' | 'estimated' | 'flat_split'
}
export interface TvaInput { openingCredit: string; lines: TvaLine[] }

export interface TvaLineResult {
  month: string; regime: TvaRegime; provenance: string
  collected: string; deductible: string; adjustments: string; net: string
  creditBefore: string; payable: string; creditAfter: string
  filed: boolean; declared: string | null; declarationGap: string | null; declaredUnpaid: string | null
  retained: string; paid: string; unpaidBase: string
  dueDate: string; penalty487: string | null; interest488: string | null
  warnings: string[]
}
export interface TvaResult {
  provisional: false; fiscalYear: number; calcDate: string | null
  lines: TvaLineResult[]
  totals: { collected: string; payable: string; retained: string; unpaid: string; penalty487: string | null; interest488: string | null; closingCredit: string }
  methodology: string[]
  warnings: string[]
}

const REGIMES = ['taxable', 'exempt', 'out_of_scope', 'partial']
const mIndex = (m: string) => parseInt(m.slice(0, 4), 10) * 12 + parseInt(m.slice(5, 7), 10)

export function computeTva(input: TvaInput, rules: TvaRules, fiscalYear: number, calcDate: string | null): TvaResult {
  try { return run(input, rules, fiscalYear, calcDate) } catch (e) {
    if (e instanceof DecimalError) throw new CalcBlockedError([e.message])
    throw e
  }
}

function run(input: TvaInput, rules: TvaRules, fiscalYear: number, calcDate: string | null): TvaResult {
  if (!input || !Array.isArray(input.lines) || input.lines.length === 0) throw new CalcBlockedError(['Aucune ligne de TVA.'])
  if (input.lines.length > MAX_TVA_LINES) throw new CalcBlockedError(['Capacité dépassée : ' + MAX_TVA_LINES + ' lignes maximum.'])
  if (!rules.legalRef || !rules.legalRef.trim()) throw new CalcBlockedError(['Référence juridique des règles TVA absente.'])
  if (!Number.isInteger(rules.dueDay) || rules.dueDay < 1 || rules.dueDay > 28) throw new CalcBlockedError(["Jour d'échéance TVA hors 1..28."])
  const vatRate = parseRate(rules.vatRate, 'taux de TVA')
  const r487 = parseRate(rules.rate487, 'taux art. 487')
  const r488 = parseRate(rules.rate488Monthly, 'taux art. 488')
  const calc = calcDate === null ? null : parseDateStrict(calcDate, 'date de calcul')
  let credit = parseMoney(input.openingCredit, 'crédit de TVA initial')

  const lines = input.lines.slice().sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0))
  const out: TvaLineResult[] = []
  let tCol = ZERO, tPay = ZERO, tRet = ZERO, tUnp = ZERO, t487 = ZERO, t488 = ZERO
  const warnings: string[] = []
  let prev = ''

  for (const l of lines) {
    const mm = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(l.month || '')
    if (!mm) throw new CalcBlockedError([(l.month || '?') + ' : mois invalide.'])
    if (parseInt(mm[1], 10) !== fiscalYear) throw new CalcBlockedError([l.month + " : mois hors de l'exercice " + fiscalYear + '.'])
    if (prev === l.month) throw new CalcBlockedError(['Doublon de mois ' + l.month + '.'])
    if (REGIMES.indexOf(l.regime) < 0) throw new CalcBlockedError([l.month + ' : régime à confirmer ou inconnu (' + l.regime + ') — calcul impossible.'])
    if (typeof l.filed !== 'boolean') throw new CalcBlockedError([l.month + ' : déclaration déposée (oui/non) à renseigner explicitement.'])
    const w: string[] = []
    if (prev !== '' && mIndex(l.month) - mIndex(prev) > 1) { const msg = 'Mois manquant entre ' + prev + ' et ' + l.month + ' : le crédit est reporté sans interruption.'; w.push(msg); warnings.push(msg) }
    prev = l.month
    if (l.regime === 'partial') w.push('Régime partiellement taxable : base taxable à vérifier (la base saisie est supposée déjà limitée à la partie taxable).')
    if (l.provenance !== 'real') w.push('Donnée ' + (l.provenance === 'estimated' ? 'ESTIMÉE' : 'en RÉPARTITION FORFAITAIRE'))

    const sales = parseMoney(l.salesHt, l.month + ' ventes HT')
    const ded = parseMoney(l.deductibleVat, l.month + ' TVA déductible')
    const adj = parseMoney(l.adjustments, l.month + ' régularisations')
    const paid = parseMoney(l.paid, l.month + ' TVA payée')
    let declared: bigint | null = null
    if (l.filed) {
      if (l.declared === undefined || l.declared === null) throw new CalcBlockedError([l.month + ' : TVA déclarée à renseigner (déclaration déposée).'])
      declared = parseMoney(l.declared, l.month + ' TVA déclarée')
    } else if (l.declared !== undefined && l.declared !== null) throw new CalcBlockedError([l.month + ' : montant déclaré incompatible avec « non déposée ».'])

    const collected = (l.regime === 'exempt' || l.regime === 'out_of_scope') ? ZERO : mulRate(sales, vatRate, l.month + ' TVA collectée')
    const net = collected - ded - adj
    const creditBefore = credit
    const payable = bmax(ZERO, net - creditBefore)
    credit = bmax(ZERO, creditBefore - net)
    const retained = declared === null ? payable : bmax(payable, declared)
    const settled = bmin(retained, paid)
    const base = retained - settled

    let p487: bigint | null = null, i488: bigint | null = null
    const due = dueDateNextMonth(parseInt(mm[1], 10), parseInt(mm[2], 10), rules.dueDay)
    if (calc !== null) {
      const d = delayAt(calc, due)
      p487 = d.overdue ? mulRate(base, r487, l.month + ' art. 487') : ZERO
      i488 = d.overdue ? bmin(base, mulRate(base, r488, l.month + ' art. 488') * BigInt(d.frac)) : ZERO
      t487 += p487; t488 += i488
    }
    out.push({
      month: l.month, regime: l.regime, provenance: l.provenance,
      collected: fmt(collected), deductible: fmt(ded), adjustments: fmt(adj), net: fmt(net),
      creditBefore: fmt(creditBefore), payable: fmt(payable), creditAfter: fmt(credit),
      filed: l.filed, declared: declared === null ? null : fmt(declared),
      declarationGap: declared === null ? null : fmt(payable - declared),
      declaredUnpaid: declared === null ? null : fmt(bmax(ZERO, declared - paid)),
      retained: fmt(retained), paid: fmt(paid), unpaidBase: fmt(base),
      dueDate: isoDate(due), penalty487: p487 === null ? null : fmt(p487), interest488: i488 === null ? null : fmt(i488), warnings: w,
    })
    tCol += collected; tPay += payable; tRet += retained; tUnp += base
  }
  return {
    provisional: false, fiscalYear, calcDate, lines: out,
    totals: { collected: fmt(tCol), payable: fmt(tPay), retained: fmt(tRet), unpaid: fmt(tUnp),
      penalty487: calc === null ? null : fmt(t487), interest488: calc === null ? null : fmt(t488), closingCredit: fmt(credit) },
    methodology: ['Dû retenu = max(TVA à payer calculée, TVA déclarée) lorsque la déclaration est déposée (convention prudente du classeur) — à valider.',
      'Intérêt art. 488 plafonné aux droits simples, en mois ou fraction de mois — à confirmer au CGI.'],
    warnings,
  }
}
