import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveValidatedParameters, type Blocker, type ResolvedParam } from './rules-common'
import { parseMoney } from './decimal'
import type { ItsRules } from './its-vps'

/**
 * Codes attendus dans fiscal_regulatory_entries (type parameter, statut validated, source validée) :
 *  ITS_BRACKET_n_FROM  (unit XOF)   borne basse de la tranche n (n = 1..8, consécutives) ; la tranche 1 commence à 0
 *  ITS_BRACKET_n_RATE  (unit ratio) taux de la tranche n ; la tranche n va jusqu'à la borne de la tranche n+1
 *  ITS_ORTB_MARCH      (unit XOF)   montant ajouté pour le mois de mars (0 = aucun, validé)
 *  ITS_ORTB_JUNE       (unit XOF)   montant ajouté pour juin
 *  ITS_ORTB_JUNE_MIN_BASE (unit XOF) base minimale (exclue) pour l'application du montant de juin
 *  VPS_RATE            (unit ratio) taux VPS
 * Aucune valeur par défaut : tout code manquant bloque le calcul.
 */
export const MAX_ITS_BRACKETS = 8
const FIXED = ['ITS_ORTB_MARCH', 'ITS_ORTB_JUNE', 'ITS_ORTB_JUNE_MIN_BASE', 'VPS_RATE']
const bracketCodes = (): string[] => {
  const c: string[] = []
  for (let n = 1; n <= MAX_ITS_BRACKETS; n++) { c.push('ITS_BRACKET_' + n + '_FROM'); c.push('ITS_BRACKET_' + n + '_RATE') }
  return c
}
const RATIO = /^(0|1|0\.\d{1,6}|1\.0{1,6})$/
const AMOUNT = /^\d{1,15}(\.\d{1,2})?$/
const isZero = (v: string) => /^0(\.0+)?$/.test(v)

export type ItsRulesResolution =
  | { ok: true; rules: ItsRules; trace: ResolvedParam[] }
  | { ok: false; blockers: Blocker[] }

export async function resolveValidatedItsRules(client: SupabaseClient, fiscalYear: number): Promise<ItsRulesResolution> {
  const res = await resolveValidatedParameters(client, fiscalYear, FIXED.concat(bracketCodes()), 'ITS/VPS')
  if (!res.ok) return res
  const p = res.params
  const blockers: Blocker[] = []

  for (const c of FIXED) if (!p[c]) blockers.push({ code: 'RULE_MISSING_OR_NOT_VALIDATED', message: c + " : absent, non validé ou ne couvrant pas tout l'exercice " + fiscalYear + '.' })
  if (!p['ITS_BRACKET_1_FROM'] || !p['ITS_BRACKET_1_RATE']) blockers.push({ code: 'RULE_MISSING_OR_NOT_VALIDATED', message: "Barème ITS : tranche 1 absente ou non validée." })
  if (blockers.length) return { ok: false, blockers }

  const brackets: Array<{ from: string; rate: string }> = []
  let n = 1
  while (p['ITS_BRACKET_' + n + '_FROM']) {
    const f = p['ITS_BRACKET_' + n + '_FROM'], r = p['ITS_BRACKET_' + n + '_RATE']
    if (!r) { blockers.push({ code: 'ITS_BRACKET_INCOMPLETE', message: 'Tranche ' + n + ' : taux manquant.' }); break }
    if (f.unit !== 'XOF' || f.currency !== 'XOF' || !AMOUNT.test(f.value)) blockers.push({ code: 'ITS_BRACKET_FORMAT', message: 'Tranche ' + n + ' : borne XOF invalide.' })
    if (r.unit !== 'ratio' || !RATIO.test(r.value)) blockers.push({ code: 'ITS_BRACKET_FORMAT', message: 'Tranche ' + n + ' : taux ratio invalide.' })
    brackets.push({ from: f.value, rate: r.value })
    n++
  }
  for (let k = n + 1; k <= MAX_ITS_BRACKETS; k++) {
    if (p['ITS_BRACKET_' + k + '_FROM'] || p['ITS_BRACKET_' + k + '_RATE']) blockers.push({ code: 'ITS_BRACKET_GAP', message: 'Tranche ' + k + ' définie alors que la tranche ' + (k - 1) + ' ne l\'est pas.' })
  }
  if (blockers.length) return { ok: false, blockers }
  if (!isZero(brackets[0].from)) blockers.push({ code: 'ITS_BRACKET_START', message: 'La tranche 1 doit commencer à 0 (la tranche exonérée est une tranche à taux 0 explicite).' })
  for (let i = 1; i < brackets.length; i++) {
    if (parseMoney(brackets[i].from, 'tranche ' + (i + 1)) <= parseMoney(brackets[i - 1].from, 'tranche ' + i)) blockers.push({ code: 'ITS_BRACKET_ORDER', message: 'Les bornes des tranches doivent être strictement croissantes.' })
  }
  for (const c of ['ITS_ORTB_MARCH', 'ITS_ORTB_JUNE', 'ITS_ORTB_JUNE_MIN_BASE']) {
    if (p[c].unit !== 'XOF' || p[c].currency !== 'XOF' || !AMOUNT.test(p[c].value)) blockers.push({ code: 'ORTB_FORMAT', message: c + ' : montant XOF invalide (0 autorisé si aucun montant).' })
  }
  if (p['VPS_RATE'].unit !== 'ratio' || !RATIO.test(p['VPS_RATE'].value)) blockers.push({ code: 'VPS_RATE_FORMAT', message: 'VPS_RATE : ratio décimal exigé.' })
  if (blockers.length) return { ok: false, blockers }

  const trace = Object.keys(p).sort().map(k => p[k])
  return {
    ok: true, trace,
    rules: {
      fiscalYear, brackets,
      ortbMarch: p['ITS_ORTB_MARCH'].value, ortbJune: p['ITS_ORTB_JUNE'].value, ortbJuneMinBase: p['ITS_ORTB_JUNE_MIN_BASE'].value,
      vpsRate: p['VPS_RATE'].value,
      legalRef: trace.map(t => t.sourceCode + ' ' + t.articleReference).filter((v, i, a) => a.indexOf(v) === i).join(' ; '),
    },
  }
}
