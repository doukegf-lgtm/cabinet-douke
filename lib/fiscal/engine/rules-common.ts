import type { SupabaseClient } from '@supabase/supabase-js'

export type Blocker = { code: string; message: string }

export type ResolvedParam = {
  id: string; code: string; value: string; unit: string | null; currency: string | null
  sourceId: string; sourceCode: string; articleReference: string
  effectiveFrom: string; effectiveTo: string | null
}

type Row = {
  id: string; entry_type: string; code: string; numeric_value: string | number | null
  unit: string | null; currency: string | null; source_entry_id: string | null
  article_reference: string | null; effective_from: string | null; effective_to: string | null
  verification_status: string
}
type SourceRow = { id: string; entry_type: string; code: string; verification_status: string }

/**
 * Lit dans fiscal_regulatory_entries les paramètres demandés, UNIQUEMENT s'ils sont validés,
 * couvrent tout l'exercice, ont une source juridique (legal_source) validée et un article.
 * Les codes absents sont simplement omis du résultat (c'est à l'appelant de décider s'ils sont obligatoires).
 * Doublons validés sur un même code => blocage (jamais de choix silencieux).
 */
export async function resolveValidatedParameters(
  client: SupabaseClient, fiscalYear: number, codes: string[], label: string,
): Promise<{ ok: true; params: Record<string, ResolvedParam> } | { ok: false; blockers: Blocker[] }> {
  if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100)
    return { ok: false, blockers: [{ code: 'INVALID_FISCAL_YEAR', message: 'Exercice fiscal invalide.' }] }
  const start = fiscalYear + '-01-01'
  const end = fiscalYear + '-12-31'

  const { data, error } = await client
    .from('fiscal_regulatory_entries')
    .select('id,entry_type,code,numeric_value,unit,currency,source_entry_id,article_reference,effective_from,effective_to,verification_status')
    .in('code', codes)
    .eq('entry_type', 'parameter')
    .eq('verification_status', 'validated')
    .lte('effective_from', start)
    .or('effective_to.is.null,effective_to.gte.' + end)
  if (error) return { ok: false, blockers: [{ code: 'RULES_LOOKUP_FAILED', message: label + ' : référentiel inconsultable.' }] }

  const byCode: Record<string, Row[]> = {}
  const all = (data || []) as Row[]
  for (const r of all) {
    if (r.verification_status !== 'validated' || !r.effective_from || r.effective_from > start
      || (r.effective_to !== null && r.effective_to < end)) continue
    if (codes.indexOf(r.code) < 0) continue
    byCode[r.code] = (byCode[r.code] || []).concat([r])
  }
  const blockers: Blocker[] = []
  const present = Object.keys(byCode)
  for (const c of present) {
    if (byCode[c].length > 1) blockers.push({ code: 'RULE_OVERLAP', message: c + ' : plusieurs règles validées se chevauchent sur ' + fiscalYear + '.' })
  }
  if (blockers.length) return { ok: false, blockers }

  const rows = present.map(c => byCode[c][0])
  for (const r of rows) {
    if (!r.source_entry_id || !r.article_reference || !r.article_reference.trim())
      blockers.push({ code: 'RULE_TRACE_INCOMPLETE', message: r.code + ' : source juridique ou article manquant.' })
    if (r.numeric_value === null) blockers.push({ code: 'RULE_VALUE_MISSING', message: r.code + ' : valeur absente.' })
  }
  if (blockers.length) return { ok: false, blockers }

  const params: Record<string, ResolvedParam> = {}
  if (rows.length === 0) return { ok: true, params }
  const ids = Array.from(new Set(rows.map(r => r.source_entry_id as string)))
  const { data: srcData, error: srcErr } = await client
    .from('fiscal_regulatory_entries').select('id,entry_type,code,verification_status').in('id', ids)
  if (srcErr) return { ok: false, blockers: [{ code: 'SOURCES_LOOKUP_FAILED', message: label + ' : sources juridiques inconsultables.' }] }
  const sources: Record<string, SourceRow> = {}
  for (const s of ((srcData || []) as SourceRow[])) sources[s.id] = s
  for (const r of rows) {
    const s = sources[r.source_entry_id as string]
    if (!s || s.entry_type !== 'legal_source' || s.verification_status !== 'validated')
      blockers.push({ code: 'LEGAL_SOURCE_NOT_VALIDATED', message: r.code + ' : texte juridique source non validé.' })
  }
  if (blockers.length) return { ok: false, blockers }

  for (const r of rows) {
    params[r.code] = {
      id: r.id, code: r.code, value: String(r.numeric_value), unit: r.unit, currency: r.currency,
      sourceId: r.source_entry_id as string, sourceCode: sources[r.source_entry_id as string].code,
      articleReference: r.article_reference as string, effectiveFrom: r.effective_from as string, effectiveTo: r.effective_to,
    }
  }
  return { ok: true, params }
}
