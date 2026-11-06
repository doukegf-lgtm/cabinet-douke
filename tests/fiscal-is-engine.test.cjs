const { test } = require('node:test')
const assert = require('node:assert/strict')
const { calculateIs } = require('../.fiscal-test-build/is.js')

function rule(id, code, value, unit, sourceCode = `SOURCE_${code}`) {
  return {
    id,
    code,
    value,
    unit,
    currency: unit === 'XOF' ? 'XOF' : null,
    sourceId: `SOURCE_ID_${code}`,
    sourceCode,
    articleReference: `Article applicable ${code}`,
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
  }
}

const validRules = {
  status: 'validated',
  fiscalYear: 2026,
  isRate: rule('rule-is', 'IS_RATE_TEST', '0.30', 'ratio'),
  minimumRate: rule('rule-min-rate', 'IS_MIN_RATE_TEST', '0.01', 'ratio'),
  minimumFloor: rule('rule-min-floor', 'IS_MIN_FLOOR_TEST', '50000', 'XOF'),
}

function input(overrides = {}) {
  return {
    fiscalYear: 2026,
    taxRegime: 'REEL_NORMAL',
    sourceMode: 'actual',
    amounts: {
      ca_fiscal_ht: '10000000',
      charges_comptables: '4000000',
      charges_deductibles_justifiees: '3500000',
      reintegrations_fiscales: '500000',
      deductions_fiscales: '200000',
      acomptes_is_justifies: '300000',
      credits_is_valides: '100000',
    },
    rules: structuredClone(validRules),
    ...overrides,
  }
}

test('IS : formule avec charges comptables', () => {
  const result = calculateIs(input())

  assert.equal(result.status, 'provisional')
  assert.equal(result.formulaVariant, 'accounting_charges')
  assert.equal(result.taxableResultXof, '6300000.00')
  assert.equal(result.isBeforeMinimumXof, '1890000.00')
  assert.equal(result.minimumTaxXof, '100000.00')
  assert.equal(result.grossIsXof, '1890000.00')
  assert.equal(result.netIsPayableXof, '1490000.00')
})

test('IS : formule de repli avec charges déductibles', () => {
  const result = calculateIs(input({
    amounts: {
      ca_fiscal_ht: '10000000',
      charges_comptables: null,
      charges_deductibles_justifiees: '3500000',
      reintegrations_fiscales: null,
      deductions_fiscales: '200000',
      acomptes_is_justifies: '0',
      credits_is_valides: '0',
    },
  }))

  assert.equal(result.status, 'provisional')
  assert.equal(result.formulaVariant, 'deductible_charges_fallback')
  assert.equal(result.taxableResultXof, '6300000.00')
  assert.equal(result.isBeforeMinimumXof, '1890000.00')
  assert.ok(result.warnings.some(w => w.includes('Formule de repli')))
})

test('IS : priorité aux charges comptables lorsque les deux sont renseignées', () => {
  const result = calculateIs(input())

  assert.equal(result.taxableResultXof, '6300000.00')
  assert.equal(result.formulaVariant, 'accounting_charges')
})

test('IS : résultat fiscal négatif, base ramenée à zéro', () => {
  const result = calculateIs(input({
    amounts: {
      ca_fiscal_ht: '1000000',
      charges_comptables: '3000000',
      charges_deductibles_justifiees: '0',
      reintegrations_fiscales: '0',
      deductions_fiscales: '0',
      acomptes_is_justifies: '0',
      credits_is_valides: '0',
    },
  }))

  assert.equal(result.taxableResultXof, '-2000000.00')
  assert.equal(result.isBeforeMinimumXof, '0.00')
  assert.equal(result.minimumTaxXof, '50000.00')
  assert.equal(result.grossIsXof, '50000.00')
  assert.ok(result.warnings.some(w => w.includes('déficits reportables')))
})

test('IS : le plancher réglementaire domine le taux minimum', () => {
  const result = calculateIs(input({
    amounts: {
      ca_fiscal_ht: '100000',
      charges_comptables: '90000',
      charges_deductibles_justifiees: '0',
      reintegrations_fiscales: '0',
      deductions_fiscales: '0',
      acomptes_is_justifies: '0',
      credits_is_valides: '0',
    },
  }))

  assert.equal(result.isBeforeMinimumXof, '3000.00')
  assert.equal(result.minimumTaxXof, '50000.00')
  assert.equal(result.grossIsXof, '50000.00')
})

test('IS : le taux minimum domine le plancher réglementaire', () => {
  const rules = structuredClone(validRules)
  rules.minimumRate.value = '0.05'

  const result = calculateIs(input({
    amounts: {
      ca_fiscal_ht: '10000000',
      charges_comptables: '9900000',
      charges_deductibles_justifiees: '0',
      reintegrations_fiscales: '0',
      deductions_fiscales: '0',
      acomptes_is_justifies: '0',
      credits_is_valides: '0',
    },
    rules,
  }))

  assert.equal(result.isBeforeMinimumXof, '30000.00')
  assert.equal(result.minimumTaxXof, '500000.00')
  assert.equal(result.grossIsXof, '500000.00')
})

test('IS : acomptes et crédits ne peuvent pas rendre le montant dû négatif', () => {
  const result = calculateIs(input({
    amounts: {
      ca_fiscal_ht: '10000000',
      charges_comptables: '4000000',
      charges_deductibles_justifiees: '0',
      reintegrations_fiscales: '500000',
      deductions_fiscales: '200000',
      acomptes_is_justifies: '5000000',
      credits_is_valides: '5000000',
    },
  }))

  assert.equal(result.netIsPayableXof, '0.00')
})

test('IS : blocage si acomptes ou crédits ne sont pas renseignés', () => {
  const result = calculateIs(input({
    amounts: {
      ca_fiscal_ht: '10000000',
      charges_comptables: '4000000',
      charges_deductibles_justifiees: '0',
      reintegrations_fiscales: '500000',
      deductions_fiscales: '200000',
      acomptes_is_justifies: null,
      credits_is_valides: null,
    },
  }))

  assert.equal(result.status, 'blocked')
  assert.ok(result.blockers.some(b => b.code === 'ADVANCES_MISSING'))
  assert.ok(result.blockers.some(b => b.code === 'CREDITS_MISSING'))
  assert.equal(result.netIsPayableXof, null)
})

test('IS : blocage sans règles réglementaires validées', () => {
  const result = calculateIs(input({ rules: null }))

  assert.equal(result.status, 'blocked')
  assert.ok(result.blockers.some(b => b.code === 'VALIDATED_IS_RULES_MISSING'))
  assert.equal(result.netIsPayableXof, null)
})

test('IS : blocage si une règle ne couvre pas tout l’exercice', () => {
  const rules = structuredClone(validRules)
  rules.minimumRate.effectiveTo = '2026-06-30'

  const result = calculateIs(input({ rules }))

  assert.equal(result.status, 'blocked')
  assert.ok(result.blockers.some(b => b.code === 'INVALID_IS_RULES'))
})

test('IS : blocage si l’exercice des règles ne correspond pas', () => {
  const rules = structuredClone(validRules)
  rules.fiscalYear = 2025

  const result = calculateIs(input({ rules }))

  assert.equal(result.status, 'blocked')
  assert.ok(result.blockers.some(b => b.code === 'INVALID_IS_RULES'))
})

test('IS : TPS ne produit aucun montant IS', () => {
  const result = calculateIs(input({ taxRegime: 'TPS' }))

  assert.equal(result.status, 'provisional')
  assert.equal(result.taxableResultXof, null)
  assert.equal(result.netIsPayableXof, null)
  assert.equal(result.ruleTrace, null)
})

test('IS : rejet des montants mal formés', () => {
  const result = calculateIs(input({
    amounts: {
      ca_fiscal_ht: '10,000,000',
      charges_comptables: '4000000',
      charges_deductibles_justifiees: '0',
      reintegrations_fiscales: '0',
      deductions_fiscales: '0',
      acomptes_is_justifies: '0',
      credits_is_valides: '0',
    },
  }))

  assert.equal(result.status, 'blocked')
  assert.ok(result.blockers.some(b => b.code === 'INVALID_AMOUNT_FORMAT'))
})

test('IS : rejet des nombres JS fractionnaires', () => {
  const result = calculateIs(input({
    amounts: {
      ca_fiscal_ht: 10000000.5,
      charges_comptables: '4000000',
      charges_deductibles_justifiees: '0',
      reintegrations_fiscales: '0',
      deductions_fiscales: '0',
      acomptes_is_justifies: '0',
      credits_is_valides: '0',
    },
  }))

  assert.equal(result.status, 'blocked')
  assert.ok(result.blockers.some(b => b.code === 'INVALID_AMOUNT_FORMAT'))
})

test('IS : traçabilité des trois paramètres et de leurs sources', () => {
  const result = calculateIs(input())

  assert.equal(result.status, 'provisional')
  assert.equal(result.ruleTrace.isRate.code, 'IS_RATE_TEST')
  assert.equal(result.ruleTrace.isRate.sourceCode, 'SOURCE_IS_RATE_TEST')
  assert.equal(result.ruleTrace.minimumRate.code, 'IS_MIN_RATE_TEST')
  assert.equal(result.ruleTrace.minimumFloor.code, 'IS_MIN_FLOOR_TEST')
  assert.equal(result.ruleTrace.minimumFloor.unit, 'XOF')
  assert.equal(result.ruleTrace.fiscalYear, 2026)
})
