import test from 'node:test'
import assert from 'node:assert/strict'
import { consolidateDebts, type DebtInput, type PaymentInput } from '../../lib/fiscal/engine/debts'
import { CalcBlockedError } from '../../lib/fiscal/engine/arrears-common'
import { consolidateDebts as refConsolidate } from '../reference/ref-debts'

// Tests du VRAI moteur lib/fiscal/engine/debts.ts (arrears-reference.test.ts, lui, teste les références).
// Valeurs de test uniquement. Attendus calculés à la main, sauf le test différentiel (référence indépendante).

const D = (o: Partial<DebtInput> = {}): DebtInput => ({
  id: 'D1', organism: 'DGI', nature: 'ITS', period: '2025', type: 'fiscal',
  principalConfirmed: '1000000', penaltyConfirmed: '100000', interestConfirmed: '50000', credits: '0', ...o,
})
const P = (o: Partial<PaymentInput> = {}): PaymentInput => ({
  id: 'P1', debtId: 'D1', date: '2026-01-10', component: 'principal', amount: '400000', verified: true, ...o,
})
const run = (d: DebtInput[], p: PaymentInput[] = [], r: 'verified_only' | 'all' = 'verified_only') => consolidateDebts(d, p, r)
const blocked = (fn: () => unknown, re?: RegExp) =>
  assert.throws(fn, (e: unknown) => e instanceof CalcBlockedError && (re === undefined || re.test(e.message)))

test('debts : solde après paiement de principal vérifié', () => {
  const r = run([D()], [P()]).debts[0]
  assert.equal(r.paidPrincipal, '400000')
  assert.equal(r.estimatedBalance, '750000')
  assert.equal(r.principalBalance, '600000')
  assert.equal(r.penaltyBalance, '100000')
  assert.equal(r.interestBalance, '50000')
  assert.equal(r.confirmedBalance, '750000')
  assert.equal(r.proof, 'CONFIRMÉ')
})

test('debts : un paiement « intérêts » solde les intérêts, pas les pénalités', () => {
  const r = run([D()], [P({ component: 'interest', amount: '50000' })]).debts[0]
  assert.equal(r.paidInterest, '50000')
  assert.equal(r.paidPenalty, '0')
  assert.equal(r.interestBalance, '0')
  assert.equal(r.penaltyBalance, '100000')
  assert.equal(r.principalBalance, '1000000')
  assert.equal(r.estimatedBalance, '1100000')
})

test('debts : un excédent sur une composante déborde sur l’autre', () => {
  const i = run([D()], [P({ component: 'interest', amount: '80000' })]).debts[0]
  assert.equal(i.interestBalance, '0')
  assert.equal(i.penaltyBalance, '70000')
  assert.equal(i.estimatedBalance, '1070000')
  const f = run([D()], [P({ component: 'penalty', amount: '130000' })]).debts[0]
  assert.equal(f.penaltyBalance, '0')
  assert.equal(f.interestBalance, '20000')
  assert.equal(f.estimatedBalance, '1020000')
  const pr = run([D({ principalConfirmed: '100000', penaltyConfirmed: '50000', interestConfirmed: '0' })], [P({ amount: '130000' })]).debts[0]
  assert.equal(pr.principalBalance, '0')
  assert.equal(pr.penaltyBalance, '20000')
  assert.equal(pr.estimatedBalance, '20000')
})

test('debts : crédits imputés au principal, solde jamais négatif', () => {
  assert.equal(run([D({ principalConfirmed: '100000', penaltyConfirmed: '0', interestConfirmed: '0', credits: '30000' })]).debts[0].estimatedBalance, '70000')
  assert.equal(run([D()], [P({ amount: '5000000' })]).debts[0].estimatedBalance, '0')
})

test('debts : estimé en repli, confirmé prioritaire', () => {
  const e = run([D({ principalConfirmed: null, penaltyConfirmed: null, interestConfirmed: null, principalEstimated: '500000' })]).debts[0]
  assert.equal(e.principal, '500000')
  assert.equal(e.principalBasis, 'estimated')
  assert.equal(e.proof, 'ESTIMATIF')
  assert.equal(e.confirmedTotal, null)
  const c = run([D({ principalEstimated: '999', penaltyEstimated: '999' })]).debts[0]
  assert.equal(c.principal, '1000000')
  assert.equal(c.principalBasis, 'confirmed')
  assert.equal(c.penalty, '100000')
})

test('debts : « confirmé » exige principal, pénalité ET intérêts explicites (« 0 » compris)', () => {
  const partial = run([D({ interestConfirmed: null })]).debts[0]
  assert.equal(partial.proof, 'PARTIELLEMENT CONFIRMÉ')
  assert.equal(partial.confirmedTotal, null)
  assert.equal(partial.confirmedBalance, null)
  const explicitZero = run([D({ interestConfirmed: '0' })]).debts[0]
  assert.equal(explicitZero.proof, 'CONFIRMÉ')
  assert.equal(explicitZero.confirmedTotal, '1100000')
  const mix = run([D(), D({ id: 'D2', interestConfirmed: null })])
  assert.equal(mix.totals.confirmedBalance, '1150000', 'une dette non confirmée n’entre pas dans le solde confirmé')
})

test('debts : paiements non vérifiés exclus sauf mode « all »', () => {
  const a = run([D()], [P({ verified: false })])
  assert.equal(a.debts[0].estimatedBalance, '1150000')
  assert.deepEqual(a.excludedPayments, { count: 1, amount: '400000' })
  assert.equal(a.warnings.length, 1)
  assert.equal(run([D()], [P({ verified: false })], 'all').debts[0].estimatedBalance, '750000')
})

test('debts : totaux par type et par organisme, origine conservée', () => {
  const r = run([D(), D({ id: 'D2', organism: 'CNSS', type: 'social', origin: 'payroll', principalConfirmed: '300000', penaltyConfirmed: '0', interestConfirmed: '0' })])
  assert.equal(r.byType.fiscal, '1150000')
  assert.equal(r.byType.social, '300000')
  assert.equal(r.byOrganism.CNSS, '300000')
  assert.equal(r.totals.estimatedBalance, '1450000')
  assert.equal(r.debts[1].origin, 'payroll')
})

test('debts : refus (identifiants, montants, composantes, mode, capacité)', () => {
  blocked(() => run([D(), D()]), /doublon/)
  blocked(() => run([D({ id: ' ' })]), /Identifiant de dette/)
  blocked(() => run([D({ organism: ' ' })]), /organisme/)
  blocked(() => run([D({ type: 'x' as unknown as DebtInput['type'] })]), /type de dette/)
  blocked(() => run([D()], [P({ debtId: 'X' })]), /dette inconnue/)
  blocked(() => run([D()], [P(), P()]), /Identifiant de paiement/)
  blocked(() => run([D()], [P({ component: 'x' as unknown as PaymentInput['component'] })]), /composante/)
  blocked(() => run([D()], [P({ verified: undefined as unknown as boolean })]), /vérification/)
  blocked(() => run([D()], [P({ amount: '0' })]), /nul ou négatif/)
  blocked(() => run([D()], [P(), P({ id: 'P2', receiptRef: 'Q' }), P({ id: 'P3', receiptRef: ' Q ' })]), /Quittance en doublon/)
  blocked(() => run([D({ principalConfirmed: null, penaltyConfirmed: null, interestConfirmed: null })]), /aucun montant/)
  blocked(() => run([D({ principalConfirmed: 1 as unknown as string })]))
  blocked(() => run([D({ credits: undefined as unknown as string })]))
  blocked(() => run([D()], [], 'x' as unknown as 'all'), /reconnaissance/)
  blocked(() => run([]), /Aucune dette/)
  blocked(() => run(Array.from({ length: 1001 }, (_, i) => D({ id: 'D' + i }))), /Capacité/)
})

// ---------- différentiel contre la référence indépendante ----------
function prng(seed: number) {
  let s = seed
  return (n: number) => {
    s = (s + 0x6D2B79F5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) % n
  }
}

test('debts : différentiel vs référence (1500 dossiers aléatoires, graine fixe)', () => {
  const rnd = prng(20261107)
  const pick = <T>(a: T[]): T => a[rnd(a.length)]
  const opt = (): string | null | undefined => pick<string | null | undefined>([null, undefined, '0', '1000', '50000', '1234567', '5000000'])
  const B = (s: string) => BigInt(s)
  for (let n = 0; n < 1500; n++) {
    const nd = 1 + rnd(3)
    const debts: DebtInput[] = []
    for (let k = 0; k < nd; k++) {
      const d: DebtInput = {
        id: 'D' + k, organism: pick(['DGI', 'CNSS']), nature: 'X', period: '2025', type: pick<DebtInput['type']>(['fiscal', 'social', 'other']),
        principalConfirmed: opt(), principalEstimated: opt(), penaltyConfirmed: opt(), penaltyEstimated: opt(), interestConfirmed: opt(),
        credits: pick(['0', '0', '30000', '2000000']),
      }
      if (!d.principalConfirmed && !d.principalEstimated && !d.penaltyConfirmed && !d.penaltyEstimated && !d.interestConfirmed) d.principalEstimated = '1000'
      debts.push(d)
    }
    const pays: PaymentInput[] = Array.from({ length: rnd(5) }, (_, k) => ({
      id: 'P' + k, debtId: 'D' + rnd(nd), date: '2026-01-10', component: pick<PaymentInput['component']>(['principal', 'penalty', 'interest']),
      amount: pick(['1', '20000', '150000', '900000', '3000000']), verified: pick([true, true, false]),
    }))
    const mode = pick<'verified_only' | 'all'>(['verified_only', 'all'])
    const r = consolidateDebts(debts, pays, mode)
    const q = refConsolidate(debts, pays, mode)
    const ctx = JSON.stringify({ n, mode })
    r.debts.forEach((x, j) => {
      const y = q.debts[j]
      for (const k of ['principal', 'estimatedBalance', 'principalBalance', 'principalBasis', 'penaltyBasis', 'paidPrincipal', 'credits'] as const) {
        assert.equal(x[k], y[k], k + ' ' + ctx)
      }
      assert.equal(B(x.penalty) + B(x.interest), B(y.penalty) + B(y.interest), 'pénalités+intérêts ' + ctx)
      assert.equal(B(x.penaltyBalance) + B(x.interestBalance), B(y.penaltyBalance), 'soldes pénalités+intérêts ' + ctx)
      assert.equal(B(x.paidPenalty) + B(x.paidInterest), B(y.paidPenalty), 'paiements pénalités+intérêts ' + ctx)
      assert.equal(B(x.principalBalance) + B(x.penaltyBalance) + B(x.interestBalance), B(x.estimatedBalance), 'somme des soldes ' + ctx)
    })
    for (const k of ['estimatedBalance', 'principalBalance', 'paid'] as const) assert.equal(r.totals[k], q.totals[k], 'totals.' + k + ' ' + ctx)
    assert.deepEqual(Object.entries(r.byType).sort(), Object.entries(q.byType).sort(), 'byType ' + ctx)
    assert.deepEqual(Object.entries(r.byOrganism).sort(), Object.entries(q.byOrganism).sort(), 'byOrganism ' + ctx)
    assert.deepEqual(r.excludedPayments, q.excludedPayments, 'exclus ' + ctx)
  }
})
