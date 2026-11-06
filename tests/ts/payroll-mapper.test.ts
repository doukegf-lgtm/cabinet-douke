import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PayrollMapperError, allocateCents, deriveSalaryLines, toItsVpsPayload, toCnssPayload,
  type EmployeeInput, type SalaryLine,
} from '../../lib/fiscal/mapper/payroll-lines'
import { DecimalError, parseMoney, ZERO, SCALE } from '../../lib/fiscal/engine/decimal'
import { parseItsVpsSection } from '../../lib/fiscal/its-input'

const NOW = '2026-11'
const emp = (o: Partial<EmployeeInput> = {}): EmployeeInput => ({
  employeeId: 'S1', hire: '2023-03',
  periods: [{ from: '2023-03', to: null, gross: '100000', bonuses: '5000', provenance: 'real' }], ...o })
const refused = (fn: () => unknown, re: RegExp) => assert.throws(fn, (e: any) => e instanceof PayrollMapperError && re.test(e.message))
const cents = (s: string) => parseMoney(s, 'x') / (SCALE / BigInt(100))
const sum = (xs: (string | undefined)[]) => xs.reduce((a: bigint, x) => a + (x === undefined ? ZERO : cents(x)), ZERO)

test('R3 : un mois par ligne, de l\'embauche au mois courant inclus', () => {
  const l = deriveSalaryLines([emp()], NOW)
  assert.equal(l.length, 45)
  assert.equal(l[0].month, '2023-03'); assert.equal(l[l.length - 1].month, NOW)
})

test('R3 : embauche avant 2022 -> départ 2022-01 ; départ borne la fin ; départ avant 2022 -> aucune ligne', () => {
  const old = emp({ hire: '2019-05', periods: [{ from: '2019-05', to: null, gross: '1', provenance: 'real' }] })
  assert.equal(deriveSalaryLines([old], NOW)[0].month, '2022-01')
  assert.equal(deriveSalaryLines([emp({ departure: '2023-05' })], NOW).length, 3)
  assert.equal(deriveSalaryLines([{ ...old, departure: '2021-12' }], NOW).length, 0)
})

test('périodes de salaire constant ; trou, chevauchement, départ < embauche refusés', () => {
  const two = deriveSalaryLines([emp({ periods: [
    { from: '2023-03', to: '2024-12', gross: '100000', provenance: 'real' },
    { from: '2025-01', to: null, gross: '120000', provenance: 'real' }] })], NOW)
  assert.equal(two.filter((x) => x.month === '2024-12')[0].gross, '100000')
  assert.equal(two.filter((x) => x.month === '2025-01')[0].gross, '120000')
  refused(() => deriveSalaryLines([emp({ periods: [{ from: '2024-01', to: null, gross: '1', provenance: 'real' }] })], NOW), /aucun salaire saisi pour 2023-03/)
  refused(() => deriveSalaryLines([emp({ periods: [
    { from: '2023-03', to: '2024-06', gross: '1', provenance: 'real' }, { from: '2024-06', to: null, gross: '1', provenance: 'real' }] })], NOW), /chevauchent/)
  refused(() => deriveSalaryLines([emp({ departure: '2023-01' })], NOW), /antérieur/)
})

test('montants : chaînes décimales exactes ; nombre JS et négatif refusés', () => {
  const l = deriveSalaryLines([emp({ periods: [{ from: '2023-03', to: null, gross: '100000.50', bonuses: '0.25', provenance: 'real' }] })], '2023-03')[0]
  assert.equal(l.gross, '100000.5'); assert.equal(l.bonuses, '0.25'); assert.equal(l.benefits, '0')
  assert.throws(() => deriveSalaryLines([emp({ periods: [{ from: '2023-03', to: null, gross: 100000 as any, provenance: 'real' }] })], NOW), DecimalError)
  assert.throws(() => deriveSalaryLines([emp({ periods: [{ from: '2023-03', to: null, gross: '-5', provenance: 'real' }] })], NOW), DecimalError)
})

test('capacité : > 100 salariés, > 6000 lignes, code en double', () => {
  const many = (n: number, hire: string) => Array.from({ length: n }, (_, i) => emp({ employeeId: 'S' + i, hire, periods: [{ from: hire, to: null, gross: '1', provenance: 'real' }] }))
  refused(() => deriveSalaryLines(many(101, '2026-01'), NOW), /Plus de 100 salariés/)
  refused(() => deriveSalaryLines(many(100, '2022-01'), '2027-06'), /Plus de 6000 lignes/)
  refused(() => deriveSalaryLines([emp(), emp()], NOW), /en double/)
})

test('répartition : somme exacte, proportionnelle, poids nuls -> parts égales', () => {
  const p = allocateCents(BigInt(1000), [BigInt(1), BigInt(1), BigInt(1)])
  assert.equal(p.reduce((a, b) => a + b, ZERO).toString(), '1000')
  assert.deepEqual(allocateCents(BigInt(100), [BigInt(3), BigInt(1)]).map(String), ['75', '25'])
  assert.deepEqual(allocateCents(BigInt(10), [ZERO, ZERO]).map(String), ['5', '5'])
  assert.throws(() => allocateCents(BigInt(5), []), PayrollMapperError)
})

const lines2026 = (prov: 'real' | 'estimated' = 'real'): SalaryLine[] =>
  deriveSalaryLines([emp({ hire: '2026-01', periods: [{ from: '2026-01', to: null, gross: '100000', bonuses: '5000', benefits: '1000', provenance: prov }] })], '2026-12')

test('its_vps : base = brut + primes + avantages ; proposition -> provenance estimated ; accepté par parseItsVpsSection', () => {
  const p = toItsVpsPayload(lines2026('real'), { vpsExempt: false })
  assert.equal(p.data.lines[0].its_base, '106000')
  assert.equal(p.source_mode, 'estimated')
  assert.ok(p.data.lines.every((l) => l.provenance === 'estimated'))
  const parsed = parseItsVpsSection(p)
  assert.equal(parsed.length, 12); assert.equal(parsed[0].itsPaid, null); assert.equal(parsed[0].itsWithheld, null)
})

test('its_vps : base validée par le cabinet -> provenance réelle, mode actual', () => {
  const p = toItsVpsPayload(lines2026('real'), { vpsExempt: false, baseValidated: true })
  assert.equal(p.source_mode, 'actual')
  assert.equal(parseItsVpsSection(p).length, 12)
})

test('its_vps R5 : total annuel réparti, somme exacte, flat_split, autres années intactes', () => {
  const l = deriveSalaryLines([emp({ hire: '2025-07', periods: [{ from: '2025-07', to: null, gross: '100000', provenance: 'real' }] })], '2026-12')
  const p = toItsVpsPayload(l, { vpsExempt: false, baseValidated: true, annual: [{ year: 2026, itsPaid: '10000.01', vpsPaid: '3' }] })
  const y26 = p.data.lines.filter((x) => x.month.slice(0, 4) === '2026')
  assert.equal(sum(y26.map((x) => x.its_paid)).toString(), cents('10000.01').toString())
  assert.equal(sum(y26.map((x) => x.vps_paid)).toString(), cents('3').toString())
  assert.ok(y26.every((x) => x.provenance === 'flat_split'))
  const y25 = p.data.lines.filter((x) => x.month.slice(0, 4) === '2025')
  assert.ok(y25.every((x) => x.its_paid === undefined && x.provenance === 'real'))
  assert.equal(p.source_mode, 'mixed')
  assert.equal(parseItsVpsSection(p).length, 18)
})

test('its_vps : total non renseigné = absent (jamais zéro) ; année sans paie refusée ; doublon refusé', () => {
  const p = toItsVpsPayload(lines2026(), { vpsExempt: true, annual: [{ year: 2026 }] })
  assert.ok(p.data.lines.every((x) => x.its_paid === undefined && x.vps_paid === undefined && x.vps_exempt === true))
  refused(() => toItsVpsPayload(lines2026(), { vpsExempt: false, annual: [{ year: 2024, itsPaid: '5' }] }), /aucun mois de paie/)
  refused(() => toItsVpsPayload(lines2026(), { vpsExempt: false, annual: [{ year: 2026 }, { year: 2026 }] }), /en double/)
  refused(() => toItsVpsPayload([], { vpsExempt: false }), /Aucune ligne/)
})

test('cnss : réponse de période recopiée ; partiel réparti (pas recopié) ; unknown, trou, chevauchement refusés', () => {
  const two = deriveSalaryLines([
    emp({ employeeId: 'A', hire: '2026-01', periods: [{ from: '2026-01', to: null, gross: '100000', provenance: 'real' }] }),
    emp({ employeeId: 'B', hire: '2026-01', periods: [{ from: '2026-01', to: null, gross: '300000', provenance: 'real' }] })], '2026-03')
  const ok = toCnssPayload(two, [
    { from: '2026-01', to: '2026-02', payment: 'yes', paymentDate: '2026-03-10' },
    { from: '2026-03', to: '2026-03', payment: 'partial', amountPaid: '100000' }], { headcount: 2, rpRate: '0.02' })
  assert.equal(ok.data.lines.length, 6)
  const jan = ok.data.lines.filter((x) => x.period === '2026-01')
  assert.ok(jan.every((x) => x.payment === 'yes' && x.payment_date === '2026-03-10' && x.amount_paid === undefined))
  const mar = ok.data.lines.filter((x) => x.period === '2026-03')
  assert.deepEqual(mar.map((x) => x.amount_paid), ['25000', '75000'])
  assert.equal(sum(mar.map((x) => x.amount_paid)).toString(), cents('100000').toString())
  assert.ok(mar.every((x) => x.provenance === 'flat_split'))
  assert.equal(ok.source_mode, 'mixed'); assert.equal(ok.data.rp_rate, '0.02')
  refused(() => toCnssPayload(two, [{ from: '2026-01', to: '2026-03', payment: 'unknown' }], { headcount: 2, rpRate: null }), /Je ne sais pas/)
  refused(() => toCnssPayload(two, [{ from: '2026-01', to: '2026-02', payment: 'no' }], { headcount: 2, rpRate: null }), /Aucune réponse CNSS pour 2026-03/)
  refused(() => toCnssPayload(two, [{ from: '2026-01', to: '2026-02', payment: 'no' }, { from: '2026-02', to: '2026-03', payment: 'no' }], { headcount: 2, rpRate: null }), /chevauchent/)
  refused(() => toCnssPayload(two, [{ from: '2026-01', to: '2026-03', payment: 'partial' }], { headcount: 2, rpRate: null }), /montant > 0/)
  refused(() => toCnssPayload(two, [{ from: '2026-01', to: '2026-03', payment: 'yes', paymentDate: '10/03/2026' }], { headcount: 2, rpRate: null }), /Date de paiement/)
  refused(() => toCnssPayload(two, [{ from: '2026-01', to: '2026-03', payment: 'no' }], { headcount: 0, rpRate: null }), /Effectif/)
})
