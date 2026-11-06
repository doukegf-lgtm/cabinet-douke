/**
 * Moteur IS - Cabinet DOUKE
 *
 * Calcul déterministe, sans taux légal codé en dur.
 * Les trois paramètres doivent provenir du résolveur réglementaire.
 * Arithmétique monétaire exacte en centimes XOF avec BigInt.
 */

import type { ResolvedIsRules, ResolvedIsRule } from './is-rules'

export const IS_ENGINE_VERSION = '1.1.0-dev'

export type AnnualIsAmounts = {
  ca_fiscal_ht: number | string | null
  charges_comptables: number | string | null
  charges_deductibles_justifiees: number | string | null
  reintegrations_fiscales: number | string | null
  deductions_fiscales: number | string | null
  acomptes_is_justifies: number | string | null
  credits_is_valides: number | string | null
}

export type ValidatedIsRules = ResolvedIsRules

export type IsCalculationInput = {
  fiscalYear: number
  taxRegime: string | null
  sourceMode: 'actual' | 'estimated'
  amounts: AnnualIsAmounts
  rules: ValidatedIsRules | null
}

type RuleTraceItem = {
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

export type IsCalculationResult = {
  engineVersion: string
  module: 'IS'
  fiscalYear: number
  status: 'blocked' | 'provisional'
  formulaVariant: 'accounting_charges' | 'deductible_charges_fallback' | null
  currency: 'XOF'
  taxableResultXof: string | null
  isBeforeMinimumXof: string | null
  minimumTaxXof: string | null
  grossIsXof: string | null
  advancesXof: string | null
  creditsXof: string | null
  netIsPayableXof: string | null
  blockers: Array<{ code: string; message: string }>
  warnings: string[]
  ruleTrace: null | {
    fiscalYear: number
    isRate: RuleTraceItem
    minimumRate: RuleTraceItem
    minimumFloor: RuleTraceItem
  }
}

/**
 * Les nombres JS ne sont admis que s'ils sont des entiers sûrs.
 * Pour les montants avec décimales, transmettre une chaîne.
 */
function toCents(value: number | string | null): bigint | null {
  if (value === null || value === '') return null

  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new Error(
      'Montant numérique non entier ou non sûr : fournir une chaîne décimale.',
    )
  }

  const raw = String(value).trim()

  if (!/^\d{1,15}(\.\d{1,2})?$/.test(raw)) {
    throw new Error(
      'Montant invalide : format décimal XOF attendu, deux décimales maximum.',
    )
  }

  const [whole, fraction = ''] = raw.split('.')
  return BigInt(whole) * BigInt('100')
    + BigInt((fraction + '00').slice(0, 2))
}

function formatCents(value: bigint): string {
  const negative = value < BigInt('0')
  const absolute = negative ? -value : value
  const whole = absolute / BigInt('100')
  const fraction = String(absolute % BigInt('100')).padStart(2, '0')
  return `${negative ? '-' : ''}${whole}.${fraction}`
}

function toRateScale(value: string): bigint {
  if (!/^(0(\.\d{1,8})?|1(\.0{1,8})?)$/.test(value)) {
    throw new Error('Taux invalide : ratio attendu entre 0 et 1.')
  }

  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole) * BigInt('100000000')
    + BigInt((fraction + '00000000').slice(0, 8))
}

/** Arrondi commercial au centime, sans calcul flottant. */
function applyRate(baseCents: bigint, rateScale: bigint): bigint {
  const numerator = baseCents * rateScale
  const denominator = BigInt('100000000')
  return (numerator + denominator / BigInt('2')) / denominator
}

function addBlocker(
  blockers: IsCalculationResult['blockers'],
  code: string,
  message: string,
) {
  if (!blockers.some(item => item.code === code)) {
    blockers.push({ code, message })
  }
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime())
    && date.toISOString().slice(0, 10) === value
}

function validateRule(
  rule: ResolvedIsRule,
  fiscalYear: number,
  label: string,
  expectedUnit: 'ratio' | 'XOF',
): bigint {
  if (
    !rule.id?.trim()
    || !rule.code?.trim()
    || !rule.sourceId?.trim()
    || !rule.sourceCode?.trim()
    || !rule.articleReference?.trim()
    || !rule.effectiveFrom
    || !isIsoDate(rule.effectiveFrom)
    || (rule.effectiveTo !== null && !isIsoDate(rule.effectiveTo))
  ) {
    throw new Error(`${label} : traçabilité juridique incomplète ou invalide.`)
  }

  const yearStart = `${fiscalYear}-01-01`
  const yearEnd = `${fiscalYear}-12-31`

  if (
    rule.effectiveFrom > yearStart
    || (rule.effectiveTo !== null && rule.effectiveTo < yearEnd)
  ) {
    throw new Error(
      `${label} : la règle ne couvre pas intégralement l'exercice ${fiscalYear}.`,
    )
  }

  if (rule.effectiveTo !== null && rule.effectiveTo < rule.effectiveFrom) {
    throw new Error(`${label} : période de validité incohérente.`)
  }

  if (expectedUnit === 'ratio') {
    if (rule.unit !== 'ratio' || rule.currency !== null) {
      throw new Error(`${label} : unité ratio attendue, sans devise.`)
    }
    return toRateScale(rule.value)
  }

  if (rule.unit !== 'XOF' || rule.currency !== 'XOF') {
    throw new Error(`${label} : unité et devise XOF obligatoires.`)
  }

  const amount = toCents(rule.value)
  if (amount === null) {
    throw new Error(`${label} : plancher réglementaire absent.`)
  }
  return amount
}

function traceRule(rule: ResolvedIsRule): RuleTraceItem {
  return {
    id: rule.id,
    code: rule.code,
    value: rule.value,
    unit: rule.unit,
    currency: rule.currency,
    sourceId: rule.sourceId,
    sourceCode: rule.sourceCode,
    articleReference: rule.articleReference,
    effectiveFrom: rule.effectiveFrom,
    effectiveTo: rule.effectiveTo,
  }
}

export function calculateIs(input: IsCalculationInput): IsCalculationResult {
  const blockers: IsCalculationResult['blockers'] = []
  const warnings: string[] = []

  const emptyResult = (
    status: IsCalculationResult['status'],
    extra: Partial<IsCalculationResult> = {},
  ): IsCalculationResult => ({
    engineVersion: IS_ENGINE_VERSION,
    module: 'IS',
    fiscalYear: input.fiscalYear,
    status,
    formulaVariant: null,
    currency: 'XOF',
    taxableResultXof: null,
    isBeforeMinimumXof: null,
    minimumTaxXof: null,
    grossIsXof: null,
    advancesXof: null,
    creditsXof: null,
    netIsPayableXof: null,
    blockers,
    warnings,
    ruleTrace: null,
    ...extra,
  })

  if (
    !Number.isInteger(input.fiscalYear)
    || input.fiscalYear < 2000
    || input.fiscalYear > 2100
  ) {
    addBlocker(blockers, 'INVALID_FISCAL_YEAR', 'Exercice fiscal invalide.')
    return emptyResult('blocked')
  }

  if (input.taxRegime === 'TPS') {
    return emptyResult('provisional', {
      warnings: [
        'IS non calculé : le régime TPS doit être traité selon ses règles propres.',
      ],
    })
  }

  if (!input.taxRegime?.trim()) {
    addBlocker(
      blockers,
      'TAX_REGIME_MISSING',
      'Le régime fiscal de l’entreprise doit être déterminé.',
    )
  }

  let ca: bigint | null = null
  let accountingCharges: bigint | null = null
  let deductibleCharges: bigint | null = null
  let reintegrations: bigint | null = null
  let deductions: bigint | null = null
  let advances: bigint | null = null
  let credits: bigint | null = null

  try {
    ca = toCents(input.amounts.ca_fiscal_ht)
    accountingCharges = toCents(input.amounts.charges_comptables)
    deductibleCharges = toCents(input.amounts.charges_deductibles_justifiees)
    reintegrations = toCents(input.amounts.reintegrations_fiscales)
    deductions = toCents(input.amounts.deductions_fiscales)
    advances = toCents(input.amounts.acomptes_is_justifies)
    credits = toCents(input.amounts.credits_is_valides)
  } catch (error) {
    addBlocker(
      blockers,
      'INVALID_AMOUNT_FORMAT',
      error instanceof Error ? error.message : 'Format de montant invalide.',
    )
    return emptyResult('blocked')
  }

  if (ca === null) {
    addBlocker(
      blockers,
      'TURNOVER_MISSING',
      'Le chiffre d’affaires fiscal HT est obligatoire.',
    )
  }

  let formulaVariant: IsCalculationResult['formulaVariant'] = null
  let taxableResult: bigint | null = null

  if (accountingCharges !== null) {
    formulaVariant = 'accounting_charges'

    if (reintegrations === null) {
      addBlocker(
        blockers,
        'REINTEGRATIONS_MISSING',
        'Les réintégrations doivent être renseignées, y compris à zéro.',
      )
    }
    if (deductions === null) {
      addBlocker(
        blockers,
        'DEDUCTIONS_MISSING',
        'Les déductions doivent être renseignées, y compris à zéro.',
      )
    }

    if (ca !== null && reintegrations !== null && deductions !== null) {
      taxableResult = ca - accountingCharges + reintegrations - deductions
    }
  } else {
    formulaVariant = 'deductible_charges_fallback'

    if (deductibleCharges === null) {
      addBlocker(
        blockers,
        'DEDUCTIBLE_CHARGES_MISSING',
        'Renseignez les charges comptables ou les charges déductibles justifiées.',
      )
    }
    if (deductions === null) {
      addBlocker(
        blockers,
        'DEDUCTIONS_MISSING',
        'Les déductions doivent être renseignées, y compris à zéro.',
      )
    }

    if (ca !== null && deductibleCharges !== null && deductions !== null) {
      taxableResult = ca - deductibleCharges - deductions
    }

    warnings.push(
      'Formule de repli utilisée : les réintégrations ne sont pas prises en compte, conformément à la formule V4 du classeur.',
    )
  }

  if (taxableResult !== null && taxableResult < BigInt('0')) {
    warnings.push(
      'Résultat fiscal négatif : la base d’IS avant minimum est ramenée à zéro. Le traitement des déficits reportables reste à vérifier.',
    )
  }

  if (input.sourceMode === 'estimated') {
    warnings.push(
      'Données estimatives : résultat provisoire, non utilisable comme liquidation certifiée.',
    )
  }

  if (advances === null) {
    addBlocker(
      blockers,
      'ADVANCES_MISSING',
      'Les acomptes IS doivent être renseignés, y compris à zéro.',
    )
  }
  if (credits === null) {
    addBlocker(
      blockers,
      'CREDITS_MISSING',
      'Les crédits IS doivent être renseignés, y compris à zéro.',
    )
  }

  let isRateScale: bigint | null = null
  let minimumRateScale: bigint | null = null
  let minimumFloor: bigint | null = null

  if (!input.rules || input.rules.status !== 'validated') {
    addBlocker(
      blockers,
      'VALIDATED_IS_RULES_MISSING',
      'Aucun jeu complet de règles IS validées n’est disponible.',
    )
  } else {
    try {
      if (input.rules.fiscalYear !== input.fiscalYear) {
        throw new Error('Les règles résolues ne correspondent pas à l’exercice demandé.')
      }

      isRateScale = validateRule(
        input.rules.isRate,
        input.fiscalYear,
        'Taux IS',
        'ratio',
      )
      minimumRateScale = validateRule(
        input.rules.minimumRate,
        input.fiscalYear,
        'Taux du minimum fiscal',
        'ratio',
      )
      minimumFloor = validateRule(
        input.rules.minimumFloor,
        input.fiscalYear,
        'Plancher du minimum fiscal',
        'XOF',
      )

      if (
        input.rules.isRate.id === input.rules.minimumRate.id
        || input.rules.isRate.id === input.rules.minimumFloor.id
        || input.rules.minimumRate.id === input.rules.minimumFloor.id
        || input.rules.isRate.code === input.rules.minimumRate.code
        || input.rules.isRate.code === input.rules.minimumFloor.code
        || input.rules.minimumRate.code === input.rules.minimumFloor.code
      ) {
        throw new Error('Les trois paramètres IS doivent être distincts.')
      }
    } catch (error) {
      addBlocker(
        blockers,
        'INVALID_IS_RULES',
        error instanceof Error ? error.message : 'Règles IS invalides.',
      )
      isRateScale = null
      minimumRateScale = null
      minimumFloor = null
    }
  }

  if (
    blockers.length > 0
    || ca === null
    || taxableResult === null
    || isRateScale === null
    || minimumRateScale === null
    || minimumFloor === null
    || advances === null
    || credits === null
    || !input.rules
  ) {
    return emptyResult('blocked', {
      formulaVariant,
      taxableResultXof: taxableResult === null
        ? null
        : formatCents(taxableResult),
    })
  }

  const taxableBase = taxableResult > BigInt('0')
    ? taxableResult
    : BigInt('0')

  const isBeforeMinimum = applyRate(taxableBase, isRateScale)
  const minimumByRate = applyRate(ca, minimumRateScale)
  const minimumTax = minimumByRate > minimumFloor
    ? minimumByRate
    : minimumFloor

  const grossIs = isBeforeMinimum > minimumTax
    ? isBeforeMinimum
    : minimumTax

  const netIs = grossIs - advances - credits
  const payable = netIs > BigInt('0') ? netIs : BigInt('0')

  return emptyResult('provisional', {
    formulaVariant,
    taxableResultXof: formatCents(taxableResult),
    isBeforeMinimumXof: formatCents(isBeforeMinimum),
    minimumTaxXof: formatCents(minimumTax),
    grossIsXof: formatCents(grossIs),
    advancesXof: formatCents(advances),
    creditsXof: formatCents(credits),
    netIsPayableXof: formatCents(payable),
    ruleTrace: {
      fiscalYear: input.fiscalYear,
      isRate: traceRule(input.rules.isRate),
      minimumRate: traceRule(input.rules.minimumRate),
      minimumFloor: traceRule(input.rules.minimumFloor),
    },
  })
}
