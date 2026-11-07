/**
 * Mapper « réponses simples du client » -> lignes mensuelles de paie (Cartographie : R3, R4, R5, R7, R16).
 * Fonctions pures : aucune écriture en base, aucune horloge (le mois courant est un paramètre).
 * Sorties = payloads des sections `its_vps` et `cnss_periods` (contrats de its-input.ts / cnss-input.ts).
 * Montants : chaînes décimales uniquement (decimal.ts). Aucune valeur inventée : un trou ou une réponse
 * « Je ne sais pas » bloque avec un message clair.
 */
import { SCALE, ZERO, fmt, parseMoney } from '../engine/decimal'

export class PayrollMapperError extends Error {
  constructor(message: string) { super(message); Object.setPrototypeOf(this, PayrollMapperError.prototype) }
}

export const FIRST_YEAR = 2022
export const MAX_EMPLOYEES = 100
export const MAX_PAYROLL_LINES = 6000

export type LineProvenance = 'real' | 'estimated' | 'flat_split'
export type SourceMode = 'actual' | 'estimated' | 'mixed'

export interface SalaryPeriod {
  from: string                 // 'AAAA-MM'
  to: string | null            // null = jusqu'à la fin d'emploi
  gross: string
  bonuses?: string | null      // absent = 0 (primes non déclarées)
  benefits?: string | null
  otherTaxable?: string | null
  /** 'estimated' = salaire actuel appliqué aux mois passés (niveau Essentiel) ; 'real' = périodes saisies (Complet). */
  provenance: 'real' | 'estimated'
}
export interface EmployeeInput { employeeId: string; hire: string; departure?: string | null; periods: SalaryPeriod[] }
export interface SalaryLine {
  employeeId: string; month: string; gross: string; bonuses: string; benefits: string; otherTaxable: string
  provenance: 'real' | 'estimated'
}

const YM = /^(\d{4})-(0[1-9]|1[0-2])$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const CENT = SCALE / BigInt(100)
const err = (m: string): never => { throw new PayrollMapperError(m) }

function ymIndex(s: unknown, label: string): number {
  const m = typeof s === 'string' ? YM.exec(s) : null
  if (!m) return err(label + ' : mois invalide "' + String(s) + '" (AAAA-MM attendu)')
  return parseInt(m[1], 10) * 12 + parseInt(m[2], 10) - 1
}
function ymString(i: number): string {
  const m = (i % 12) + 1
  return String(Math.floor(i / 12)) + '-' + (m < 10 ? '0' : '') + String(m)
}
const money = (v: string | null | undefined, label: string): bigint => (v === undefined || v === null ? ZERO : parseMoney(v, label))
const toCents = (v: bigint): bigint => v / CENT
const fromCents = (c: bigint): string => fmt(c * CENT)

/** Répartit `total` (centimes) au prorata des poids ; la somme des parts == total (plus grands restes). */
export function allocateCents(total: bigint, weights: bigint[]): bigint[] {
  const n = weights.length
  if (n === 0) return err('Aucun mois sur lequel répartir')
  if (total < ZERO) return err('Total à répartir négatif')
  let sum = ZERO
  for (let i = 0; i < n; i++) { if (weights[i] < ZERO) return err('Poids négatif'); sum += weights[i] }
  const w = sum === ZERO ? weights.map(() => BigInt(1)) : weights
  const s = sum === ZERO ? BigInt(n) : sum
  const parts: bigint[] = []
  const rems: { i: number; r: bigint }[] = []
  let used = ZERO
  for (let i = 0; i < n; i++) {
    const p = total * w[i]
    const q = p / s
    parts.push(q); rems.push({ i, r: p % s }); used += q
  }
  rems.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1))
  let left = total - used
  for (let k = 0; left > ZERO; k++) { parts[rems[k].i] += BigInt(1); left -= BigInt(1) }
  return parts
}

function modeOf(provs: LineProvenance[]): SourceMode {
  let real = 0
  for (let i = 0; i < provs.length; i++) if (provs[i] === 'real') real++
  return real === provs.length ? 'actual' : real === 0 ? 'estimated' : 'mixed'
}

// --- R3 : un mois par ligne, de max(embauche, 01/2022) à min(départ, mois courant) ---
export function deriveSalaryLines(employees: EmployeeInput[], currentMonth: string): SalaryLine[] {
  const cur = ymIndex(currentMonth, 'Mois courant')
  if (employees.length > MAX_EMPLOYEES) return err('Plus de ' + MAX_EMPLOYEES + ' salariés : utiliser l\'import par fichier modèle')
  const seen: Record<string, boolean> = Object.create(null)
  const out: SalaryLine[] = []
  for (let e = 0; e < employees.length; e++) {
    const emp = employees[e]
    const id = emp.employeeId
    if (typeof id !== 'string' || !id.trim() || id.length > 100) return err('Code salarié invalide')
    if (seen[id]) return err('Code salarié en double : ' + id)
    seen[id] = true
    const hire = ymIndex(emp.hire, id + ' embauche')
    const dep = emp.departure ? ymIndex(emp.departure, id + ' départ') : null
    if (dep !== null && dep < hire) return err(id + ' : départ antérieur à l\'embauche')
    const periods = emp.periods.map((p) => ({
      from: ymIndex(p.from, id + ' période (début)'),
      to: p.to === null ? null : ymIndex(p.to, id + ' période (fin)'),
      gross: money(p.gross, id + ' brut'), bonuses: money(p.bonuses, id + ' primes'),
      benefits: money(p.benefits, id + ' avantages'), other: money(p.otherTaxable, id + ' autres'),
      provenance: p.provenance,
    }))
    periods.sort((a, b) => a.from - b.from)
    for (let k = 0; k < periods.length; k++) {
      const p = periods[k]
      if (p.to !== null && p.to < p.from) return err(id + ' : période de salaire à l\'envers')
      if (k > 0) {
        const prev = periods[k - 1]
        if (prev.to === null || p.from <= prev.to) return err(id + ' : périodes de salaire qui se chevauchent')
      }
    }
    const start = Math.max(hire, FIRST_YEAR * 12)
    const end = Math.min(dep === null ? cur : dep, cur)
    for (let i = start; i <= end; i++) {
      let found = -1
      for (let k = 0; k < periods.length; k++) {
        if (periods[k].from <= i && (periods[k].to === null || i <= (periods[k].to as number))) { found = k; break }
      }
      if (found < 0) return err(id + ' : aucun salaire saisi pour ' + ymString(i))
      if (out.length >= MAX_PAYROLL_LINES) return err('Plus de ' + MAX_PAYROLL_LINES + ' lignes mensuelles : utiliser l\'import par fichier modèle')
      const p = periods[found]
      out.push({ employeeId: id, month: ymString(i), gross: fmt(p.gross), bonuses: fmt(p.bonuses), benefits: fmt(p.benefits),
        otherTaxable: fmt(p.other), provenance: p.provenance })
    }
  }
  return out
}

// --- Section its_vps (R4 base proposée, R5 répartition forfaitaire des totaux annuels) ---
export interface AnnualPaid { year: number; itsPaid?: string | null; vpsPaid?: string | null }
export interface ItsVpsMapOptions {
  vpsExempt: boolean
  /** false (défaut) : la base ITS est une PROPOSITION (À_trancher n°1) -> provenance 'estimated'. */
  baseValidated?: boolean
  annual?: AnnualPaid[]
}
export interface ItsVpsLinePayload {
  employee_id: string; month: string; its_base: string; vps_exempt: boolean; provenance: LineProvenance
  its_paid?: string; vps_paid?: string
}

export function toItsVpsPayload(lines: SalaryLine[], opts: ItsVpsMapOptions): { source_mode: SourceMode; data: { lines: ItsVpsLinePayload[] } } {
  if (lines.length === 0) return err('Aucune ligne de paie pour la section its_vps')
  const out: ItsVpsLinePayload[] = lines.map((l) => ({
    employee_id: l.employeeId, month: l.month,
    its_base: fmt(parseMoney(l.gross, 'brut') + parseMoney(l.bonuses, 'primes') + parseMoney(l.benefits, 'avantages')),
    vps_exempt: opts.vpsExempt,
    provenance: (opts.baseValidated ? l.provenance : 'estimated') as LineProvenance,
  }))
  const years: Record<string, boolean> = Object.create(null)
  const annual = opts.annual || []
  for (let a = 0; a < annual.length; a++) {
    const y = String(annual[a].year)
    if (years[y]) return err('Année en double dans les totaux annuels : ' + y)
    years[y] = true
    const fields: ('its_paid' | 'vps_paid')[] = ['its_paid', 'vps_paid']
    const values = [annual[a].itsPaid, annual[a].vpsPaid]
    for (let f = 0; f < 2; f++) {
      const v = values[f]
      if (v === undefined || v === null) continue // non renseigné : jamais zéro
      const total = toCents(parseMoney(v, fields[f] + ' ' + y))
      const idx: number[] = []
      for (let i = 0; i < out.length; i++) if (out[i].month.slice(0, 4) === y) idx.push(i)
      if (idx.length === 0) { if (total === ZERO) continue; return err('Total ' + fields[f] + ' ' + y + ' : aucun mois de paie cette année-là') }
      const shares = allocateCents(total, idx.map((i) => toCents(parseMoney(out[i].its_base, 'base'))))
      for (let k = 0; k < idx.length; k++) { out[idx[k]][fields[f]] = fromCents(shares[k]); out[idx[k]].provenance = 'flat_split' }
    }
  }
  return { source_mode: modeOf(out.map((l) => l.provenance)), data: { lines: out } }
}

// --- Section cnss_periods (R7 : réponses par période, montant partiel réparti sur les lignes) ---
export interface CnssPeriodAnswer {
  from: string; to: string
  payment: 'yes' | 'no' | 'partial' | 'unknown'
  paymentDate?: string | null
  amountPaid?: string | null   // obligatoire si 'partial' : montant payé pour TOUTE la période (tous salariés)
  paymentVerified?: boolean   // preuve contrôlée par le cabinet ; jamais activée automatiquement
}
export interface CnssLinePayload {
  employee_id: string; period: string; gross: string; bonuses: string; benefits: string; other_taxable: string
  payment: 'yes' | 'no' | 'partial'; provenance: LineProvenance
  payment_date?: string; amount_paid?: string; payment_verified?: boolean
}

export function toCnssPayload(lines: SalaryLine[], answers: CnssPeriodAnswer[], opts: { headcount: number; rpRate: string | null }):
  { source_mode: SourceMode; data: { headcount: number; rp_rate: string | null; lines: CnssLinePayload[] } } {
  if (lines.length === 0) return err('Aucune ligne de paie pour la section cnss_periods')
  if (!Number.isInteger(opts.headcount) || opts.headcount < 1) return err('Effectif : entier >= 1 exigé')
  const ranges = answers.map((a) => ({ a, from: ymIndex(a.from, 'Période CNSS (début)'), to: ymIndex(a.to, 'Période CNSS (fin)') }))
  for (let i = 0; i < ranges.length; i++) {
    if (ranges[i].to < ranges[i].from) return err('Période CNSS à l\'envers : ' + ranges[i].a.from + ' > ' + ranges[i].a.to)
    for (let j = i + 1; j < ranges.length; j++)
      if (ranges[i].from <= ranges[j].to && ranges[j].from <= ranges[i].to) return err('Périodes CNSS qui se chevauchent')
  }
  const out: CnssLinePayload[] = []
  const owner: number[] = []
  for (let i = 0; i < lines.length; i++) {
    const m = ymIndex(lines[i].month, 'Mois de paie')
    let r = -1
    for (let k = 0; k < ranges.length; k++) if (ranges[k].from <= m && m <= ranges[k].to) { r = k; break }
    if (r < 0) return err('Aucune réponse CNSS pour ' + lines[i].month + ' : à demander au client')
    const ans = ranges[r].a
    if (ans.payment === 'unknown') return err('Paiement CNSS « Je ne sais pas » (' + ans.from + ' à ' + ans.to + ') : relancer le client ou traiter par le cabinet')
    const l = lines[i]
    const row: CnssLinePayload = { employee_id: l.employeeId, period: l.month, gross: l.gross, bonuses: l.bonuses, benefits: l.benefits,
      other_taxable: l.otherTaxable, payment: ans.payment, provenance: l.provenance,
      payment_verified: ans.paymentVerified === true }
    if (ans.payment !== 'no' && ans.paymentDate) {
      if (!DATE.test(ans.paymentDate)) return err('Date de paiement CNSS invalide "' + ans.paymentDate + '" (AAAA-MM-JJ attendu)')
      row.payment_date = ans.paymentDate
    }
    out.push(row); owner.push(r)
  }
  for (let k = 0; k < ranges.length; k++) {
    const ans = ranges[k].a
    if (ans.payment !== 'partial') continue
    const total = toCents(money(ans.amountPaid, 'Montant partiel CNSS'))
    if (total <= ZERO) return err('Paiement partiel CNSS : montant > 0 exigé (' + ans.from + ' à ' + ans.to + ')')
    const idx: number[] = []
    for (let i = 0; i < out.length; i++) if (owner[i] === k) idx.push(i)
    if (idx.length === 0) continue
    const shares = allocateCents(total, idx.map((i) => toCents(parseMoney(out[i].gross, 'brut') + parseMoney(out[i].bonuses, 'primes') +
      parseMoney(out[i].benefits, 'avantages') + parseMoney(out[i].other_taxable, 'autres'))))
    for (let q = 0; q < idx.length; q++) { out[idx[q]].amount_paid = fromCents(shares[q]); out[idx[q]].provenance = 'flat_split' }
  }
  return { source_mode: modeOf(out.map((l) => l.provenance)), data: { headcount: opts.headcount, rp_rate: opts.rpRate, lines: out } }
}
