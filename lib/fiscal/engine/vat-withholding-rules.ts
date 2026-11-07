import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveValidatedParameters, type Blocker, type ResolvedParam } from './rules-common'
import type { TvaRules } from './tva'
import type { AibRules, RetenueRules } from './aib-retenues'

/**
 * Codes attendus (parameter, validated, source juridique validée, article renseigné) — aucune valeur par défaut :
 *  TVA      : VAT_RATE_NORMAL (ratio), DGI_TVA_DUE_DAY (day), DGI_487_RATE (ratio), DGI_488_RATE_MONTHLY (ratio)
 *  AIB      : AIB_RATE_IMPORT, AIB_RATE_NO_IFU, AIB_RATE_SERVICES_IFU, AIB_RATE_GOODS_IFU (ratio), DGI_AIB_DUE_DAY (day) + bloc art. 491
 *  Retenues : RETENUE_NR_NATURAL_RATE, RETENUE_NR_LEGAL_RATE (ratio), DGI_WITHHOLDING_DUE_DAY (day) + bloc art. 491
 *  Bloc art. 491 : DGI_491_RATE (ratio), DGI_491_MIN_MONTHLY (XOF), DGI_491_RAISED_RATE (ratio), DGI_491_RAISED_AFTER_MONTHS (months)
 */
const RATIO = /^(0|1|0\.\d{1,6}|1\.0{1,6})$/
const AMOUNT = /^\d{1,15}(\.\d{1,2})?$/
const INT = /^\d{1,3}(\.0+)?$/

type Kind = 'ratio' | 'day' | 'xof' | 'months'
type Res<T> = { ok: true; rules: T; trace: ResolvedParam[] } | { ok: false; blockers: Blocker[] }

async function load(client: SupabaseClient, year: number, label: string, spec: Record<string, Kind>):
  Promise<{ ok: true; p: Record<string, ResolvedParam>; trace: ResolvedParam[] } | { ok: false; blockers: Blocker[] }> {
  const codes = Object.keys(spec)
  const res = await resolveValidatedParameters(client, year, codes, label)
  if (!res.ok) return res
  const blockers: Blocker[] = []
  for (const c of codes) {
    const r = res.params[c]
    if (!r) { blockers.push({ code: 'RULE_MISSING_OR_NOT_VALIDATED', message: c + " : absent, non validé ou ne couvrant pas tout l'exercice " + year + '.' }); continue }
    const k = spec[c]
    const ok = k === 'ratio' ? (r.unit === 'ratio' && RATIO.test(r.value))
      : k === 'xof' ? (r.unit === 'XOF' && r.currency === 'XOF' && AMOUNT.test(r.value))
      : k === 'day' ? (r.unit === 'day' && INT.test(r.value) && parseInt(r.value, 10) >= 1 && parseInt(r.value, 10) <= 28)
      : (r.unit === 'months' && INT.test(r.value))
    if (!ok) blockers.push({ code: 'RULE_FORMAT_INVALID', message: c + ' : format ou unité invalide (attendu ' + k + ').' })
  }
  if (blockers.length) return { ok: false, blockers }
  return { ok: true, p: res.params, trace: Object.keys(res.params).sort().map(k => res.params[k]) }
}
const ref = (trace: ResolvedParam[]) => trace.map(t => t.sourceCode + ' ' + t.articleReference).filter((v, i, a) => a.indexOf(v) === i).join(' ; ')
const int = (s: string) => parseInt(s, 10)
const pen = (p: Record<string, ResolvedParam>) => ({ rate491: p['DGI_491_RATE'].value, min491Monthly: p['DGI_491_MIN_MONTHLY'].value,
  rate491Raised: p['DGI_491_RAISED_RATE'].value, raisedAfterFullMonths: int(p['DGI_491_RAISED_AFTER_MONTHS'].value) })
const B491SPEC: Record<string, Kind> = { DGI_491_RATE: 'ratio', DGI_491_MIN_MONTHLY: 'xof', DGI_491_RAISED_RATE: 'ratio', DGI_491_RAISED_AFTER_MONTHS: 'months' }

export async function resolveValidatedTvaRules(client: SupabaseClient, year: number): Promise<Res<TvaRules>> {
  const r = await load(client, year, 'TVA', { VAT_RATE_NORMAL: 'ratio', DGI_TVA_DUE_DAY: 'day', DGI_487_RATE: 'ratio', DGI_488_RATE_MONTHLY: 'ratio' })
  if (!r.ok) return r
  return { ok: true, trace: r.trace, rules: { vatRate: r.p['VAT_RATE_NORMAL'].value, dueDay: int(r.p['DGI_TVA_DUE_DAY'].value),
    rate487: r.p['DGI_487_RATE'].value, rate488Monthly: r.p['DGI_488_RATE_MONTHLY'].value, legalRef: ref(r.trace) } }
}

export async function resolveValidatedAibRules(client: SupabaseClient, year: number): Promise<Res<AibRules>> {
  const spec: Record<string, Kind> = { AIB_RATE_IMPORT: 'ratio', AIB_RATE_NO_IFU: 'ratio', AIB_RATE_SERVICES_IFU: 'ratio', AIB_RATE_GOODS_IFU: 'ratio', DGI_AIB_DUE_DAY: 'day' }
  Object.keys(B491SPEC).forEach(k => { spec[k] = B491SPEC[k] })
  const r = await load(client, year, 'AIB', spec)
  if (!r.ok) return r
  return { ok: true, trace: r.trace, rules: { importRate: r.p['AIB_RATE_IMPORT'].value, noIfuRate: r.p['AIB_RATE_NO_IFU'].value,
    servicesIfuRate: r.p['AIB_RATE_SERVICES_IFU'].value, goodsIfuRate: r.p['AIB_RATE_GOODS_IFU'].value, dueDay: int(r.p['DGI_AIB_DUE_DAY'].value), ...pen(r.p), legalRef: ref(r.trace) } }
}

export async function resolveValidatedRetenuesRules(client: SupabaseClient, year: number): Promise<Res<RetenueRules>> {
  const spec: Record<string, Kind> = { RETENUE_NR_NATURAL_RATE: 'ratio', RETENUE_NR_LEGAL_RATE: 'ratio', DGI_WITHHOLDING_DUE_DAY: 'day' }
  Object.keys(B491SPEC).forEach(k => { spec[k] = B491SPEC[k] })
  const r = await load(client, year, 'Retenues', spec)
  if (!r.ok) return r
  return { ok: true, trace: r.trace, rules: { nonResidentNaturalRate: r.p['RETENUE_NR_NATURAL_RATE'].value, nonResidentLegalRate: r.p['RETENUE_NR_LEGAL_RATE'].value,
    dueDay: int(r.p['DGI_WITHHOLDING_DUE_DAY'].value), ...pen(r.p), legalRef: ref(r.trace) } }
}
