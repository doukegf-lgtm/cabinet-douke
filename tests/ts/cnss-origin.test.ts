import test from 'node:test'
import assert from 'node:assert/strict'
import { findCnssOriginViolations } from '../../lib/fiscal/engine/cnss-origin'
import type { DebtInput } from '../../lib/fiscal/engine/debts'

const makeDebt = (overrides: Partial<DebtInput> = {}): DebtInput => ({
  id: 'D1',
  organism: 'CNSS',
  nature: 'Cotisations sociales',
  period: '2025',
  type: 'social',
  credits: '0',
  ...overrides,
})

test('cnss-origin : reconnaît CNSS avec ponctuation', () => {
  const result = findCnssOriginViolations([makeDebt({ organism: 'C.N.S.S.' })])
  assert.equal(result[0]?.code, 'CNSS_ORIGIN_REQUIRED')
})

test('cnss-origin : reconnaît la dénomination complète', () => {
  const result = findCnssOriginViolations([
    makeDebt({ organism: 'Caisse nationale de s\u00e9curit\u00e9 sociale' }),
  ])
  assert.equal(result[0]?.code, 'CNSS_ORIGIN_REQUIRED')
})

test('cnss-origin : ignore une mention générique de sécurité sociale', () => {
  const result = findCnssOriginViolations([
    makeDebt({
      organism: 'Organisme de s\u00e9curit\u00e9 sociale',
      nature: 'Cotisations g\u00e9n\u00e9rales',
    }),
  ])
  assert.equal(result.length, 0)
})

test('cnss-origin : accepte une notification historique', () => {
  const result = findCnssOriginViolations([
    makeDebt({ origin: 'historical_notice' }),
  ])
  assert.equal(result.length, 0)
})

test('cnss-origin : bloque une dette CNSS issue de la paie', () => {
  const result = findCnssOriginViolations([
    makeDebt({ origin: 'payroll' }),
  ])
  assert.equal(result[0]?.code, 'CNSS_PAYROLL_DUPLICATE')
})

test('cnss-origin : ne bloque pas une dette DGI', () => {
  const result = findCnssOriginViolations([
    makeDebt({ organism: 'DGI', nature: 'TVA', type: 'fiscal' }),
  ])
  assert.equal(result.length, 0)
})