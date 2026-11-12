import test from 'node:test';
import assert from 'node:assert/strict';
import { computeCnss, computeCnssRange, computeDueDate, lateMonths, CnssBlockedError, type Params, type PayrollLine, type ContributionRule } from '../../lib/fiscal/engine/cnss-liquidation';

// FIXTURES DE TEST UNIQUEMENT : taux fictifs-de-test (valeurs de référence du classeur, NON validées juridiquement).
const rule = (code: string, payer: 'employer' | 'employee', rate: string | null, extra: Partial<ContributionRule> = {}): ContributionRule =>
  ({ code, payer, rate, ceiling: { kind: 'none' }, status: 'validated', legalRef: 'TEST-REF', validFrom: '2022-01', validTo: null, ...extra });
const rules = (): ContributionRule[] => [
  rule('CNSS_PF', 'employer', '0.09'), rule('CNSS_RP', 'employer', null),
  rule('CNSS_PENS_EMP', 'employer', '0.064'), rule('CNSS_PENS_SAL', 'employee', '0.036')];
const params = (o: Partial<Params> = {}): Params => ({ mode: 'validated', calcDate: '2026-10-20', rpRateDefault: '0.02',
  contributionRules: rules(), procedure: { periodicity: 'monthly', dueDay: 15, lateCounting: 'date_to_date', latePenaltyRate: '0.015', status: 'validated', legalRef: 'TEST-REF' }, ...o });
const line = (o: Partial<PayrollLine> = {}): PayrollLine =>
  ({ employeeId: 'E1', period: '2026-07', gross: '300000', bonuses: '50000', benefits: null, otherTaxable: null, payment: 'no', provenance: 'real', ...o });
const blocked = (fn: () => unknown, re: RegExp) => assert.throws(fn, (e: any) => e instanceof CnssBlockedError && re.test(e.message));

test('cotisations par composante (assiette 350000)', () => {
  const r = computeCnss([line()], params()).lines[0];
  assert.equal(r.components.CNSS_PF.amount, '31500');
  assert.equal(r.components.CNSS_RP.amount, '7000');
  assert.equal(r.components.CNSS_PENS_EMP.amount, '22400');
  assert.equal(r.employeeShare, '12600');
  assert.equal(r.employerTotal, '60900');
  assert.equal(r.totalDue, '73500');
});

test('plafond propre à une composante (pas d\'assiette commune)', () => {
  const rs = rules(); rs[2] = rule('CNSS_PENS_EMP', 'employer', '0.064', { ceiling: { kind: 'monthly', amount: '200000' } });
  rs[3] = rule('CNSS_PENS_SAL', 'employee', '0.036', { ceiling: { kind: 'monthly', amount: '200000' } });
  const r = computeCnss([line()], params({ contributionRules: rs })).lines[0];
  assert.equal(r.components.CNSS_PENS_EMP.amount, '12800');
  assert.equal(r.components.CNSS_PENS_EMP.ceilingApplied, true);
  assert.equal(r.components.CNSS_PF.amount, '31500');
  assert.equal(r.employeeShare, '7200');
});

test('mode validé : refuse règle non validée, plafond inconnu, procédure non validée, référence absente', () => {
  const rs = rules(); rs[0] = rule('CNSS_PF', 'employer', '0.09', { status: 'to_verify' });
  blocked(() => computeCnss([line()], params({ contributionRules: rs })), /non validée/);
  const rs2 = rules(); rs2[0] = rule('CNSS_PF', 'employer', '0.09', { ceiling: { kind: 'unknown' } });
  blocked(() => computeCnss([line()], params({ contributionRules: rs2 })), /plafond/);
  blocked(() => computeCnss([line()], params({ procedure: { ...params().procedure, status: 'to_verify' } })), /Procédure/);
  const rs3 = rules(); rs3[0] = rule('CNSS_PF', 'employer', '0.09', { legalRef: ' ' });
  blocked(() => computeCnss([line()], params({ contributionRules: rs3 })), /référence juridique/);
});

test('mode provisoire : calcule mais marque provisoire + avertit', () => {
  const rs = rules(); rs[0] = rule('CNSS_PF', 'employer', '0.09', { status: 'to_verify', ceiling: { kind: 'unknown' } });
  const r = computeCnss([line()], params({ mode: 'provisional', contributionRules: rs }));
  assert.equal(r.provisional, true);
  assert.match(r.warnings[0], /PROVISOIRE/);
  assert.ok(r.lines[0].warnings.some(w => /plafond non vérifié/.test(w)));
});

test('règles chevauchantes, périodes non couvertes, règle abrogée', () => {
  const rs = [...rules(), rule('CNSS_PF', 'employer', '0.1')];
  blocked(() => computeCnss([line()], params({ contributionRules: rs })), /chevauchent/);
  const rs2 = rules().map(r => ({ ...r, validFrom: '2027-01' }));
  blocked(() => computeCnss([line()], params({ contributionRules: rs2 })), /Aucune règle/);
  const rs3 = rules(); rs3[0] = rule('CNSS_PF', 'employer', '0.09', { status: 'repealed' });
  blocked(() => computeCnss([line()], params({ contributionRules: rs3 })), /repealed/);
});

test('taux RP manquant => bloquant (le classeur ne faisait que signaler)', () => {
  blocked(() => computeCnss([line()], params({ rpRateDefault: null })), /risques professionnels/);
  const r = computeCnss([line({ rpRate: '0.03' })], params({ rpRateDefault: null })).lines[0];
  assert.equal(r.components.CNSS_RP.amount, '10500');
});

test('refus des nombres JS, valeurs invalides, rémunération absente, doublons', () => {
  blocked(() => computeCnss([line({ gross: 300000 as any })], params()), /chaîne décimale/);
  blocked(() => computeCnss([line({ gross: '300000.123' })], params()), /invalide/);
  blocked(() => computeCnss([line({ gross: null, bonuses: null })], params()), /aucun zéro implicite/);
  blocked(() => computeCnss([line({ gross: null })], params()), /brut manquant/);
  blocked(() => computeCnss([line(), line()], params()), /Doublon/);
});

test('échéances automatiques (AE)', () => {
  assert.equal(computeDueDate('2026-12', 'monthly', 15), '2027-01-15');
  assert.equal(computeDueDate('2026-03', 'quarterly', 15), '2026-04-15');
  assert.equal(computeDueDate('2026-11', 'quarterly', 15), '2027-01-15');
  assert.equal(computeDueDate('2026-07', 'monthly', 15), '2026-08-15');
});

test('mois de retard (Z) : date à date vs mois civils', () => {
  const d = { y: 2026, m: 8, d: 15 };
  assert.equal(lateMonths(d, { y: 2026, m: 9, d: 13 }, 'date_to_date'), 1);
  assert.equal(lateMonths(d, { y: 2026, m: 9, d: 16 }, 'date_to_date'), 2);
  assert.equal(lateMonths(d, { y: 2026, m: 9, d: 13 }, 'calendar_months'), 2);
  assert.equal(lateMonths(d, { y: 2026, m: 8, d: 15 }, 'calendar_months'), 0);
  assert.equal(lateMonths(d, { y: 2026, m: 8, d: 10 }, 'date_to_date'), 0);
});

test('pénalité impayé : 3 mois x 1,5 % x 73500 = 3307,5', () => {
  const r = computeCnss([line()], params());
  assert.equal(r.lines[0].lateMonths, 3);
  assert.equal(r.lines[0].penalty, '3307.5');
  assert.equal(r.totals.unpaid, '73500');
  assert.equal(r.totals.principalPlusPenalty, '76807.5');
});

test('paiements de paie conformes a V8', () => {
  const paidUnverified = computeCnss([line({ payment: 'yes', paymentDate: '2026-09-13', paymentVerified: false })], params());
  assert.equal(paidUnverified.lines[0].paidRecognized, '73500');
  assert.equal(paidUnverified.lines[0].unpaid, '0');
  assert.equal(paidUnverified.lines[0].lateMonths, 1);
  assert.equal(paidUnverified.lines[0].penalty, '1102.5');

  const paidVerified = computeCnss([line({ payment: 'yes', paymentDate: '2026-09-13', paymentVerified: true })], params());
  assert.equal(paidVerified.lines[0].unpaid, paidUnverified.lines[0].unpaid);
  assert.equal(paidVerified.lines[0].penalty, paidUnverified.lines[0].penalty);

  const partial = computeCnss([line({ payment: 'partial', amountPaid: '23500', paymentVerified: false })], params());
  assert.equal(partial.lines[0].paidRecognized, '23500');
  assert.equal(partial.lines[0].unpaid, '50000');
  assert.ok(partial.lines[0].warnings.some(w => /partiel/.test(w)));

  const noDate = computeCnss([line({ payment: 'yes' })], params());
  assert.equal(noDate.lines[0].penalty, '0');
  assert.equal(noDate.lines[0].lateMonths, 0);
  assert.equal(noDate.lines[0].unpaid, '0');
});

test('provenance estimée signalée ; fourchette RP 1 %/4 % toujours provisoire', () => {
  assert.ok(computeCnss([line({ provenance: 'estimated' })], params()).lines[0].warnings.some(w => /ESTIMÉE/.test(w)));
  const f = computeCnssRange([line()], params(), '0.01', '0.04');
  assert.equal(f.low.lines[0].components.CNSS_RP.amount, '3500');
  assert.equal(f.high.lines[0].components.CNSS_RP.amount, '14000');
  assert.equal(f.low.provisional && f.high.provisional, true);
});

test('agrégats par période exacts sur plusieurs salariés', () => {
  const r = computeCnss([line(), line({ employeeId: 'E2', gross: '100000', bonuses: null })], params());
  assert.equal(r.byPeriod['2026-07'].totalDue, '94500');
  assert.equal(r.totals.employee, '16200');
});
