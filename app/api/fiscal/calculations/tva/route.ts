import { handleCalculationPost, rulesBlocked, calcError } from '@/lib/fiscal/calc-route'
import { resolveValidatedTvaRules } from '@/lib/fiscal/engine/vat-withholding-rules'
import { parseTvaSection } from '@/lib/fiscal/vat-withholding-input'
import { computeTva } from '@/lib/fiscal/engine/tva'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** POST { dossier_id, fiscal_year, calc_date? } — section « vat » validée + règles validées. Sans calc_date : pas de pénalités. */
export async function POST(request: Request) {
  return handleCalculationPost(request, {
    sectionCode: 'vat', kind: 'tva', engineVersion: 'tva-1.0.0',
    async run({ client, fiscalYear, calcDate, payload }) {
      const res = await resolveValidatedTvaRules(client, fiscalYear)
      if (!res.ok) return rulesBlocked(res.blockers)
      try {
        const result = computeTva(parseTvaSection(payload), res.rules, fiscalYear, calcDate)
        return { ok: true, result, trace: { rules_trace: res.trace }, totals: result.totals }
      } catch (e) {
        return calcError(e)
      }
    },
  })
}
