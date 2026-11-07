import test from 'node:test'
import assert from 'node:assert/strict'
import { consolidateDebts, type DebtInput, type PaymentInput } from '../reference/ref-debts'
import { buildPlans, comparePlanOptions, addMonths, type PlanInput, type PlanParams } from '../reference/ref-plan'
import { buildForecast } from '../reference/ref-forecast'
import { CalcBlockedError } from '../reference/ref-core'

// Valeurs de test uniquement. Attendus calculés à la main d'après les formules du classeur V8 (Dettes, Plan_arrieres, Previsionnel).
const blocked = (fn: () => unknown, re: RegExp) => assert.throws(fn, (e: any) => e instanceof CalcBlockedError && re.test(e.message))
const D = (o: Partial<DebtInput> = {}): DebtInput => ({ id: 'D1', organism: 'DGI', nature: 'ITS', period: '2025', type: 'fiscal', principalConfirmed: '1000000', penaltyConfirmed: '100000', interestConfirmed: '0', credits: '0', ...o })
const P = (o: Partial<PaymentInput> = {}): PaymentInput => ({ id: 'P1', debtId: 'D1', date: '2026-01-10', component: 'principal', amount: '400000', verified: true, ...o })
const one = (d: DebtInput[], p: PaymentInput[] = [], r: 'verified_only' | 'all' = 'verified_only') => consolidateDebts(d, p, r)

// ============ Dettes ============
test('dettes : solde après paiement vérifié', () => {
  const r = one([D()], [P()]).debts[0]
  assert.equal(r.paidPrincipal, '400000'); assert.equal(r.estimatedBalance, '700000'); assert.equal(r.principalBalance, '600000')
  assert.equal(r.penaltyBalance, '100000'); assert.equal(r.confirmedBalance, '700000'); assert.equal(r.proof, 'CONFIRMÉ')
})

test('dettes : estimé en repli, confirmé prioritaire', () => {
  const e = one([D({ principalConfirmed: null, penaltyConfirmed: null, interestConfirmed: null, principalEstimated: '500000' })]).debts[0]
  assert.equal(e.principal, '500000'); assert.equal(e.principalBasis, 'estimated'); assert.equal(e.proof, 'ESTIMATIF'); assert.equal(e.confirmedTotal, null)
  const c = one([D({ principalEstimated: '999', penaltyEstimated: '999' })]).debts[0]
  assert.equal(c.principal, '1000000'); assert.equal(c.principalBasis, 'confirmed'); assert.equal(c.penalty, '100000')
})

test('dettes : débordement entre composantes et crédits', () => {
  const pen = one([D()], [P({ component: 'penalty', amount: '150000' })]).debts[0]
  assert.equal(pen.estimatedBalance, '950000'); assert.equal(pen.principalBalance, '950000'); assert.equal(pen.penaltyBalance, '0')
  const pr = one([D({ principalConfirmed: '100000', penaltyConfirmed: '50000' })], [P({ amount: '130000' })]).debts[0]
  assert.equal(pr.estimatedBalance, '20000'); assert.equal(pr.principalBalance, '0'); assert.equal(pr.penaltyBalance, '20000')
  assert.equal(one([D({ principalConfirmed: '100000', penaltyConfirmed: '0', credits: '30000' })]).debts[0].estimatedBalance, '70000')
  assert.equal(one([D()], [P({ amount: '5000000' })]).debts[0].estimatedBalance, '0')
})

test('dettes : paiements non vérifiés exclus sauf mode « tous »', () => {
  const a = one([D()], [P({ verified: false })]); assert.equal(a.debts[0].estimatedBalance, '1100000'); assert.equal(a.excludedPayments.count, 1); assert.ok(a.warnings.length === 1)
  assert.equal(one([D()], [P({ verified: false })], 'all').debts[0].estimatedBalance, '700000')
})

test('dettes : totaux par type et organisme', () => {
  const r = one([D(), D({ id: 'D2', organism: 'CNSS', type: 'social', principalConfirmed: '300000', penaltyConfirmed: '0' })])
  assert.equal(r.byType.fiscal, '1100000'); assert.equal(r.byType.social, '300000'); assert.equal(r.byOrganism.CNSS, '300000'); assert.equal(r.totals.estimatedBalance, '1400000')
})

test('dettes : refus (doublons, ID inconnu, montants, vérification, mode, capacité)', () => {
  blocked(() => one([D(), D()]), /doublon/); blocked(() => one([D()], [P({ debtId: 'X' })]), /ID dette inconnu/)
  blocked(() => one([D()], [P(), P({ id: 'P2', receiptRef: 'Q' }), P({ id: 'P3', receiptRef: 'Q' })]), /Quittance en doublon/)
  blocked(() => one([D()], [P({ amount: '0' })]), /nul ou négatif/); blocked(() => one([D()], [P({ verified: undefined as any })]), /vérification/)
  blocked(() => one([D({ principalConfirmed: null, penaltyConfirmed: null, interestConfirmed: null })]), /aucun montant/)
  blocked(() => one([D({ credits: undefined as any })]), /chaîne décimale/); blocked(() => one([D({ principalConfirmed: 1 as any })]), /chaîne décimale/)
  blocked(() => one([D()], [], 'x' as any), /reconnaissance/); blocked(() => one([]), /Aucune dette/)
  blocked(() => one([D({ type: undefined as any })]), /type de dette/)
})

// ============ Plan ============
const PL = (o: Partial<PlanInput> = {}): PlanInput => ({ debtId: 'D1', organism: 'DGI', type: 'fiscal', balance: '1200000', startDate: '2026-01-15', durationMonths: 12, periodicityMonths: 1, agreement: 'confirmed', ...o })
const params: PlanParams = { forecastStart: '2026-01', horizonMonths: 24, scope: 'all' }
const plan = (p: PlanInput[], o: Partial<PlanParams> = {}) => buildPlans(p, { ...params, ...o })

test('plan : 12 mensualités égales, fin de contrat, contrôle OK', () => {
  const r = plan([PL()]).plans[0]
  assert.equal(r.installment, '100000'); assert.equal(r.scheduled, '1200000'); assert.equal(r.remainder, '0'); assert.equal(r.control, 'OK')
  assert.equal(r.lastPaymentMonth, '2026-12'); assert.equal(r.contractEndDate, '2027-01-15'); assert.equal(r.firstDebitMonth, '2026-01')
})

test('plan : arrondi à l\'XOF supérieur, dernière échéance ajustée, somme = solde', () => {
  const r = plan([PL({ balance: '1000000' })]).plans[0]
  assert.equal(r.indicativeInstallment, '83334'); assert.equal(r.schedule['2026-01'], '83334'); assert.equal(r.schedule['2026-11'], '83334')
  assert.equal(r.schedule['2026-12'], '83326'); assert.equal(r.scheduled, '1000000')
})

test('plan : mensualité convenue, solde figé, début passé ou futur', () => {
  const c = plan([PL({ balance: '1000000', convenedInstallment: '300000' })]).plans[0]
  assert.equal(c.schedule['2026-04'], '100000'); assert.equal(c.lastPaymentMonth, '2026-04'); assert.equal(c.contractEndDate, '2026-05-15')
  assert.equal(plan([PL({ balance: '2000000', frozenBalance: '1200000' })]).plans[0].installment, '100000')
  assert.equal(plan([PL({ startDate: '2025-06-10' })]).plans[0].firstDebitMonth, '2026-01')
  const late = plan([PL({ startDate: '2026-03-05' })]).plans[0]; assert.equal(late.schedule['2026-01'], '0'); assert.equal(late.firstDebitMonth, '2026-03')
})

test('plan : périmètre confirmé seul, horizon dépassé, solde nul, trimestriel', () => {
  const h = plan([PL({ agreement: 'simulation' })], { scope: 'confirmed_only' }).plans[0]
  assert.equal(h.control, 'HORS PRÉVISIONNEL'); assert.equal(h.firstDebitMonth, null); assert.equal(h.scheduled, '0')
  const over = plan([PL({ balance: '3600000', durationMonths: 36 })]).plans[0]
  assert.equal(over.remainder, '1200000'); assert.equal(over.control, 'RESTE APRÈS HORIZON')
  assert.equal(plan([PL({ balance: '0' })]).plans[0].control, 'SOLDÉ')
  const q = plan([PL({ periodicityMonths: 3 })]).plans[0]
  assert.equal(q.installmentCount, 4); assert.equal(q.installment, '300000'); assert.equal(q.schedule['2026-01'], '300000'); assert.equal(q.schedule['2026-02'], '0'); assert.equal(q.schedule['2026-04'], '300000')
  assert.equal(q.scheduled, '1200000')
})

test('plan : totaux par mois et type, avertissements, comparaison d\'options, EDATE', () => {
  const r = plan([PL(), PL({ debtId: 'D2', organism: 'CNSS', type: 'social', agreement: 'simulation' })])
  assert.equal(r.totalsByMonth['2026-01'].fiscal, '100000'); assert.equal(r.totalsByMonth['2026-01'].social, '100000'); assert.equal(r.totalsByMonth['2026-01'].total, '200000')
  assert.ok(r.warnings.some(w => /sans accord confirmé/.test(w)))
  const c = comparePlanOptions('1200000', '2026-01-15', [{ durationMonths: 12, periodicityMonths: 1 }, { durationMonths: 24, periodicityMonths: 1 }, { durationMonths: 12, periodicityMonths: 3 }])
  assert.deepEqual(c.map(x => x.installment), ['100000', '50000', '300000']); assert.equal(c[1].contractEndDate, '2028-01-15'); assert.equal(c[2].installmentCount, 4)
  assert.equal(addMonths({ y: 2026, m: 1, d: 31 }, 1).d, 28); assert.equal(addMonths({ y: 2026, m: 11, d: 15 }, 3).y, 2027)
})

test('plan : refus', () => {
  blocked(() => plan([PL({ durationMonths: 10, periodicityMonths: 3 })]), /multiple/); blocked(() => plan([PL({ periodicityMonths: 2 as any })]), /périodicité/)
  blocked(() => plan([PL(), PL()]), /doublon/); blocked(() => plan([PL({ agreement: 'x' as any })]), /accord/)
  blocked(() => plan([PL({ balance: 5 as any })]), /chaîne décimale/); blocked(() => plan([PL({ startDate: '2026-02-30' })]), /inexistante/)
  blocked(() => plan([PL()], { scope: 'x' as any }), /Périmètre/); blocked(() => plan([PL()], { horizonMonths: 0 }), /Horizon/); blocked(() => plan([]), /Aucun plan/)
})

// ============ Prévisionnel ============
const fcBase = () => ({ openingArrears: '1200000', openingCnssPrincipal: '0', accrueCnssMajoration: false })
test('prévisionnel : arriérés décroissants, trésorerie à renseigner', () => {
  const f = buildForecast({ ...fcBase(), plans: plan([PL()], { horizonMonths: 12 }) })
  assert.equal(f.months[0].arrearsEnd, '1100000'); assert.equal(f.months[11].arrearsEnd, '0'); assert.equal(f.months[0].alert, 'RENSEIGNER TRÉSORERIE DÉBUT')
  assert.equal(f.summary.arrearsEnd, '0'); assert.equal(f.hypothetical, true)
})

test('prévisionnel : majoration CNSS courue arrondie et ajustements', () => {
  const plans = plan([PL({ debtId: 'C1', organism: 'CNSS', type: 'social' })], { horizonMonths: 3 })
  const f = buildForecast({ plans, openingArrears: '1200000', openingCnssPrincipal: '1200000', accrueCnssMajoration: true, cnssMonthlyRate: '0.015', manualAdjustments: { '2026-02': '5000' } })
  assert.equal(f.months[0].cnssMajoration, '18000'); assert.equal(f.months[0].arrearsEnd, String(1200000 + 18000 - 100000))
  assert.equal(f.months[1].cnssPrincipalStart, '1100000'); assert.equal(f.months[1].cnssMajoration, '16500'); assert.equal(f.months[1].adjustments, '5000')
  assert.equal(f.months[1].arrearsEnd, String(1118000 + 16500 + 5000 - 100000)); assert.equal(f.summary.majorationTotal, String(18000 + 16500 + 15000))
})

test('prévisionnel : trésorerie, déficit, mois sans données => inconnue', () => {
  const plans = plan([PL()], { horizonMonths: 3 })
  const cash = { inflows: '300000', currentTaxes: '100000', currentSocial: '50000', netSalaries: '200000', otherOutflows: '0' }
  const f = buildForecast({ ...fcBase(), plans, openingCash: '500000', cash: { '2026-01': cash, '2026-02': { ...cash, inflows: '0' } } })
  assert.equal(f.months[0].cashEnd, '350000'); assert.equal(f.months[0].alert, 'ARRIÉRÉS RESTANTS')
  assert.equal(f.months[1].cashEnd, String(350000 - 450000)); assert.equal(f.months[1].alert, 'DÉFICIT DE TRÉSORERIE')
  assert.equal(f.months[2].cashEnd, null); assert.equal(f.months[2].alert, 'TRÉSORERIE INCONNUE'); assert.equal(f.summary.deficitMonths, 1)
})

test('prévisionnel : refus (choix implicite, taux manquant, montants)', () => {
  const plans = plan([PL()], { horizonMonths: 2 })
  blocked(() => buildForecast({ ...fcBase(), plans, accrueCnssMajoration: undefined as any }), /explicitement/)
  blocked(() => buildForecast({ ...fcBase(), plans, accrueCnssMajoration: true }), /Taux mensuel/)
  blocked(() => buildForecast({ ...fcBase(), plans, openingArrears: 5 as any }), /chaîne décimale/)
  blocked(() => buildForecast({ ...fcBase(), plans: undefined as any }), /Échéancier absent/)
})
