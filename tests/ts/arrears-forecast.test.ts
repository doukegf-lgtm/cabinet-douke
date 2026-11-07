import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPlans, type PlanInput, type PlansResult } from '../../lib/fiscal/engine/plan'
import { buildForecast, type ForecastInput, type CashMonth } from '../../lib/fiscal/engine/forecast'
import { CalcBlockedError } from '../../lib/fiscal/engine/arrears-common'
import { buildForecast as refBuildForecast } from '../reference/ref-forecast'

// Tests du VRAI moteur lib/fiscal/engine/forecast.ts. Les échéanciers sont produits par le vrai buildPlans.
// Valeurs de test uniquement, attendus calculés à la main.

const FISCAL: PlanInput = { debtId: 'D1', organism: 'DGI', type: 'fiscal', balance: '300000', startDate: '2026-01-10', durationMonths: 3, periodicityMonths: 1, agreement: 'confirmed' }
const CNSS: PlanInput = { debtId: 'D2', organism: 'CNSS', type: 'social', origin: 'payroll', balance: '600000', startDate: '2026-01-10', durationMonths: 6, periodicityMonths: 1, agreement: 'confirmed' }
const mkPlans = (p: PlanInput[], horizon = 6): PlansResult => buildPlans(p, { forecastStart: '2026-01', horizonMonths: horizon, scope: 'all' })
const blocked = (fn: () => unknown, re?: RegExp) =>
  assert.throws(fn, (e: unknown) => e instanceof CalcBlockedError && (re === undefined || re.test(e.message)))
const CASH0: CashMonth = { inflows: '0', currentTaxes: '0', currentSocial: '0', netSalaries: '0', otherOutflows: '0' }
const F = (plans: PlansResult, o: Partial<ForecastInput> = {}): ForecastInput => ({
  plans, openingArrears: '1000000', openingCnssPrincipal: '0', accrueCnssMajoration: false, ...o,
})

test('forecast : les arriérés baissent des paiements du plan, jamais sous zéro', () => {
  const r = buildForecast(F(mkPlans([FISCAL])))
  assert.deepEqual(r.months.slice(0, 4).map(m => m.arrearsEnd), ['900000', '800000', '700000', '700000'])
  assert.equal(r.months[0].arrearsStart, '1000000')
  assert.equal(r.months[0].planPayments.fiscal, '100000')
  assert.equal(r.summary.arrearsEnd, '700000')
  const low = buildForecast(F(mkPlans([FISCAL]), { openingArrears: '150000' }))
  assert.deepEqual(low.months.slice(0, 3).map(m => m.arrearsEnd), ['50000', '0', '0'])
})

test('forecast : ajustement manuel du mois', () => {
  const r = buildForecast(F(mkPlans([FISCAL]), { manualAdjustments: { '2026-02': '25000' } }))
  assert.equal(r.months[1].adjustments, '25000')
  assert.equal(r.months[1].arrearsEnd, '825000') // 900000 + 25000 - 100000
  assert.equal(r.months[2].arrearsEnd, '725000')
})

test('forecast : trésorerie et alertes', () => {
  const cash: Record<string, CashMonth> = {}
  for (const m of ['2026-01', '2026-02', '2026-03']) cash[m] = CASH0
  const r = buildForecast(F(mkPlans([FISCAL], 4), { openingCash: '250000', cash }))
  assert.deepEqual(r.months.map(m => m.cashEnd), ['150000', '50000', '-50000', null])
  assert.deepEqual(r.months.map(m => m.alert), ['ARRIÉRÉS RESTANTS', 'ARRIÉRÉS RESTANTS', 'DÉFICIT DE TRÉSORERIE', 'TRÉSORERIE INCONNUE'])
  assert.equal(r.months[0].cashStart, '250000')
  assert.equal(r.summary.lowestCash, '-50000')
  assert.equal(r.summary.deficitMonths, 1)
  assert.ok(r.warnings.some(w => /interrompue/.test(w)))
})

test('forecast : flux de trésorerie du mois (encaissements, sorties courantes, paiements du plan)', () => {
  const cash = { '2026-01': { inflows: '500000', currentTaxes: '40000', currentSocial: '30000', netSalaries: '200000', otherOutflows: '10000' } }
  const r = buildForecast(F(mkPlans([FISCAL], 1), { openingCash: '100000', cash }))
  // 100000 + 500000 - (40000 + 30000 + 200000 + 10000 + 100000) = 220000
  assert.equal(r.months[0].cashEnd, '220000')
})

test('forecast : sans trésorerie initiale, aucune projection de trésorerie', () => {
  const r = buildForecast(F(mkPlans([FISCAL], 2), { cash: { '2026-01': CASH0 } }))
  assert.deepEqual(r.months.map(m => m.alert), ['RENSEIGNER TRÉSORERIE DÉBUT', 'RENSEIGNER TRÉSORERIE DÉBUT'])
  assert.equal(r.months[0].cashStart, null)
  assert.equal(r.months[0].cashEnd, null)
  assert.equal(r.summary.lowestCash, null)
})

test('forecast : arriérés soldés et trésorerie positive → « À SURVEILLER »', () => {
  const cash = { '2026-01': CASH0, '2026-02': CASH0, '2026-03': CASH0 }
  const r = buildForecast(F(mkPlans([FISCAL], 3), { openingArrears: '300000', openingCash: '1000000', cash }))
  assert.equal(r.months[2].arrearsEnd, '0')
  assert.equal(r.months[2].alert, 'À SURVEILLER')
})

test('forecast : majoration CNSS arrondie à l’XOF (moitié vers le haut)', () => {
  const plans = mkPlans([FISCAL], 1)
  const a = buildForecast(F(plans, { openingCnssPrincipal: '1000000', accrueCnssMajoration: true, cnssMonthlyRate: '0.05' })).months[0]
  assert.equal(a.cnssMajoration, '50000')
  assert.equal(a.arrearsEnd, '950000') // 1000000 + 50000 - 100000
  const down = buildForecast(F(plans, { openingCnssPrincipal: '1000010', accrueCnssMajoration: true, cnssMonthlyRate: '0.015' })).months[0]
  assert.equal(down.cnssMajoration, '15000') // 15000,15
  const up = buildForecast(F(plans, { openingCnssPrincipal: '1000050', accrueCnssMajoration: true, cnssMonthlyRate: '0.015' })).months[0]
  assert.equal(up.cnssMajoration, '15001') // 15000,75
  const off = buildForecast(F(plans, { openingCnssPrincipal: '1000000', accrueCnssMajoration: false, cnssMonthlyRate: '0.05' })).months[0]
  assert.equal(off.cnssMajoration, '0')
})

test('forecast : un échéancier CNSS (paie) réduit le principal CNSS, pas les arriérés', () => {
  const r = buildForecast(F(mkPlans([CNSS], 3), { openingCnssPrincipal: '600000' }))
  assert.deepEqual(r.months.map(m => m.cnssPayments), ['100000', '100000', '100000'])
  assert.deepEqual(r.months.map(m => m.cnssPrincipalStart), ['600000', '500000', '400000'])
  assert.deepEqual(r.months.map(m => m.arrearsEnd), ['1000000', '1000000', '1000000'])
  assert.equal(r.months[0].planPayments.social, '100000')
})

test('forecast : origine « historical_notice » = remboursement ordinaire même si l’organisme est CNSS', () => {
  const r = buildForecast(F(mkPlans([{ ...CNSS, origin: 'historical_notice' }], 2)))
  assert.deepEqual(r.months.map(m => m.cnssPayments), ['0', '0'])
  assert.deepEqual(r.months.map(m => m.arrearsEnd), ['900000', '800000'])
})

test('forecast : sans origine, un organisme contenant « CNSS » est traité comme CNSS (repli textuel actuel)', () => {
  const { origin: _o, ...sansOrigine } = CNSS
  const r = buildForecast(F(mkPlans([sansOrigine], 1), { openingCnssPrincipal: '600000' }))
  assert.equal(r.months[0].cnssPayments, '100000')
  assert.equal(r.months[0].arrearsEnd, '1000000')
})

test('forecast : refus (CNSS mal classé, choix de majoration, taux, échéancier, montants)', () => {
  blocked(() => buildForecast(F(mkPlans([{ ...CNSS, type: 'fiscal' }]))), /classé dans les remboursements sociaux/)
  blocked(() => buildForecast(F(mkPlans([FISCAL]), { accrueCnssMajoration: 'oui' as unknown as boolean })), /majoration CNSS/)
  blocked(() => buildForecast(F(mkPlans([FISCAL]), { accrueCnssMajoration: true })), /Taux mensuel CNSS/)
  blocked(() => buildForecast(F(mkPlans([FISCAL]), { accrueCnssMajoration: true, cnssMonthlyRate: 'abc' })))
  blocked(() => buildForecast(F(undefined as unknown as PlansResult)), /Échéancier absent/)
  blocked(() => buildForecast(F(mkPlans([FISCAL]), { openingArrears: 1000000 as unknown as string })))
  blocked(() => buildForecast(F(mkPlans([FISCAL]), { openingCash: '1', cash: { '2026-01': { ...CASH0, inflows: 'x' } } })))
})

// ---------- différentiel contre la référence (périmètre sans échéancier CNSS) ----------
function prng(seed: number) {
  let s = seed
  return (n: number) => {
    s = (s + 0x6D2B79F5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) % n
  }
}

test('forecast : différentiel vs référence (800 scénarios sans échéancier CNSS)', () => {
  const rnd = prng(20261109)
  const pick = <T>(a: T[]): T => a[rnd(a.length)]
  for (let n = 0; n < 800; n++) {
    const plans = mkPlans([
      { ...FISCAL, balance: pick(['1200000', '700000']), startDate: '2026-02-10', durationMonths: pick([3, 6, 12]) },
      { ...FISCAL, debtId: 'D3', type: 'other', organism: 'Autre', balance: '90000', durationMonths: 3, startDate: '2026-03-01' },
    ], 12)
    const cash: Record<string, CashMonth> = {}
    plans.months.forEach(m => { if (rnd(8) !== 0) cash[m] = { inflows: '900000', currentTaxes: '50000', currentSocial: '30000', netSalaries: '200000', otherOutflows: '10000' } })
    const f: ForecastInput = {
      plans, openingArrears: pick(['2000000', '0', '500000']), openingCnssPrincipal: pick(['600000', '0', '1500000']),
      accrueCnssMajoration: pick([true, false]), cnssMonthlyRate: pick(['0.015', '0.05', '0.0001']),
      openingCash: pick<string | null>([null, '1000000', '0']), cash, manualAdjustments: rnd(2) ? { '2026-04': '25000' } : undefined,
    }
    const a = buildForecast(f)
    const b = refBuildForecast(f as unknown as Parameters<typeof refBuildForecast>[0])
    const ctx = JSON.stringify({ n })
    assert.deepEqual(a.months, b.months, 'mois ' + ctx)
    assert.deepEqual(a.summary, b.summary, 'synthèse ' + ctx)
  }
})
