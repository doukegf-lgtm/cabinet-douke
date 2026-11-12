import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveValidatedCnssRules, CNSS_RULE_CODES as C } from '../../lib/fiscal/engine/cnss-rules'
import { parseCnssSection } from '../../lib/fiscal/cnss-input'
import { computeCnss, type Params } from '../../lib/fiscal/engine/cnss-liquidation'

type E = Record<string, unknown>
// Faux client : renvoie params pour la requête qui sélectionne numeric_value, sources sinon.
function fake(params: E[], sources: E[], err: 'params' | 'sources' | null = null): any {
  const mk = (rows: () => E[], e: boolean) => {
    const b: any = new Proxy({}, { get: (_t, k) => k === 'then' ? (res: any) => res({ data: e ? null : rows(), error: e ? { message: 'x' } : null }) : () => b })
    return b
  }
  return { from: () => ({ select: (cols: string) => cols.includes('numeric_value') ? mk(() => params, err === 'params') : mk(() => sources, err === 'sources') }) }
}
const SRC = { id: 's1', entry_type: 'legal_source', code: 'TEST-LOI', verification_status: 'validated' }
const row = (code: string, v: string, unit: string, o: E = {}): E => ({ id: 'id-' + code, entry_type: 'parameter', code, numeric_value: v, unit, currency: unit === 'XOF' ? 'XOF' : null,
  source_entry_id: 's1', article_reference: 'Art. TEST', effective_from: '2026-01-01', effective_to: null, verification_status: 'validated', ...o })
// VALEURS DE TEST UNIQUEMENT — non réglementaires.
const full = (): E[] => [row(C.pfRate, '0.09', 'ratio'), row(C.pfCeiling, '0', 'none'), row(C.pensionEmployerRate, '0.064', 'ratio'),
  row(C.pensionEmployerCeiling, '600000', 'XOF'), row(C.pensionEmployeeRate, '0.036', 'ratio'), row(C.pensionEmployeeCeiling, '600000', 'XOF'),
  row(C.rpCeiling, '0', 'none'), row(C.dueDay, '15', 'day'), row(C.monthlyMinHeadcount, '20', 'employees'),
  row(C.lateCountingMode, '1', 'enum'), row(C.latePenaltyRate, '0.015', 'ratio')]

test('résolution complète : règles, plafonds none/XOF, procédure, traçabilité', async () => {
  const r = await resolveValidatedCnssRules(fake(full(), [SRC]), 2026)
  assert.equal(r.ok, true); if (!r.ok) return
  assert.equal(r.rules.contributionRules.length, 4)
  assert.deepEqual(r.rules.contributionRules[0].ceiling, { kind: 'none' })
  assert.deepEqual(r.rules.contributionRules[2].ceiling, { kind: 'monthly', amount: '600000' })
  assert.equal(r.rules.procedure.dueDay, 15); assert.equal(r.rules.procedure.lateCounting, 'date_to_date')
  assert.equal(r.rules.trace.length, 11); assert.match(r.rules.contributionRules[0].legalRef, /TEST-LOI Art\. TEST/)
})

test('blocages : règle absente, doublon, non validée, source non validée, format, couverture partielle, erreur base', async () => {
  const miss = full().filter(x => x.code !== C.pfRate)
  const a = await resolveValidatedCnssRules(fake(miss, [SRC]), 2026); assert.equal(a.ok, false)
  const dup = [...full(), row(C.pfRate, '0.1', 'ratio', { id: 'dup' })]
  const b = await resolveValidatedCnssRules(fake(dup, [SRC]), 2026); if (b.ok !== false) throw new Error('Blocage CNSS_RULE_OVERLAP attendu'); assert.equal(b.blockers[0].code, 'CNSS_RULE_OVERLAP')
  const nv = full().map(x => x.code === C.pfRate ? { ...x, verification_status: 'to_verify' } : x)
  assert.equal((await resolveValidatedCnssRules(fake(nv, [SRC]), 2026)).ok, false)
  const c = await resolveValidatedCnssRules(fake(full(), [{ ...SRC, verification_status: 'to_verify' }]), 2026); if (c.ok !== false) throw new Error('Blocage CNSS_LEGAL_SOURCE_NOT_VALIDATED attendu'); assert.equal(c.blockers[0].code, 'CNSS_LEGAL_SOURCE_NOT_VALIDATED')
  const pct = full().map(x => x.code === C.pfRate ? { ...x, numeric_value: '9' } : x)
  const d = await resolveValidatedCnssRules(fake(pct, [SRC]), 2026); if (d.ok !== false) throw new Error('Blocage CNSS_RATE_FORMAT_INVALID attendu'); assert.equal(d.blockers[0].code, 'CNSS_RATE_FORMAT_INVALID')
  const part = full().map(x => x.code === C.pfRate ? { ...x, effective_to: '2026-06-30' } : x)
  assert.equal((await resolveValidatedCnssRules(fake(part, [SRC]), 2026)).ok, false)
  const noArt = full().map(x => x.code === C.dueDay ? { ...x, article_reference: ' ' } : x)
  assert.equal((await resolveValidatedCnssRules(fake(noArt, [SRC]), 2026)).ok, false)
  assert.equal((await resolveValidatedCnssRules(fake(full(), [SRC], 'params'), 2026)).ok, false)
  assert.equal((await resolveValidatedCnssRules(fake(full(), [SRC], 'sources'), 2026)).ok, false)
  assert.equal((await resolveValidatedCnssRules(fake(full(), [SRC]), 1999)).ok, false)
  const ceil0 = full().map(x => x.code === C.pensionEmployerCeiling ? { ...x, numeric_value: '0' } : x)
  assert.equal((await resolveValidatedCnssRules(fake(ceil0, [SRC]), 2026)).ok, false) // XOF 0 n'est pas « aucun plafond »
})

const payload = (lines: E[], extra: E = {}) => ({ source_mode: 'actual', data: { headcount: 5, rp_rate: '0.02', lines, ...extra } })
const L = (o: E = {}): E => ({ employee_id: 'E1', period: '2026-07', gross: '300000', bonuses: '50000', payment: 'no', ...o })

test('lecture de saisie : cas valide, provenance, null conservé', () => {
  const p = parseCnssSection(payload([L(), L({ employee_id: 'E2', payment: 'yes', payment_date: '2026-08-10', payment_verified: true })]))
  assert.equal(p.lines.length, 2); assert.equal(p.rpRateDefault, '0.02'); assert.equal(p.lines[0].provenance, 'real')
  assert.equal(p.lines[0].benefits, null); assert.equal(p.lines[1].paymentVerified, true)
  assert.equal(parseCnssSection({ source_mode: 'estimated', data: { headcount: '12', rp_rate: null, lines: [L()] } }).lines[0].provenance, 'estimated')
})

test('lecture de saisie : refus des structures et valeurs invalides', () => {
  const bad = (x: unknown, re: RegExp) => assert.throws(() => parseCnssSection(x), (e: any) => re.test(e.message))
  bad(null, /structure/); bad({ data: {} }, /structure|Nature/)
  bad({ source_mode: 'foo', data: {} }, /Nature/)
  bad(payload([]), /Aucune ligne/); bad(payload([L()], { headcount: 0 }), /Effectif/)
  bad(payload([L({ gross: 300000 })]), /chaîne décimale/)
  bad(payload([L({ payment: 'maybe' })]), /payment/); bad(payload([L({ employee_id: ' ' })]), /employee_id/)
  bad(payload([L({ provenance: 'estimated' })]), /incompatible/)
  bad({ source_mode: 'mixed', data: { headcount: 3, lines: [L()] } }, /obligatoire en mode mixed/)
  bad(payload(Array.from({ length: 6001 }, (_, i) => L({ employee_id: 'E' + i }))), /Capacité/)
  bad(payload([L({ manual_late_months: -1 })]), /manual_late_months/)
})

test('bout en bout : règles résolues -> saisie -> calcul exact, avec plafond pension', async () => {
  const res = await resolveValidatedCnssRules(fake(full(), [SRC]), 2026); assert.ok(res.ok); if (!res.ok) return
  const parsed = parseCnssSection(payload([L({ gross: '700000', bonuses: null })]))
  const params: Params = { mode: 'validated', calcDate: '2026-10-20', headcount: parsed.headcount, rpRateDefault: parsed.rpRateDefault,
    contributionRules: res.rules.contributionRules,
    procedure: { periodicity: 'by_headcount', headcountThreshold: res.rules.procedure.headcountThreshold, dueDay: res.rules.procedure.dueDay,
      lateCounting: res.rules.procedure.lateCounting, latePenaltyRate: res.rules.procedure.latePenaltyRate, status: 'validated', legalRef: res.rules.procedure.legalRef } }
  const out = computeCnss(parsed.lines, params)
  const l = out.lines[0]
  assert.equal(l.components.CNSS_PF.amount, '63000')              // 700000 x 9 %, sans plafond
  assert.equal(l.components.CNSS_PENSION_EMPLOYER.amount, '38400') // plafonné à 600000 x 6,4 %
  assert.equal(l.components.CNSS_PENSION_EMPLOYEE.amount, '21600')
  assert.equal(l.components.CNSS_RP.amount, '14000')              // taux RP du dossier
  assert.equal(out.provisional, false)
  assert.equal(l.dueDateUsed, '2026-10-15') // effectif 5 < 20 => trimestriel : juillet -> 15 octobre
})
