const { test } = require('node:test')
const assert = require('node:assert/strict')
const { calculateCnss } = require('../.fiscal-test-build/cnss.js')

function rule(id, code, value) {
  return {
    id, code, value, unit: 'ratio',
    sourceId: `source-${id}`,
    sourceCode: `LAW-${code}`,
    articleReference: `Article ${code}`,
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
  }
}

function input(overrides = {}) {
  return {
    periods: [
      { period: '2026-01', employeeRef: 'EMP-001', baseXof: '100000.00' },
      { period: '2026-01', employeeRef: 'EMP-002', baseXof: '200000.00' },
    ],
    rulesByPeriod: {
      '2026-01': {
        status: 'validated',
        period: '2026-01',
        roundingMode: 'per_period',
        familyRate: rule('1', 'FAMILY', '0.09'),
        employerPensionRate: rule('2', 'EMPLOYER_PENSION', '0.064'),
        employeePensionRate: rule('3', 'EMPLOYEE_PENSION', '0.036'),
        riskRate: rule('4', 'RISK', '0.01'),
      },
    },
    ...overrides,
  }
}

test('CNSS : calcule séparément les cotisations patronales et salariales', () => {
  const result = calculateCnss(input())
  assert.equal(result.status, 'provisional')
  assert.equal(result.employerFamilyXof, '27000.00')
  assert.equal(result.employerPensionXof, '19200.00')
  assert.equal(result.employerRiskXof, '3000.00')
  assert.equal(result.employeePensionXof, '10800.00')
  assert.equal(result.totalEmployerXof, '49200.00')
  assert.equal(result.totalCnssXof, '60000.00')
})

test('CNSS : bloque en absence de règles validées', () => {
  const data = input()
  data.rulesByPeriod['2026-01'].status = 'unvalidated'
  const result = calculateCnss(data)
  assert.equal(result.status, 'blocked')
  assert.equal(result.totalCnssXof, null)
})

test('CNSS : bloque les montants décimaux transmis comme nombres', () => {
  const data = input()
  data.periods[0].baseXof = 100000.50
  const result = calculateCnss(data)
  assert.equal(result.status, 'blocked')
})

test('CNSS : bloque les doublons salarié-période', () => {
  const data = input()
  data.periods.push({ ...data.periods[0] })
  const result = calculateCnss(data)
  assert.equal(result.status, 'blocked')
})

test('CNSS : bloque si la référence juridique manque', () => {
  const data = input()
  data.rulesByPeriod['2026-01'].familyRate.articleReference = ''
  const result = calculateCnss(data)
  assert.equal(result.status, 'blocked')
})
