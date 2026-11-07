// RÉFÉRENCE INDÉPENDANTE (tests uniquement) — ne pas importer depuis le code applicatif.
import { DecimalError, SCALE, ZERO, bmax } from '../../lib/fiscal/engine/decimal'


/** Compléments décimaux pour les montants issus des moteurs (jusqu'à 8 décimales) et les arrondis EXPLICITES du classeur. */
export function parseAmount(v: unknown, label: string): bigint {
  if (typeof v !== 'string') throw new DecimalError(label + ' : chaîne décimale exigée (nombre JS refusé)')
  const m = /^(\d{1,15})(?:\.(\d{1,8}))?$/.exec(v)
  if (!m) throw new DecimalError(label + ' : montant invalide "' + v + '"')
  return BigInt(m[1]) * SCALE + BigInt((m[2] || '').padEnd(14, '0'))
}

/** ceil(a / n) exprimé en XOF entiers (règle ROUNDUP(x, 0) du classeur). a >= 0, n >= 1. */
export function ceilDivToUnit(a: bigint, n: number): bigint {
  const d = BigInt(n) * SCALE
  return ((a + d - BigInt(1)) / d) * SCALE
}

/** Nombre entier de XOF = ceil(a / b) pour deux montants (b > 0) : nombre d'échéances. */
export function ceilCount(a: bigint, b: bigint): number {
  if (b <= ZERO) throw new DecimalError('diviseur nul')
  return Number((a + b - BigInt(1)) / b)
}

/** Arrondi au XOF entier, moitié vers le haut (ROUND(x, 0) du classeur pour valeurs >= 0). */
export function roundHalfUpToUnit(a: bigint): bigint {
  return ((a + SCALE / BigInt(2)) / SCALE) * SCALE
}


/** Briques communes aux moteurs TVA / AIB / retenues : erreurs, dates, retards, minimum mensuel. */
export class CalcBlockedError extends Error {
  public readonly reasons: string[]
  constructor(reasons: string[]) {
    super('CALC_BLOCKED: ' + reasons.join(' | '))
    this.reasons = reasons
    Object.setPrototypeOf(this, CalcBlockedError.prototype)
  }
}

export interface YMD { y: number; m: number; d: number }

export function parseDateStrict(s: string, label: string): YMD {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '')
  if (!m) throw new CalcBlockedError([label + ' : date invalide "' + s + '"'])
  const r = { y: parseInt(m[1], 10), m: parseInt(m[2], 10), d: parseInt(m[3], 10) }
  const t = new Date(Date.UTC(r.y, r.m - 1, r.d))
  if (t.getUTCFullYear() !== r.y || t.getUTCMonth() !== r.m - 1 || t.getUTCDate() !== r.d) throw new CalcBlockedError([label + ' : date inexistante "' + s + '"'])
  return r
}
export const cmpDate = (a: YMD, b: YMD) => (a.y - b.y) || (a.m - b.m) || (a.d - b.d)
export const isoDate = (a: YMD) => a.y + '-' + (a.m < 10 ? '0' : '') + a.m + '-' + (a.d < 10 ? '0' : '') + a.d

/** Échéance = jour `day` du mois suivant le mois (y, m). */
export function dueDateNextMonth(y: number, m: number, day: number): YMD {
  let ny = y, nm = m + 1
  if (nm > 12) { nm -= 12; ny += 1 }
  return { y: ny, m: nm, d: day }
}

/** Retard à la date de calcul : mois PLEINS (art. 491) et mois OU FRACTION (art. 488). Aucun retard si calc <= échéance. */
export function delayAt(calc: YMD, due: YMD): { overdue: boolean; full: number; frac: number } {
  if (cmpDate(calc, due) <= 0) return { overdue: false, full: 0, frac: 0 }
  const dm = (calc.y - due.y) * 12 + (calc.m - due.m)
  return { overdue: true, full: dm - (calc.d < due.d ? 1 : 0), frac: dm + (calc.d > due.d ? 1 : 0) }
}

/** Minimum par mois de déclaration appliqué à la somme du mois si elle est > 0 (Liaison_Dettes). */
export function applyMonthlyMinimum(sums: Record<string, bigint>, min: bigint): { applied: Record<string, bigint>; total: bigint } {
  const applied: Record<string, bigint> = {}
  let total = ZERO
  Object.keys(sums).sort().forEach(k => { applied[k] = sums[k] > ZERO ? bmax(min, sums[k]) : ZERO; total += applied[k] })
  return { applied, total }
}
