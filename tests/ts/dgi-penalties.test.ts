import test from 'node:test'
import assert from 'node:assert/strict'
import { computeDgiPenalties, penaltyInputsFromItsVps, PenaltyBlockedError, type DgiPenaltyRules } from '../../lib/fiscal/engine/dgi-penalties'
import { resolveValidatedDgiPenaltyRules, DGI_PENALTY_CODES as C } from '../../lib/fiscal/engine/dgi-penalty-rules'
import { computeItsVps, type ItsRules } from '../../lib/fiscal/engine/its-vps'

// VALEURS DE TEST UNIQUEMENT (reprises du classeur V8 comme jeu d'essai) — AUCUNE valeur réglementaire.
const R: DgiPenaltyRules = { dueDay: 10, rate487: '0.1', rate488Monthly: '0.0025', rate491: '0.2', min491Monthly: '100000', rate491Raised: '0.4', raisedAfterFullMonths: 2, legalRef: 'TEST-CGI Art. TEST' }
const I = (o: Record<string, string> = {}) => ({ employeeId: 'E1', month: '2026-04', itsDueNet: '33500', withheldNotPaid: '0', vpsDueNet: '0', ...o })
const run = (inputs: any[], date = '2026-10-20', rules: DgiPenaltyRules = R) => computeDgiPenalties(inputs, rules, date)
const blocked = (fn: () => unknown, re: RegExp) => assert.throws(fn, (e: any) => e instanceof PenaltyBlockedError && re.test(e.message))

test('échéance : le 10 du mois suivant ; rien si calcDate <= échéance', () => {
  assert.equal(run([I()], '2026-05-10').lines[0].overdue, false); assert.equal(run([I()], '2026-05-10').totals.total, '0')
  assert.equal(run([I()], '2026-05-11').lines[0].overdue, true)
  assert.equal(run([I()]).lines[0].dueDate, '2026-05-10')
  assert.equal(run([I({ month: '2026-12' })], '2027-02-01').lines[0].dueDate, '2027-01-10')
})

test('mois pleins vs mois ou fraction (bornes de jour)', () => {
  const a = run([I()], '2026-07-09').lines[0]; assert.equal(a.fullMonths, 1); assert.equal(a.monthsOrFraction, 2)
  const b = run([I()], '2026-07-10').lines[0]; assert.equal(b.fullMonths, 2); assert.equal(b.monthsOrFraction, 2)
  const c = run([I()], '2026-07-11').lines[0]; assert.equal(c.fullMonths, 2); assert.equal(c.monthsOrFraction, 3)
  const d = run([I()], '2026-05-11').lines[0]; assert.equal(d.fullMonths, 0); assert.equal(d.monthsOrFraction, 1)
})

test('ITS non retenu : art. 487 (10 %) + intérêt art. 488 plafonné', () => {
  const r = run([I()]).lines[0]   // 20/10/2026 : 6 mois ou fraction
  assert.equal(r.monthsOrFraction, 6); assert.equal(r.penalty487Its, '3350'); assert.equal(r.interest488Its, '502.5'); assert.equal(r.penalty491, '0')
  const cap = run([I()], '2026-10-20', { ...R, rate488Monthly: '0.5' }).lines[0]
  assert.equal(cap.interest488Its, '33500') // 0,5 x 6 = 300 % -> plafonné aux droits simples
})

test('VPS impayée : art. 487 + intérêt art. 488', () => {
  const r = run([I({ itsDueNet: '0', vpsDueNet: '12000' })]).lines[0]
  assert.equal(r.penalty487Vps, '1200'); assert.equal(r.interest488Vps, '180')
})

test('art. 491 : 20 % puis 40 % au-delà du seuil de mois pleins ; minimum mensuel', () => {
  const early = run([I({ withheldNotPaid: '33500' })], '2026-06-10').lines[0]   // 1 mois plein
  assert.equal(early.penalty491, '6700'); assert.equal(early.rate491Applied, '0.2')
  const late = run([I({ withheldNotPaid: '33500' })]).lines[0]                   // 5 mois pleins
  assert.equal(late.penalty491, '13400'); assert.equal(late.rate491Applied, '0.4')
  assert.equal(run([I({ withheldNotPaid: '33500' })]).totals.penalty491, '100000') // minimum du mois
  assert.equal(late.penalty487Its, '0') // retenu non reversé => aucun « non retenu »
})

test('minimum 491 par mois sur la somme du mois', () => {
  const two = run([I({ withheldNotPaid: '200000', itsDueNet: '200000' }), I({ employeeId: 'E2', withheldNotPaid: '150000', itsDueNet: '150000' })], '2026-05-20')
  assert.equal(two.by491Month['2026-04'].lineSum, '70000'); assert.equal(two.by491Month['2026-04'].applied, '100000')
  const big = run([I({ withheldNotPaid: '400000', itsDueNet: '400000' }), I({ employeeId: 'E2', withheldNotPaid: '400000', itsDueNet: '400000' })], '2026-05-20')
  assert.equal(big.by491Month['2026-04'].applied, '160000')
  const months = run([I({ withheldNotPaid: '1000', itsDueNet: '1000' }), I({ employeeId: 'E1', month: '2026-05', withheldNotPaid: '1000', itsDueNet: '1000' })], '2026-07-20')
  assert.equal(months.totals.penalty491, '200000') // un minimum par mois
  assert.equal(run([I({ withheldNotPaid: '0' })]).by491Month['2026-04'].applied, '0') // pas de minimum sans infraction
})

test('totaux, hypothèses tracées', () => {
  const r = run([I({ withheldNotPaid: '10000' })])
  assert.equal(r.totals.penalty487Its, '2350'); assert.equal(r.totals.interest488Its, '352.5')
  assert.equal(r.totals.total, String(100000 + 2350 + 352.5)); assert.equal(r.assumptions.length, 2)
})

test('refus : date, mois, doublon, montants, règles invalides', () => {
  blocked(() => run([I()], '2026-02-30'), /inexistante/); blocked(() => run([I()], '20/10/2026'), /invalide/)
  blocked(() => run([I({ month: '2026-13' })]), /mois invalide/); blocked(() => run([I(), I()]), /Doublon/)
  blocked(() => run([I({ itsDueNet: 1 as any })]), /chaîne décimale/); blocked(() => run([]), /Aucune ligne/)
  blocked(() => run([I()], '2026-10-20', { ...R, rate487: '10' }), /taux invalide/)
  blocked(() => run([I()], '2026-10-20', { ...R, legalRef: ' ' }), /Référence juridique/)
  blocked(() => run([I()], '2026-10-20', { ...R, dueDay: 31 }), /1\.\.28/)
})

test('raccord ITS/VPS : soldes non renseignés => pénalités refusées', () => {
  const rules: ItsRules = { fiscalYear: 2026, legalRef: 'T', vpsRate: '0.04', ortbMarch: '0', ortbJune: '0', ortbJuneMinBase: '0', brackets: [{ from: '0', rate: '0' }, { from: '60000', rate: '0.1' }] }
  const base = { employeeId: 'E1', month: '2026-04', itsBase: '100000', vpsExempt: false, provenance: 'real' as const }
  const ok = computeItsVps([{ ...base, itsWithheld: '0', itsPaid: '0', vpsDeclared: '0', vpsPaid: '0' }], rules)
  const p = computeDgiPenalties(penaltyInputsFromItsVps(ok), R, '2026-10-20')
  assert.equal(p.lines[0].penalty487Its, '400'); assert.equal(p.lines[0].penalty487Vps, '400') // ITS 4000 x 10 % ; VPS 4000 x 10 %
  const missing = computeItsVps([{ ...base, itsWithheld: '0', itsPaid: null, vpsDeclared: '0', vpsPaid: '0' }], rules)
  blocked(() => penaltyInputsFromItsVps(missing), /non renseignés/)
})

// ---------- résolveur ----------
type E = Record<string, unknown>
function fake(params: E[], sources: E[], err: 'params' | 'sources' | null = null): any {
  const mk = (rows: () => E[], e: boolean) => { const b: any = new Proxy({}, { get: (_t, k) => k === 'then' ? (res: any) => res({ data: e ? null : rows(), error: e ? { message: 'x' } : null }) : () => b }); return b }
  return { from: () => ({ select: (c: string) => c.includes('numeric_value') ? mk(() => params, err === 'params') : mk(() => sources, err === 'sources') }) }
}
const SRC = { id: 's1', entry_type: 'legal_source', code: 'TEST-CGI', verification_status: 'validated' }
const row = (code: string, v: string, unit: string, o: E = {}): E => ({ id: 'id-' + code, entry_type: 'parameter', code, numeric_value: v, unit, currency: unit === 'XOF' ? 'XOF' : null,
  source_entry_id: 's1', article_reference: 'Art. TEST', effective_from: '2026-01-01', effective_to: null, verification_status: 'validated', ...o })
const full = (): E[] => [row(C.dueDay, '10', 'day'), row(C.r487, '0.1', 'ratio'), row(C.r488, '0.0025', 'ratio'), row(C.r491, '0.2', 'ratio'),
  row(C.min491, '100000', 'XOF'), row(C.r491Raised, '0.4', 'ratio'), row(C.raisedAfter, '2', 'months')]

test('résolveur pénalités : lecture complète puis calcul', async () => {
  const r = await resolveValidatedDgiPenaltyRules(fake(full(), [SRC]), 2026); assert.equal(r.ok, true); if (!r.ok) return
  assert.equal(r.rules.dueDay, 10); assert.equal(r.rules.raisedAfterFullMonths, 2); assert.equal(r.trace.length, 7)
  assert.equal(computeDgiPenalties([I({ withheldNotPaid: '33500' })], r.rules, '2026-10-20').totals.penalty491, '100000')
})

test('résolveur pénalités : blocages', async () => {
  const nok = async (rows: E[], src: E[] = [SRC], re?: RegExp, err: any = null) => {
    const r = await resolveValidatedDgiPenaltyRules(fake(rows, src, err), 2026); assert.equal(r.ok, false)
    if (re && !r.ok) assert.ok(r.blockers.some(b => re.test(b.code + b.message)), JSON.stringify(r.blockers))
  }
  await nok(full().filter(x => x.code !== C.r491Raised), [SRC], /DGI_491_RAISED_RATE/)
  await nok(full().map(x => x.code === C.r488 ? { ...x, verification_status: 'to_verify' } : x), [SRC], /DGI_488_RATE_MONTHLY/)
  await nok(full(), [{ ...SRC, verification_status: 'in_review' }], /LEGAL_SOURCE/)
  await nok([...full(), row(C.r487, '0.2', 'ratio', { id: 'dup' })], [SRC], /OVERLAP/)
  await nok(full().map(x => x.code === C.r487 ? { ...x, numeric_value: '10' } : x), [SRC], /PENALTY_RATE_FORMAT/)
  await nok(full().map(x => x.code === C.min491 ? { ...x, unit: 'ratio' } : x), [SRC], /PENALTY_MIN_FORMAT/)
  await nok(full().map(x => x.code === C.dueDay ? { ...x, numeric_value: '31' } : x), [SRC], /PENALTY_DUE_DAY/)
  await nok(full().map(x => x.code === C.raisedAfter ? { ...x, unit: 'day' } : x), [SRC], /PENALTY_THRESHOLD/)
  await nok(full().map(x => x.code === C.r491 ? { ...x, article_reference: ' ' } : x), [SRC], /TRACE/)
  await nok(full().map(x => x.code === C.r491 ? { ...x, effective_to: '2026-06-30' } : x), [SRC], /DGI_491_RATE/)
  await nok(full(), [SRC], undefined, 'params'); await nok(full(), [SRC], undefined, 'sources')
  const zero = full().map(x => x.code === C.r487 ? { ...x, numeric_value: '0' } : x)
  assert.equal((await resolveValidatedDgiPenaltyRules(fake(zero, [SRC]), 2026)).ok, true) // taux 0 validé = décision explicite
})
