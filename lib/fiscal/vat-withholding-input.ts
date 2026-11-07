import { CalcBlockedError } from './engine/penalty-core'
import type { TvaInput, TvaLine, TvaRegime } from './engine/tva'
import type { AibLine, AibOpType, RetenueLine } from './engine/aib-retenues'

/**
 * Contrats des sections (fiscal_dossier_inputs.payload), montants = chaînes décimales, jamais zéro implicite :
 *  vat         : data { opening_credit, lines:[{ month, regime, sales_ht, deductible_vat, adjustments, filed:boolean, declared?, paid, provenance? }] }
 *  aib         : data { lines:[{ reference, date, op_type, has_ifu:boolean, base, rate?, reversed, credit, suffered?, provenance? }] }
 *  withholding : data { lines:[{ reference, date, kind, payee_type?, exemption_claimed:boolean, base, rate?, reversed, provenance? }] }
 */
type Prov = 'real' | 'estimated' | 'flat_split'
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const fail = (m: string): never => { throw new CalcBlockedError([m]) }
const req = (v: unknown, l: string): string => (typeof v === 'string' ? v : fail(l + ' : chaîne décimale obligatoire'))
const opt = (v: unknown, l: string): string | null => (v === undefined || v === null ? null : (typeof v === 'string' ? v : fail(l + ' : chaîne décimale exigée')))

function header(payload: unknown, name: string, max: number): { mode: string; data: Record<string, unknown>; raw: unknown[] } {
  if (!isObj(payload) || !isObj(payload.data)) return fail('Section ' + name + ' : structure invalide')
  const mode = payload.source_mode
  if (mode !== 'actual' && mode !== 'estimated' && mode !== 'mixed') return fail('Nature des données absente ou invalide')
  const raw = (payload.data as Record<string, unknown>).lines
  if (!Array.isArray(raw) || raw.length === 0) return fail('Section ' + name + ' : aucune ligne')
  if (raw.length > max) return fail('Capacité dépassée : ' + max + ' lignes maximum')
  return { mode, data: payload.data, raw }
}
function prov(r: Record<string, unknown>, mode: string, w: string): Prov {
  let p: Prov
  if (r.provenance === 'real' || r.provenance === 'estimated' || r.provenance === 'flat_split') p = r.provenance
  else if (r.provenance === undefined) { if (mode === 'mixed') return fail(w + ' : provenance obligatoire en mode mixed'); p = mode === 'actual' ? 'real' : 'estimated' }
  else return fail(w + ' : provenance invalide')
  if (mode === 'actual' && p !== 'real') return fail(w + ' : provenance incompatible avec source_mode actual')
  return p
}

export function parseTvaSection(payload: unknown): TvaInput {
  const h = header(payload, 'vat', 240)
  const lines = h.raw.map((x: unknown, i: number): TvaLine => {
    const w = 'ligne ' + (i + 1)
    if (!isObj(x)) return fail(w + ' : objet exigé')
    if (typeof x.month !== 'string') return fail(w + ' : month invalide')
    if (typeof x.regime !== 'string') return fail(w + ' : regime obligatoire')
    if (typeof x.filed !== 'boolean') return fail(w + ' : filed (booléen) obligatoire')
    return { month: x.month, regime: x.regime as TvaRegime, salesHt: req(x.sales_ht, w + ' sales_ht'), deductibleVat: req(x.deductible_vat, w + ' deductible_vat'),
      adjustments: req(x.adjustments, w + ' adjustments'), filed: x.filed, declared: opt(x.declared, w + ' declared'), paid: req(x.paid, w + ' paid'), provenance: prov(x, h.mode, w) }
  })
  return { openingCredit: req(h.data.opening_credit, 'opening_credit'), lines }
}

export function parseAibSection(payload: unknown): AibLine[] {
  const h = header(payload, 'aib', 500)
  return h.raw.map((x: unknown, i: number): AibLine => {
    const w = 'ligne ' + (i + 1)
    if (!isObj(x)) return fail(w + ' : objet exigé')
    if (typeof x.reference !== 'string' || !x.reference.trim() || x.reference.length > 100) return fail(w + ' : reference (pièce) obligatoire')
    if (typeof x.date !== 'string') return fail(w + ' : date invalide')
    if (['import', 'services', 'wholesale_goods', 'goods_supply'].indexOf(String(x.op_type)) < 0) return fail(w + ' : op_type invalide')
    if (typeof x.has_ifu !== 'boolean') return fail(w + ' : has_ifu (booléen) obligatoire')
    return { reference: x.reference, date: x.date, opType: x.op_type as AibOpType, hasIfu: x.has_ifu, base: req(x.base, w + ' base'), rate: opt(x.rate, w + ' rate'),
      reversed: req(x.reversed, w + ' reversed'), credit: req(x.credit, w + ' credit'), suffered: opt(x.suffered, w + ' suffered'), provenance: prov(x, h.mode, w) }
  })
}

export function parseRetenuesSection(payload: unknown): RetenueLine[] {
  const h = header(payload, 'withholding', 500)
  return h.raw.map((x: unknown, i: number): RetenueLine => {
    const w = 'ligne ' + (i + 1)
    if (!isObj(x)) return fail(w + ' : objet exigé')
    if (typeof x.reference !== 'string' || !x.reference.trim() || x.reference.length > 100) return fail(w + ' : reference (pièce) obligatoire')
    if (typeof x.date !== 'string') return fail(w + ' : date invalide')
    if (x.kind !== 'non_resident' && x.kind !== 'other') return fail(w + ' : kind invalide')
    if (x.payee_type !== undefined && x.payee_type !== null && x.payee_type !== 'natural' && x.payee_type !== 'legal') return fail(w + ' : payee_type invalide')
    if (typeof x.exemption_claimed !== 'boolean') return fail(w + ' : exemption_claimed (booléen) obligatoire')
    return { reference: x.reference, date: x.date, kind: x.kind, payeeType: (x.payee_type as 'natural' | 'legal' | null | undefined) ?? null, exemptionClaimed: x.exemption_claimed,
      base: req(x.base, w + ' base'), rate: opt(x.rate, w + ' rate'), reversed: req(x.reversed, w + ' reversed'), provenance: prov(x, h.mode, w) }
  })
}
