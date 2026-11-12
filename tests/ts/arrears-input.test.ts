import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateArrearsFromSections } from '../../lib/fiscal/arrears-input'
import { CalcBlockedError } from '../../lib/fiscal/engine/arrears-common'

// Tests du VRAI module lib/fiscal/arrears-input.ts (lecture des sections du dossier → consolidation des dettes).
// Atteint aussi, par import, debts.ts et arrears-common.ts. Valeurs de test uniquement.

type Sec = { section_code: string; status: string; payload: unknown }
const sec = (code: string, data: unknown, o: { status?: string; mode?: string } = {}): Sec => ({
  section_code: code, status: o.status ?? 'validated', payload: { source_mode: o.mode ?? 'actual', data },
})
const taxDebt = { id: 'T1', organism: 'DGI', nature: 'ITS', period: '2025', principalConfirmed: '1000000', penaltyConfirmed: '100000', interestConfirmed: '0' }
const socDebt = { id: 'S1', organism: 'CNSS', nature: 'Cotisations', period: '2025-T1', origin: 'historical_notice', principalConfirmed: '300000', penaltyConfirmed: '0', interestConfirmed: '0' }
const pay = { id: 'P1', debt_id: 'T1', date: '2026-01-10', component: 'principal', amount: '400000', verified: true, receipt_ref: 'Q-1' }
const ok = (): Sec[] => [sec('tax_operations', { debts: [taxDebt] }), sec('social_operations', { debts: [socDebt] }), sec('payments', { payments: [pay] })]
const blocked = (fn: () => unknown, re: RegExp) =>
  assert.throws(fn, (e: unknown) => e instanceof CalcBlockedError && re.test(e.message))

test('input : dossier valide → dettes fiscales et sociales consolidées', () => {
  const r = calculateArrearsFromSections(ok())
  assert.equal(r.debts.length, 2)
  assert.equal(r.debts[0].type, 'fiscal')
  assert.equal(r.debts[1].type, 'social')
  assert.equal(r.debts[1].origin, 'historical_notice')
  assert.equal(r.debts[0].paidPrincipal, '400000')
  assert.equal(r.debts[0].estimatedBalance, '700000')
  assert.equal(r.totals.estimatedBalance, '1000000')
})

test('input : mode de reconnaissance transmis au moteur', () => {
  const s = ok()
  s[2] = sec('payments', { payments: [{ ...pay, verified: false }] })
  assert.equal(calculateArrearsFromSections(s).excludedPayments.count, 1)
  assert.equal(calculateArrearsFromSections(s, 'all').excludedPayments.count, 0)
})

test('input : crédits par défaut à 0, montant vide = absent', () => {
  const s = ok()
  s[0] = sec('tax_operations', { debts: [{ ...taxDebt, principalConfirmed: '', principalEstimated: '500000' }] }, { mode: 'mixed' })
  const d = calculateArrearsFromSections(s).debts[0]
  assert.equal(d.credits, '0')
  assert.equal(d.principalBasis, 'estimated')
  assert.equal(d.principal, '500000')
})

test('input : sections absentes, en double, non validées ou mal formées', () => {
  blocked(() => calculateArrearsFromSections(ok().slice(0, 2)), /payments doit être présente une seule fois/)
  blocked(() => calculateArrearsFromSections([...ok(), sec('payments', { payments: [] })]), /payments doit être présente une seule fois/)
  blocked(() => calculateArrearsFromSections(ok().map(s => (s.section_code === 'payments' ? { ...s, status: 'draft' } : s))), /payments doit être validée/)
  blocked(() => calculateArrearsFromSections(ok().map(s => (s.section_code === 'payments' ? { ...s, payload: null } : s))), /structure de la section payments/)
  blocked(() => calculateArrearsFromSections(ok().map(s => (s.section_code === 'payments' ? sec('payments', { payments: [] }, { mode: 'x' }) : s))), /source des données de payments/)
  blocked(() => calculateArrearsFromSections('x' as unknown as Sec[]), /sections du dossier sont absentes/)
})

test('input : dettes invalides', () => {
  const mk = (debt: unknown, mode = 'actual') => [sec('tax_operations', { debts: [debt] }, { mode }), ok()[1], ok()[2]]
  blocked(() => calculateArrearsFromSections([sec('tax_operations', {}), ok()[1], ok()[2]]), /data\.debts est obligatoire/)
  blocked(() => calculateArrearsFromSections(mk('x')), /objet invalide/)
  blocked(() => calculateArrearsFromSections(mk({ ...taxDebt, type: 'social' })), /type incompatible/)
  blocked(() => calculateArrearsFromSections(mk({ ...taxDebt, origin: 'autre' })), /origine invalide/)
  blocked(() => calculateArrearsFromSections(mk({ ...taxDebt, id: ' ' })), /id : texte obligatoire/)
  blocked(() => calculateArrearsFromSections(mk({ ...taxDebt, principalEstimated: '5' })), /source actual/)
  blocked(() => calculateArrearsFromSections(mk({ ...taxDebt, principalConfirmed: 1000000 })), /chaîne/)
  blocked(() => calculateArrearsFromSections([sec('tax_operations', { debts: Array.from({ length: 1001 }, (_, i) => ({ ...taxDebt, id: 'T' + i })) }), ok()[1], ok()[2]]), /maximum 1000 dettes/)
})

test('input : paiements invalides', () => {
  const mk = (p: unknown) => [ok()[0], ok()[1], sec('payments', { payments: [p] })]
  blocked(() => calculateArrearsFromSections([ok()[0], ok()[1], sec('payments', {})]), /data\.payments est obligatoire/)
  blocked(() => calculateArrearsFromSections(mk('x')), /objet invalide/)
  blocked(() => calculateArrearsFromSections(mk({ ...pay, date: '10/01/2026' })), /YYYY-MM-DD/)
  blocked(() => calculateArrearsFromSections(mk({ ...pay, component: 'autre' })), /composante invalide/)
  blocked(() => calculateArrearsFromSections(mk({ ...pay, verified: 'oui' })), /confirmation du paiement/)
  blocked(() => calculateArrearsFromSections(mk({ ...pay, amount: 400000 })), /chaîne obligatoire/)
  blocked(() => calculateArrearsFromSections(mk({ ...pay, debt_id: 'ZZ' })), /dette inconnue/)
})

test('input : des paiements sans aucune dette sont refusés', () => {
  blocked(() => calculateArrearsFromSections([sec('tax_operations', { debts: [] }), sec('social_operations', { debts: [] }), ok()[2]]), /sans dette fiscale ou sociale/)
})

test('input : dossier de paie CNSS seule (aucune dette, aucun paiement)', () => {
  const r = calculateArrearsFromSections([sec('tax_operations', { debts: [] }), sec('social_operations', { debts: [] }), sec('payments', { payments: [] })])
  assert.equal(r.debts.length, 0)
})
