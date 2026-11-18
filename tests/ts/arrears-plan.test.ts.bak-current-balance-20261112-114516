import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPlans, type PlanInput, type PlanParams } from '../../lib/fiscal/engine/plan'
import { CalcBlockedError } from '../../lib/fiscal/engine/arrears-common'
import { buildPlans as refBuildPlans } from '../reference/ref-plan'

// Tests du VRAI moteur lib/fiscal/engine/plan.ts. Valeurs de test uniquement, attendus calculés à la main.

const PL = (o: Partial<PlanInput> = {}): PlanInput => ({
  debtId: 'D1', organism: 'DGI', type: 'fiscal', balance: '1200000', startDate: '2026-01-15',
  durationMonths: 12, periodicityMonths: 1, agreement: 'confirmed', ...o,
})
const PARAMS: PlanParams = { forecastStart: '2026-01', horizonMonths: 24, scope: 'all' }
const plan = (p: PlanInput[], o: Partial<PlanParams> = {}) => buildPlans(p, { ...PARAMS, ...o })
const blocked = (fn: () => unknown, re?: RegExp) =>
  assert.throws(fn, (e: unknown) => e instanceof CalcBlockedError && (re === undefined || re.test(e.message)))

test('plan : 12 mensualités égales, soldé dans l’horizon', () => {
  const r = plan([PL()])
  const p = r.plans[0]
  assert.equal(p.installmentCount, 12)
  assert.equal(p.indicativeInstallment, '100000')
  assert.equal(p.installment, '100000')
  assert.equal(p.firstDebitMonth, '2026-01')
  assert.equal(p.lastPaymentMonth, '2026-12')
  assert.equal(p.schedule['2026-01'], '100000')
  assert.equal(p.schedule['2026-12'], '100000')
  assert.equal(p.schedule['2027-01'], '0')
  assert.equal(p.scheduled, '1200000')
  assert.equal(p.remainder, '0')
  assert.equal(p.control, 'OK')
  assert.equal(p.contractEndDate, '2027-01-15')
  assert.equal(p.agreementStatus, 'Accord confirmé')
  assert.equal(r.totals.scheduled, '1200000')
  assert.equal(r.totalsByMonth['2026-03'].fiscal, '100000')
  assert.equal(r.totalsByMonth['2026-03'].total, '100000')
  assert.equal(r.warnings.length, 0)
})

test('plan : mensualité arrondie à l’XOF supérieur, dernière échéance ajustée', () => {
  const p = plan([PL({ balance: '1000000', durationMonths: 3 })]).plans[0]
  assert.equal(p.installment, '333334')
  assert.deepEqual([p.schedule['2026-01'], p.schedule['2026-02'], p.schedule['2026-03']], ['333334', '333334', '333332'])
  assert.equal(p.scheduled, '1000000')
  assert.equal(p.remainder, '0')
})

test('plan : périodicité trimestrielle', () => {
  const p = plan([PL({ durationMonths: 12, periodicityMonths: 3 })]).plans[0]
  assert.equal(p.installmentCount, 4)
  assert.equal(p.installment, '300000')
  const paying = Object.keys(p.schedule).filter(m => p.schedule[m] !== '0')
  assert.deepEqual(paying, ['2026-01', '2026-04', '2026-07', '2026-10'])
})

test('plan : mensualité convenue (fin de contrat selon le nombre réel d’échéances)', () => {
  const p = plan([PL({ balance: '1000000', convenedInstallment: '250000' })]).plans[0]
  assert.equal(p.installment, '250000')
  assert.equal(p.indicativeInstallment, '83334')
  assert.equal(p.scheduled, '1000000')
  assert.equal(p.lastPaymentMonth, '2026-04')
  assert.equal(p.contractEndDate, '2026-05-15')
  assert.equal(p.control, 'OK')
})

test('plan : solde figé prioritaire sur le solde courant', () => {
  const p = plan([PL({ balance: '900000', frozenBalance: '600000', durationMonths: 6 })]).plans[0]
  assert.equal(p.base, '600000')
  assert.equal(p.installment, '100000')
  assert.equal(p.scheduled, '600000')
})

test('plan : périmètre « confirmed_only » exclut les accords non confirmés', () => {
  const r = plan([PL({ agreement: 'to_negotiate' }), PL({ debtId: 'D2', agreement: 'confirmed' })], { scope: 'confirmed_only' })
  const [a, b] = r.plans
  assert.equal(a.control, 'HORS PRÉVISIONNEL')
  assert.equal(a.firstDebitMonth, null)
  assert.equal(a.scheduled, '0')
  assert.equal(a.remainder, '1200000')
  assert.equal(a.agreementStatus, 'À négocier')
  assert.equal(b.control, 'OK')
  assert.equal(r.totals.scheduled, '1200000')
  assert.ok(r.warnings.some(w => w.startsWith('D1')), 'avertissement sur le plan non confirmé')
})

test('plan : contrôles SOLDÉ, MENSUALITÉ NULLE et RESTE APRÈS HORIZON', () => {
  const zero = plan([PL({ balance: '0' })]).plans[0]
  assert.equal(zero.control, 'SOLDÉ')
  assert.equal(zero.installment, '0')
  const nul = plan([PL({ convenedInstallment: '0' })]).plans[0]
  assert.equal(nul.control, 'MENSUALITÉ NULLE')
  const late = plan([PL({ startDate: '2028-01-01' })], { horizonMonths: 12 }).plans[0]
  assert.equal(late.control, 'RESTE APRÈS HORIZON')
  assert.equal(late.scheduled, '0')
  assert.equal(late.remainder, '1200000')
  const short = plan([PL()], { horizonMonths: 6 }).plans[0]
  assert.equal(short.control, 'RESTE APRÈS HORIZON')
  assert.equal(short.scheduled, '600000')
  assert.equal(short.remainder, '600000')
})

test('plan : totaux mensuels par type, plusieurs plans', () => {
  const r = plan([PL(), PL({ debtId: 'D2', type: 'social', organism: 'CNSS', balance: '600000', durationMonths: 6 })])
  assert.deepEqual(r.totalsByMonth['2026-02'], { fiscal: '100000', social: '100000', other: '0', total: '200000' })
  assert.equal(r.totals.base, '1800000')
  assert.equal(r.totals.scheduled, '1800000')
})

test('plan : refus (entrées invalides)', () => {
  blocked(() => plan([]), /Aucun plan/)
  blocked(() => plan([PL()], { horizonMonths: 0 }), /Horizon invalide/)
  blocked(() => plan([PL()], { horizonMonths: 61 }), /Horizon invalide/)
  blocked(() => plan([PL()], { scope: 'x' as unknown as 'all' }), /Périmètre/)
  blocked(() => plan([PL(), PL()]), /doublon/)
  blocked(() => plan([PL({ type: 'x' as unknown as 'fiscal' })]), /type de dette/)
  blocked(() => plan([PL({ periodicityMonths: 2 as unknown as 1 })]), /périodicité/)
  blocked(() => plan([PL({ durationMonths: 10, periodicityMonths: 3 })]), /multiple de la périodicité/)
  blocked(() => plan([PL({ durationMonths: 0 })]), /durée invalide/)
  blocked(() => plan([PL({ agreement: 'x' as unknown as 'confirmed' })]), /accord/)
  blocked(() => plan([PL({ startDate: '2026-02-30' })]))
  blocked(() => plan([PL({ balance: 1200000 as unknown as string })]))
  blocked(() => plan([PL()], { forecastStart: '2026-13' }))
})

// ---------- différentiel contre la référence (plans démarrant au plus tôt au début du prévisionnel) ----------
function prng(seed: number) {
  let s = seed
  return (n: number) => {
    s = (s + 0x6D2B79F5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) % n
  }
}

test('plan : différentiel vs référence (1500 plans aléatoires débutant à partir du prévisionnel)', () => {
  const rnd = prng(20261108)
  const pick = <T>(a: T[]): T => a[rnd(a.length)]
  for (let n = 0; n < 1500; n++) {
    const step = pick<1 | 3 | 6 | 12>([1, 3, 6, 12])
    const pl: PlanInput = {
      debtId: 'D1', organism: pick(['DGI', 'CNSS']), type: pick<PlanInput['type']>(['fiscal', 'social', 'other']),
      balance: pick(['1200000', '1000', '5', '1000001', '999999', '0', '7000000']),
      startDate: pick(['2026-01-01', '2026-01-31', '2026-02-15', '2026-05-20', '2027-12-31', '2026-03-31']),
      durationMonths: step * (1 + rnd(Math.floor(36 / step) || 1)), periodicityMonths: step,
      agreement: pick<PlanInput['agreement']>(['confirmed', 'to_negotiate', 'simulation']),
    }
    if (rnd(3) === 0) pl.convenedInstallment = pick(['0', '1', '100000', '333333', '5000000'])
    if (rnd(6) === 0) pl.frozenBalance = pick(['500000', '0', '1300000'])
    const params: PlanParams = { forecastStart: '2026-01', horizonMonths: pick([6, 12, 24, 60]), scope: pick<PlanParams['scope']>(['all', 'confirmed_only']) }
    const ctx = JSON.stringify({ n, pl, params })
    const a = buildPlans([pl], params)
    const b = refBuildPlans([pl], params)
    const x = a.plans[0]
    const y = b.plans[0]
    for (const k of ['base', 'installmentCount', 'indicativeInstallment', 'installment', 'firstDebitMonth', 'lastPaymentMonth', 'scheduled', 'remainder', 'control', 'agreementStatus'] as const) {
      assert.equal(x[k], y[k], k + ' ' + ctx)
    }
    assert.deepEqual(x.schedule, y.schedule, 'échéancier ' + ctx)
    assert.deepEqual(a.totalsByMonth, b.totalsByMonth, 'totaux mensuels ' + ctx)
    assert.deepEqual(a.totals, b.totals, 'totaux ' + ctx)
  }
})

// ---------- plans commencés AVANT le prévisionnel : comportement à valider ----------
test('plan : début antérieur, l’échéancier reste ancré sur la date initiale', () => {
  // Début 2025-11-15, 12 mois : échéances n°0..11 = nov. 2025 à oct. 2026 ; le prévisionnel démarre en janv. 2026 (échéance n°2).
  const p = plan([PL({ startDate: '2025-11-15' })], { horizonMonths: 12 }).plans[0]
  assert.equal(p.firstDebitMonth, '2026-01')
  assert.equal(p.lastPaymentMonth, '2026-10')
  assert.equal(p.scheduled, '1000000')
  assert.equal(p.contractEndDate, '2026-11-15')
})

test('plan : début antérieur, contrat échu avant le prévisionnel → hors prévisionnel', () => {
  const p = plan([PL({ startDate: '2024-01-15' })]).plans[0]
  assert.equal(p.control, 'HORS PRÉVISIONNEL')
  assert.equal(p.firstDebitMonth, null)
  assert.equal(p.scheduled, '0')
})

test('plan : début antérieur, aucun « reste après horizon » si le contrat se termine dans l’horizon', { todo: 'À DÉCIDER : le solde (base) est-il celui au début du plan ou le solde actuel ? Aujourd’hui les échéances écoulées avant le prévisionnel (ici 200 000) sont comptées dans le reste.' }, () => {
  const r = plan([PL({ startDate: '2025-11-15' })], { horizonMonths: 12 })
  assert.equal(r.plans[0].control, 'OK')
  assert.equal(r.warnings.length, 0)
})
