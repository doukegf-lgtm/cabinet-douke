/** Arithmétique décimale exacte (BigInt, échelle 1e-14). Montants <= 2 décimales, taux <= 6 décimales.
 *  Aucun arrondi caché : toute division inexacte est refusée. Compatible cible ES5 (pas de littéraux n). */
export class DecimalError extends Error {
  constructor(message: string) { super(message); Object.setPrototypeOf(this, DecimalError.prototype) }
}

export const ZERO = BigInt(0)
export const SCALE = BigInt('100000000000000')
const RATE_SCALE = BigInt(1000000)

export function parseMoney(v: unknown, label: string): bigint {
  if (typeof v !== 'string') throw new DecimalError(label + ' : chaîne décimale exigée (nombre JS refusé)')
  const m = /^(\d{1,15})(?:\.(\d{1,2}))?$/.exec(v)
  if (!m) throw new DecimalError(label + ' : montant invalide "' + v + '"')
  return BigInt(m[1]) * SCALE + BigInt((m[2] || '').padEnd(14, '0'))
}

export function parseRate(v: unknown, label: string): bigint {
  if (typeof v !== 'string') throw new DecimalError(label + ' : chaîne décimale exigée')
  const m = /^(0|1|0\.\d{1,6}|1\.0{1,6})$/.exec(v)
  if (!m) throw new DecimalError(label + ' : taux invalide "' + v + '" (ratio 0..1, 6 décimales max)')
  const p = v.split('.')
  return BigInt(p[0]) * RATE_SCALE + BigInt((p[1] || '').padEnd(6, '0'))
}

export function mulRate(amount: bigint, rate: bigint, label: string): bigint {
  const p = amount * rate
  if (p % RATE_SCALE !== ZERO) throw new DecimalError(label + ' : division inexacte (arrondi non défini)')
  return p / RATE_SCALE
}

export const bmin = (a: bigint, b: bigint): bigint => (a < b ? a : b)
export const bmax = (a: bigint, b: bigint): bigint => (a > b ? a : b)

export function fmt(a: bigint): string {
  const neg = a < ZERO
  const x = neg ? -a : a
  const frac = (x % SCALE).toString().padStart(14, '0').replace(/0+$/, '')
  return (neg ? '-' : '') + (x / SCALE).toString() + (frac ? '.' + frac : '')
}
