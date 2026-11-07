import { handleCalculationPost, rulesBlocked, calcError } from '@/lib/fiscal/calc-route'
import { resolveValidatedRetenuesRules } from '@/lib/fiscal/engine/vat-withholding-rules'
import { parseRetenuesSection } from '@/lib/fiscal/vat-withholding-input'
import { computeRetenues } from '@/lib/fiscal/engine/aib-retenues'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** POST { dossier_id, fiscal_year, calc_date? } — section « withholding » validée + règles validées. Sans calc_date : pas de pénalités. */
export async function POST(request: Request) {
  return handleCalculationPost(request, {
    sectionCode: 'withholding', kind: 'retenues', engineVersion: 'retenues-1.0.0',
    async run({ client, fiscalYear, calcDate, payload }) {
      const res = await resolveValidatedRetenuesRules(client, fiscalYear)
      if (!res.ok) return rulesBlocked(res.blockers)
      try {
        const result = computeRetenues(parseRetenuesSection(payload), res.rules, fiscalYear, calcDate)
        return { ok: true, result, trace: { rules_trace: res.trace }, totals: result.totals }
      } catch (e) {
        return calcError(e)
      }
    },
  })
}
