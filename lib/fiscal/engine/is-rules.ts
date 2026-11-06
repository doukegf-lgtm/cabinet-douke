import type { SupabaseClient } from '@supabase/supabase-js'

export type IsRuleCodes = {
  isRateCode: string
  minimumRateCode: string
  minimumFloorCode: string
}

export type ResolvedIsRule = {
  id: string
  code: string
  value: string
  unit: string | null
  currency: string | null
  sourceId: string
  sourceCode: string
  articleReference: string
  effectiveFrom: string
  effectiveTo: string | null
}

export type ResolvedIsRules = {
  status: 'validated'
  fiscalYear: number
  isRate: ResolvedIsRule
  minimumRate: ResolvedIsRule
  minimumFloor: ResolvedIsRule
}

export type IsRulesResolution =
  | { ok: true; rules: ResolvedIsRules }
  | { ok: false; blockers: Array<{ code: string; message: string }> }

type ParameterRow = {
  id: string
  entry_type: string
  code: string
  numeric_value: string | number | null
  unit: string | null
  currency: string | null
  source_entry_id: string | null
  article_reference: string | null
  effective_from: string | null
  effective_to: string | null
  verification_status: string
}

type SourceRow = {
  id: string
  entry_type: string
  code: string
  verification_status: string
}

function validRatio(value: string): boolean {
  return /^(0(\.\d{1,8})?|1(\.0{1,8})?)$/.test(value)
}

function validAmount(value: string): boolean {
  return /^\d{1,15}(\.\d{1,2})?$/.test(value)
}

export async function resolveValidatedIsRules(
  client: SupabaseClient,
  fiscalYear: number,
  codes: IsRuleCodes,
): Promise<IsRulesResolution> {
  const blockers: Array<{ code: string; message: string }> = []

  if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100) {
    return {
      ok: false,
      blockers: [{ code: 'INVALID_FISCAL_YEAR', message: 'Exercice fiscal invalide.' }],
    }
  }

  const requestedCodes = [
    codes.isRateCode,
    codes.minimumRateCode,
    codes.minimumFloorCode,
  ]

  if (
    requestedCodes.some(code => typeof code !== 'string' || !code.trim())
    || new Set(requestedCodes).size !== 3
  ) {
    return {
      ok: false,
      blockers: [{
        code: 'INVALID_IS_RULE_CODES',
        message: 'Les trois codes distincts des paramètres IS doivent être fournis.',
      }],
    }
  }

  const start = `${fiscalYear}-01-01`
  const end = `${fiscalYear}-12-31`

  const { data, error } = await client
    .from('fiscal_regulatory_entries')
    .select(
      'id,entry_type,code,numeric_value,unit,currency,source_entry_id,article_reference,effective_from,effective_to,verification_status',
    )
    .in('code', requestedCodes)
    .eq('entry_type', 'parameter')
    .eq('verification_status', 'validated')
    .lte('effective_from', start)
    .or(`effective_to.is.null,effective_to.gte.${end}`)

  if (error) {
    return {
      ok: false,
      blockers: [{
        code: 'IS_RULES_LOOKUP_FAILED',
        message: 'Impossible de consulter le référentiel réglementaire IS.',
      }],
    }
  }

  const rows = (data ?? []) as ParameterRow[]
  const byCode = new Map(rows.map(row => [row.code, row]))

  const definitions = [
    { code: codes.isRateCode, label: 'Taux IS' },
    { code: codes.minimumRateCode, label: 'Taux du minimum fiscal' },
    { code: codes.minimumFloorCode, label: 'Plancher du minimum fiscal' },
  ]

  for (const definition of definitions) {
    if (!byCode.has(definition.code)) {
      blockers.push({
        code: 'IS_RULE_MISSING_OR_NOT_APPLICABLE',
        message: `${definition.label} absent, non validé ou non applicable à l'exercice ${fiscalYear}.`,
      })
    }
  }

  if (blockers.length > 0) return { ok: false, blockers }

  const rate = byCode.get(codes.isRateCode)!
  const minimumRate = byCode.get(codes.minimumRateCode)!
  const minimumFloor = byCode.get(codes.minimumFloorCode)!

  for (const [label, row] of [
    ['Taux IS', rate],
    ['Taux du minimum fiscal', minimumRate],
    ['Plancher du minimum fiscal', minimumFloor],
  ] as const) {
    if (
      !row.source_entry_id
      || !row.article_reference?.trim()
      || !row.effective_from
      || row.verification_status !== 'validated'
    ) {
      blockers.push({
        code: 'IS_RULE_TRACE_INCOMPLETE',
        message: `${label} : source juridique, article ou période de validité incomplet.`,
      })
    }

    if (row.numeric_value === null) {
      blockers.push({
        code: 'IS_RULE_VALUE_MISSING',
        message: `${label} : valeur numérique absente.`,
      })
    }
  }

  if (blockers.length > 0) return { ok: false, blockers }

  const rateValue = String(rate.numeric_value)
  const minimumRateValue = String(minimumRate.numeric_value)
  const floorValue = String(minimumFloor.numeric_value)

  // Convention volontairement stricte :
  // les deux taux doivent être stockés comme ratios décimaux (ex. 0.30),
  // et non comme pourcentages (ex. 30).
  if (
    rate.unit !== 'ratio'
    || minimumRate.unit !== 'ratio'
    || !validRatio(rateValue)
    || !validRatio(minimumRateValue)
  ) {
    return {
      ok: false,
      blockers: [{
        code: 'IS_RATE_FORMAT_INVALID',
        message: 'Les taux IS doivent être des ratios décimaux entre 0 et 1, avec l’unité ratio.',
      }],
    }
  }

  if (
    minimumFloor.unit !== 'XOF'
    || minimumFloor.currency !== 'XOF'
    || !validAmount(floorValue)
  ) {
    return {
      ok: false,
      blockers: [{
        code: 'IS_MINIMUM_FLOOR_INVALID',
        message: 'Le plancher du minimum fiscal doit être un montant XOF valide.',
      }],
    }
  }

  const sourceIds = [
    rate.source_entry_id!,
    minimumRate.source_entry_id!,
    minimumFloor.source_entry_id!,
  ]

  const { data: sources, error: sourceError } = await client
    .from('fiscal_regulatory_entries')
    .select('id,entry_type,code,verification_status')
    .in('id', Array.from(new Set(sourceIds)))

  if (sourceError) {
    return {
      ok: false,
      blockers: [{
        code: 'IS_LEGAL_SOURCES_LOOKUP_FAILED',
        message: 'Impossible de vérifier les textes juridiques sources.',
      }],
    }
  }

  const sourceMap = new Map(
    ((sources ?? []) as SourceRow[]).map(source => [source.id, source]),
  )

  for (const [label, row] of [
    ['Taux IS', rate],
    ['Taux du minimum fiscal', minimumRate],
    ['Plancher du minimum fiscal', minimumFloor],
  ] as const) {
    const source = sourceMap.get(row.source_entry_id!)

    if (
      !source
      || source.entry_type !== 'legal_source'
      || source.verification_status !== 'validated'
    ) {
      blockers.push({
        code: 'IS_LEGAL_SOURCE_NOT_VALIDATED',
        message: `${label} : le texte juridique source n'est pas validé.`,
      })
    }
  }

  if (blockers.length > 0) return { ok: false, blockers }

  function normalize(row: ParameterRow): ResolvedIsRule {
    const source = sourceMap.get(row.source_entry_id!)!

    return {
      id: row.id,
      code: row.code,
      value: String(row.numeric_value),
      unit: row.unit,
      currency: row.currency,
      sourceId: source.id,
      sourceCode: source.code,
      articleReference: row.article_reference!,
      effectiveFrom: row.effective_from!,
      effectiveTo: row.effective_to,
    }
  }

  return {
    ok: true,
    rules: {
      status: 'validated',
      fiscalYear,
      isRate: normalize(rate),
      minimumRate: normalize(minimumRate),
      minimumFloor: normalize(minimumFloor),
    },
  }
}
