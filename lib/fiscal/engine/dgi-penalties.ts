import { DecimalError, ZERO, bmax, bmin, fmt, mulRate, parseMoney, parseRate } from './decimal'
import type { ItsVpsResult } from './its-vps'

/**
 * Pénalités et intérêts DGI sur l'ITS et la VPS (feuille ITS_VPS AA..AE et Liaison_Dettes!H25 du classeur V8).
 *  - échéance : jour `dueDay` du mois suivant la période ; aucune pénalité si calcDate <= échéance
 *  - art. 487 : taux x (ITS non retenu = max(0, ITS dû net - retenu non reversé)) et x VPS net impayé
 *  - art. 488 : intérêt = min(base, base x taux x mois ou fraction de mois), plafonné aux droits simples
 *  - art. 491 : taux x ITS retenu non reversé ; taux majoré si mois PLEINS écoulés > seuil ;
 *               minimum appliqué par mois de déclaration sur la somme du mois (hypothèse du classeur « 1 infraction = 1 mois »)
 * Tous les taux, le minimum, le seuil et le jour d'échéance viennent de règles VALIDÉES du référentiel.
 */
export interface DgiPenaltyRules {
  dueDay: number
  rate487: string
  rate488Monthly: string
  rate491: string
  min491Monthly: string
  rate491Raised: string
  raisedAfterFullMonths: number
  legalRef: string
}

export interface PenaltyLineResult {
  employeeId: string; month: string; dueDate: string; overdue: boolean
  fullMonths: number; monthsOrFraction: number
  rate491Applied: string | null
  penalty491: string; penalty487Its: string; interest488Its: string; penalty487Vps: string; interest488Vps: string
}

export interface PenaltyResult {
  calcDate: string
  assumptions: string[]
  lines: PenaltyLineResult[]
  by491Month: Record<string, { lineSum: string; applied: string }>
  totals: { penalty491: string; penalty487Its: string; interest488Its: string; penalty487Vps: string; interest488Vps: string; total: string }
}

export class PenaltyBlockedError extends Error {
  public readonly reasons: string[]
  constructor(reasons: string[]) {
    super('DGI_PENALTY_BLOCKED: ' + reasons.join(' | '))
    this.reasons = reasons
    Object.setPrototypeOf(this, PenaltyBlockedError.prototype)
  }
}

interface YMD { y: number; m: number; d: number }
function parseDate(s: string, label: string): YMD {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '')
  if (!m) throw new PenaltyBlockedError([label + ' : date invalide "' + s + '"'])
  const r = { y: parseInt(m[1], 10), m: parseInt(m[2], 10), d: parseInt(m[3], 10) }
  const t = new Date(Date.UTC(r.y, r.m - 1, r.d))
  if (t.getUTCFullYear() !== r.y || t.getUTCMonth() !== r.m - 1 || t.getUTCDate() !== r.d) throw new PenaltyBlockedError([label + ' : date inexistante "' + s + '"'])
  return r
}
const cmp = (a: YMD, b: YMD) => (a.y - b.y) || (a.m - b.m) || (a.d - b.d)
const iso = (a: YMD) => a.y + '-' + (a.m < 10 ? '0' : '') + a.m + '-' + (a.d < 10 ? '0' : '') + a.d

/** Lignes de pénalité tirées d'un résultat ITS/VPS ; refuse tout solde non renseigné. */
export function penaltyInputsFromItsVps(res: ItsVpsResult): Array<{ employeeId: string; month: string; itsDueNet: string; withheldNotPaid: string; vpsDueNet: string }> {
  return res.lines.map(l => {
    if (l.itsDueNet === null || l.withheldNotPaid === null || l.vpsDueNet === null)
      throw new PenaltyBlockedError([l.employeeId + '/' + l.month + ' : soldes ITS/VPS non renseignés, pénalités non calculables.'])
    return { employeeId: l.employeeId, month: l.month, itsDueNet: l.itsDueNet, withheldNotPaid: l.withheldNotPaid, vpsDueNet: l.vpsDueNet }
  })
}

export function computeDgiPenalties(
  inputs: Array<{ employeeId: string; month: string; itsDueNet: string; withheldNotPaid: string; vpsDueNet: string }>,
  rules: DgiPenaltyRules, calcDate: string,
): PenaltyResult {
  try { return run(inputs, rules, calcDate) } catch (e) {
    if (e instanceof DecimalError) throw new PenaltyBlockedError([e.message])
    throw e
  }
}

function run(inputs: Array<{ employeeId: string; month: string; itsDueNet: string; withheldNotPaid: string; vpsDueNet: string }>, rules: DgiPenaltyRules, calcDate: string): PenaltyResult {
  if (!Array.isArray(inputs) || inputs.length === 0) throw new PenaltyBlockedError(['Aucune ligne pour le calcul des pénalités.'])
  if (!rules.legalRef || !rules.legalRef.trim()) throw new PenaltyBlockedError(['Référence juridique des pénalités absente.'])
  if (!Number.isInteger(rules.dueDay) || rules.dueDay < 1 || rules.dueDay > 28) throw new PenaltyBlockedError(['Jour d\'échéance hors 1..28.'])
  if (!Number.isInteger(rules.raisedAfterFullMonths) || rules.raisedAfterFullMonths < 0) throw new PenaltyBlockedError(['Seuil de mois pleins invalide.'])
  const r487 = parseRate(rules.rate487, 'taux art. 487')
  const r488 = parseRate(rules.rate488Monthly, 'taux art. 488')
  const r491 = parseRate(rules.rate491, 'taux art. 491')
  const r491b = parseRate(rules.rate491Raised, 'taux art. 491 majoré')
  const min491 = parseMoney(rules.min491Monthly, 'minimum art. 491')
  const calc = parseDate(calcDate, 'date de calcul')

  const out: PenaltyLineResult[] = []
  const monthSum: Record<string, bigint> = {}
  let t487i = ZERO, t488i = ZERO, t487v = ZERO, t488v = ZERO
  const seen: Record<string, true> = {}

  for (const l of inputs) {
    const id = l.employeeId + '/' + l.month
    const mm = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(l.month || '')
    if (!mm) throw new PenaltyBlockedError([id + ' : mois invalide.'])
    if (seen[id]) throw new PenaltyBlockedError(['Doublon ' + id + '.'])
    seen[id] = true
    const U = parseMoney(l.itsDueNet, id + ' ITS dû net')
    const Z = parseMoney(l.withheldNotPaid, id + ' ITS retenu non reversé')
    const V = parseMoney(l.vpsDueNet, id + ' VPS net')

    let dy = parseInt(mm[1], 10), dm = parseInt(mm[2], 10) + 1
    if (dm > 12) { dm -= 12; dy += 1 }
    const due: YMD = { y: dy, m: dm, d: rules.dueDay }
    const overdue = cmp(calc, due) > 0
    if (!(monthSum[l.month] !== undefined)) monthSum[l.month] = ZERO
    let full = 0, frac = 0
    let p491 = ZERO, p487i = ZERO, i488i = ZERO, p487v = ZERO, i488v = ZERO
    let rateApplied: string | null = null

    if (overdue) {
      const dMonths = (calc.y - due.y) * 12 + (calc.m - due.m)
      full = dMonths - (calc.d < due.d ? 1 : 0)
      frac = dMonths + (calc.d > due.d ? 1 : 0)
      const nonWithheld = bmax(ZERO, U - Z)
      if (Z > ZERO) {
        const raised = full > rules.raisedAfterFullMonths
        rateApplied = raised ? rules.rate491Raised : rules.rate491
        p491 = mulRate(Z, raised ? r491b : r491, id + ' art. 491')
      }
      p487i = mulRate(nonWithheld, r487, id + ' art. 487 ITS')
      i488i = bmin(nonWithheld, mulRate(nonWithheld, r488, id + ' art. 488 ITS') * BigInt(frac))
      p487v = mulRate(V, r487, id + ' art. 487 VPS')
      i488v = bmin(V, mulRate(V, r488, id + ' art. 488 VPS') * BigInt(frac))
    }
    monthSum[l.month] = monthSum[l.month] + p491
    t487i += p487i; t488i += i488i; t487v += p487v; t488v += i488v
    out.push({
      employeeId: l.employeeId, month: l.month, dueDate: iso(due), overdue, fullMonths: full, monthsOrFraction: frac,
      rate491Applied: rateApplied, penalty491: fmt(p491), penalty487Its: fmt(p487i), interest488Its: fmt(i488i),
      penalty487Vps: fmt(p487v), interest488Vps: fmt(i488v),
    })
  }

  const by: Record<string, { lineSum: string; applied: string }> = {}
  let t491 = ZERO
  Object.keys(monthSum).sort().forEach(k => {
    const s = monthSum[k]
    const applied = s > ZERO ? bmax(min491, s) : ZERO
    by[k] = { lineSum: fmt(s), applied: fmt(applied) }
    t491 += applied
  })
  return {
    calcDate,
    assumptions: ['Minimum art. 491 appliqué par mois de déclaration (hypothèse du classeur : 1 infraction = 1 mois) — à valider juridiquement.',
      'Intérêt art. 488 plafonné aux droits simples, en mois ou fraction de mois — à confirmer au CGI.'],
    lines: out, by491Month: by,
    totals: { penalty491: fmt(t491), penalty487Its: fmt(t487i), interest488Its: fmt(t488i), penalty487Vps: fmt(t487v), interest488Vps: fmt(t488v),
      total: fmt(t491 + t487i + t488i + t487v + t488v) },
  }
}
