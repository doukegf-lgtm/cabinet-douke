import { handleCalculationPost, rulesBlocked, calcError } from '@/lib/fiscal/calc-route'
import { resolveValidatedAibRules } from '@/lib/fiscal/engine/vat-withholding-rules'
import { parseAibSection } from '@/lib/fiscal/vat-withholding-input'
import { computeAib } from '@/lib/fiscal/engine/aib-retenues'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** POST { dossier_id, fiscal_year, calc_date? } — section « aib » validée + règles validées. Sans calc_date : pas de pénalités. */
export async function POST(request: Request) {
  return handleCalculationPost(request, {
    sectionCode: 'aib', kind: 'aib', engineVersion: 'aib-1.0.0',
    async run({ client, fiscalYear, calcDate, payload }) {
      const res = await resolveValidatedAibRules(client, fiscalYear)
      if (!res.ok) return rulesBlocked(res.blockers)
      try {
        const result = computeAib(parseAibSection(payload), res.rules, fiscalYear, calcDate)
        return { ok: true, result, trace: { rules_trace: res.trace }, totals: result.totals }
      } catch (e) {
        return calcError(e)
      }
    },
  })
}
