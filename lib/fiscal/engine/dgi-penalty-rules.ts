import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveValidatedParameters, type Blocker, type ResolvedParam } from './rules-common'
import type { DgiPenaltyRules } from './dgi-penalties'

/**
 * Codes attendus (type parameter, statut validated, source juridique validée, article renseigné) :
 *  DGI_ITS_DUE_DAY          unit day     jour d'échéance du mois suivant (1..28)
 *  DGI_487_RATE             unit ratio   majoration de retard (art. 487) ; 0 autorisé = non appliquée (décision validée)
 *  DGI_488_RATE_MONTHLY     unit ratio   intérêt de retard par mois ou fraction (art. 488)
 *  DGI_491_RATE             unit ratio   pénalité sur retenue non reversée (art. 491)
 *  DGI_491_MIN_MONTHLY      unit XOF     minimum par mois de déclaration
 *  DGI_491_RAISED_RATE      unit ratio   taux majoré (égal à DGI_491_RATE s'il n'est pas appliqué)
 *  DGI_491_RAISED_AFTER_MONTHS unit months  seuil de mois PLEINS au-delà duquel le taux majoré s'applique
 */
export const DGI_PENALTY_CODES = {
  dueDay: 'DGI_ITS_DUE_DAY', r487: 'DGI_487_RATE', r488: 'DGI_488_RATE_MONTHLY', r491: 'DGI_491_RATE',
  min491: 'DGI_491_MIN_MONTHLY', r491Raised: 'DGI_491_RAISED_RATE', raisedAfter: 'DGI_491_RAISED_AFTER_MONTHS',
} as const
const RATIO = /^(0|1|0\.\d{1,6}|1\.0{1,6})$/
const AMOUNT = /^\d{1,15}(\.\d{1,2})?$/
const INT = /^\d{1,3}(\.0+)?$/

export type DgiPenaltyRulesResolution =
  | { ok: true; rules: DgiPenaltyRules; trace: ResolvedParam[] }
  | { ok: false; blockers: Blocker[] }

export async function resolveValidatedDgiPenaltyRules(client: SupabaseClient, fiscalYear: number): Promise<DgiPenaltyRulesResolution> {
  const codes = Object.keys(DGI_PENALTY_CODES).map(k => (DGI_PENALTY_CODES as Record<string, string>)[k])
  const res = await resolveValidatedParameters(client, fiscalYear, codes, 'Pénalités DGI')
  if (!res.ok) return res
  const p = res.params
  const blockers: Blocker[] = []
  for (const c of codes) if (!p[c]) blockers.push({ code: 'RULE_MISSING_OR_NOT_VALIDATED', message: c + " : absent, non validé ou ne couvrant pas tout l'exercice " + fiscalYear + '.' })
  if (blockers.length) return { ok: false, blockers }

  const ratio = (c: string) => { if (p[c].unit !== 'ratio' || !RATIO.test(p[c].value)) blockers.push({ code: 'PENALTY_RATE_FORMAT', message: c + ' : ratio décimal (0..1) avec unité ratio exigé.' }) }
  ;[DGI_PENALTY_CODES.r487, DGI_PENALTY_CODES.r488, DGI_PENALTY_CODES.r491, DGI_PENALTY_CODES.r491Raised].forEach(ratio)
  const m = p[DGI_PENALTY_CODES.min491]
  if (m.unit !== 'XOF' || m.currency !== 'XOF' || !AMOUNT.test(m.value)) blockers.push({ code: 'PENALTY_MIN_FORMAT', message: 'DGI_491_MIN_MONTHLY : montant XOF exigé.' })
  const d = p[DGI_PENALTY_CODES.dueDay]
  if (d.unit !== 'day' || !INT.test(d.value) || parseInt(d.value, 10) < 1 || parseInt(d.value, 10) > 28) blockers.push({ code: 'PENALTY_DUE_DAY', message: 'DGI_ITS_DUE_DAY : unité day, entier 1..28.' })
  const a = p[DGI_PENALTY_CODES.raisedAfter]
  if (a.unit !== 'months' || !INT.test(a.value)) blockers.push({ code: 'PENALTY_THRESHOLD', message: 'DGI_491_RAISED_AFTER_MONTHS : unité months, entier exigé.' })
  if (blockers.length) return { ok: false, blockers }

  const trace = Object.keys(p).sort().map(k => p[k])
  return {
    ok: true, trace,
    rules: {
      dueDay: parseInt(d.value, 10), rate487: p[DGI_PENALTY_CODES.r487].value, rate488Monthly: p[DGI_PENALTY_CODES.r488].value,
      rate491: p[DGI_PENALTY_CODES.r491].value, min491Monthly: m.value, rate491Raised: p[DGI_PENALTY_CODES.r491Raised].value,
      raisedAfterFullMonths: parseInt(a.value, 10),
      legalRef: trace.map(t => t.sourceCode + ' ' + t.articleReference).filter((v, i, arr) => arr.indexOf(v) === i).join(' ; '),
    },
  }
}
