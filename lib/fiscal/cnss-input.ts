import { CnssBlockedError, type PayrollLine, type Provenance } from './engine/cnss-liquidation'

/**
 * Contrat de la section `cnss_periods` (fiscal_dossier_inputs.payload) :
 * {
 *   source_mode: 'actual' | 'estimated' | 'mixed',
 *   data: {
 *     headcount: entier >= 1,
 *     rp_rate: '0.02' | null,                 // taux RP notifié CNSS (donnée du dossier, pas une règle)
 *     lines: [{ employee_id, period:'YYYY-MM', gross, bonuses, benefits, other_taxable,
 *               base_override?, rp_rate?, due_date?, payment:'yes'|'no'|'partial',
 *               payment_date?, amount_paid?, payment_verified?:boolean,
 *               manual_late_months?:int, provenance?:'real'|'estimated'|'flat_split' }]
 *   }
 * }
 * Montants = chaînes décimales (ou null = absent). Un nombre JS est refusé par le moteur.
 */
export const MAX_CNSS_LINES = 6000

export type ParsedCnssSection = {
  headcount: number
  rpRateDefault: string | null
  lines: PayrollLine[]
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const fail = (m: string): never => { throw new CnssBlockedError([m]) }
const strOrNull = (v: unknown, l: string): string | null => {
  if (v === undefined || v === null) return null
  if (typeof v !== 'string') return fail(`${l} : chaîne décimale exigée`)
  return v
}

export function parseCnssSection(payload: unknown): ParsedCnssSection {
  if (!isObj(payload) || !isObj(payload.data)) return fail('Section cnss_periods : structure invalide')
  const mode = payload.source_mode
  if (mode !== 'actual' && mode !== 'estimated' && mode !== 'mixed') return fail('Nature des données absente ou invalide')
  const d = payload.data
  const headcount = typeof d.headcount === 'string' && /^\d{1,4}$/.test(d.headcount) ? parseInt(d.headcount, 10) : d.headcount
  if (typeof headcount !== 'number' || !Number.isInteger(headcount) || headcount < 1) return fail('Effectif (headcount) : entier >= 1 exigé')
  const rpRateDefault = strOrNull(d.rp_rate, 'rp_rate')
  if (!Array.isArray(d.lines) || d.lines.length === 0) return fail('Aucune ligne de paie CNSS')
  if (d.lines.length > MAX_CNSS_LINES) return fail(`Capacité dépassée : ${MAX_CNSS_LINES} lignes maximum`)

  const lines: PayrollLine[] = d.lines.map((raw: unknown, i: number) => {
    const w = `ligne ${i + 1}`
    if (!isObj(raw)) return fail(`${w} : objet exigé`)
    if (typeof raw.employee_id !== 'string' || !raw.employee_id.trim() || raw.employee_id.length > 100) return fail(`${w} : employee_id invalide`)
    if (typeof raw.period !== 'string') return fail(`${w} : period invalide`)
    if (raw.payment !== 'yes' && raw.payment !== 'no' && raw.payment !== 'partial') return fail(`${w} : payment doit valoir yes, no ou partial`)
    let provenance: Provenance
    if (raw.provenance === 'real' || raw.provenance === 'estimated' || raw.provenance === 'flat_split') provenance = raw.provenance
    else if (raw.provenance === undefined) {
      if (mode === 'mixed') return fail(`${w} : provenance obligatoire en mode mixed`)
      provenance = mode === 'actual' ? 'real' : 'estimated'
    } else return fail(`${w} : provenance invalide`)
    if (mode === 'actual' && provenance !== 'real') return fail(`${w} : provenance incompatible avec source_mode actual`)
    const manual = raw.manual_late_months
    if (manual !== undefined && manual !== null && (!Number.isInteger(manual) || (manual as number) < 0 || (manual as number) > 600)) return fail(`${w} : manual_late_months invalide`)
    if (raw.payment_verified !== undefined && typeof raw.payment_verified !== 'boolean') return fail(`${w} : payment_verified booléen exigé`)
    const line: PayrollLine = {
      employeeId: raw.employee_id, period: raw.period,
      gross: strOrNull(raw.gross, `${w} gross`), bonuses: strOrNull(raw.bonuses, `${w} bonuses`),
      benefits: strOrNull(raw.benefits, `${w} benefits`), otherTaxable: strOrNull(raw.other_taxable, `${w} other_taxable`),
      payment: raw.payment, provenance,
    }
    const bo = strOrNull(raw.base_override, `${w} base_override`); if (bo !== null) line.baseOverride = bo
    const rp = strOrNull(raw.rp_rate, `${w} rp_rate`); if (rp !== null) line.rpRate = rp
    const dd = strOrNull(raw.due_date, `${w} due_date`); if (dd !== null) line.dueDate = dd
    const pd = strOrNull(raw.payment_date, `${w} payment_date`); if (pd !== null) line.paymentDate = pd
    const ap = strOrNull(raw.amount_paid, `${w} amount_paid`); if (ap !== null) line.amountPaid = ap
    if (typeof raw.payment_verified === 'boolean') line.paymentVerified = raw.payment_verified
    if (typeof manual === 'number') line.manualLateMonths = manual
    return line
  })
  return { headcount, rpRateDefault, lines }
}
