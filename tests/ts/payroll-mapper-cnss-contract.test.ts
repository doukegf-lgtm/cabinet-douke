import test from 'node:test'
import assert from 'node:assert/strict'
import { deriveSalaryLines, toCnssPayload } from '../../lib/fiscal/mapper/payroll-lines'
import { parseCnssSection } from '../../lib/fiscal/cnss-input'

// Contrôle de contrat : la sortie du mapper doit être acceptée telle quelle par le parseur RÉEL de la section cnss_periods.
test('cnss_periods : le payload du mapper est accepté par parseCnssSection', () => {
  const lines = deriveSalaryLines([
    { employeeId: 'A', hire: '2026-01', periods: [{ from: '2026-01', to: null, gross: '100000', bonuses: '5000', provenance: 'real' }] },
    { employeeId: 'B', hire: '2026-01', periods: [{ from: '2026-01', to: null, gross: '300000', provenance: 'estimated' }] }], '2026-03')
  const payload = toCnssPayload(lines, [
    { from: '2026-01', to: '2026-02', payment: 'yes', paymentDate: '2026-03-10' },
    { from: '2026-03', to: '2026-03', payment: 'partial', amountPaid: '100000' }], { headcount: 2, rpRate: '0.02' })
  const parsed = parseCnssSection(payload)
  assert.equal(parsed.headcount, 2)
  assert.equal(parsed.rpRateDefault, '0.02')
  assert.equal(parsed.lines.length, 6)
})
