import test from 'node:test'
import assert from 'node:assert/strict'
import { debtsFromCalculations, doubleImputationWarnings, type StoredCalculation } from '../../lib/fiscal/engine/debt-adapter'
import { loadStoredCalculations } from '../../lib/fiscal/calc-store'
import { CalcBlockedError } from '../../lib/fiscal/engine/penalty-core'
import { computeItsVps } from '../../lib/fiscal/engine/its-vps'
import { computeDgiPenalties, penaltyInputsFromItsVps } from '../../lib/fiscal/engine/dgi-penalties'
import { computeTva } from '../../lib/fiscal/engine/tva'
import { computeAib } from '../../lib/fiscal/engine/aib-retenues'
import { consolidateDebts } from '../reference/ref-debts'

// Valeurs de test uniquement. Attendus calculés à la main d'après Liaison_Dettes (G brut, H pénalités, I déjà réglé).
const blocked = (fn: () => unknown, re: RegExp) => assert.throws(fn, (e: any) => e instanceof CalcBlockedError && re.test(e.message))
const calc = (kind: any, year: number, result: unknown, status = 'validated', id = 'c-' + kind): StoredCalculation => ({ id, kind, fiscalYear: year, validationStatus: status, result })

const CNSS = { totals: { employer: '60900', employee: '12600', totalDue: '73500', unpaid: '50000', penalty: '3307.5', principalPlusPenalty: '53307.5' } }
const ITS = (pen: boolean) => ({ totals: { itsDue: '100000', itsDueNet: '70000', vpsDue: '40000', vpsDueNet: '40000', withheldNotPaid: '0', itsGap: '0', vpsGap: '0' },
  ...(pen ? { penalties: { totals: { penalty491: '100000', penalty487Its: '7000', interest488Its: '1050', penalty487Vps: '4000', interest488Vps: '600', total: '112650' } } } : {}) })

test('CNSS : principal brut, déjà réglé = brut - impayé, pénalité', () => {
  const r = debtsFromCalculations([calc('cnss', 2026, CNSS)], 'strict')
  assert.deepEqual(r.debts[0], { id: 'AUTO-CNSS-2026', organism: 'CNSS', nature: 'Cotisations CNSS employeur + salarié (+ majorations)', period: '2026', type: 'social',
    principalEstimated: '73500', penaltyEstimated: '3307.5', credits: '23500' })
  assert.equal(r.sources[0].calculationId, 'c-cnss')
})

test('ITS/VPS : deux dettes, crédits = dû - dû net, pénalités réparties ITS / VPS', () => {
  const r = debtsFromCalculations([calc('its_vps', 2026, ITS(true))], 'strict')
  const its = r.debts.filter(d => d.id === 'AUTO-ITS-2026')[0], vps = r.debts.filter(d => d.id === 'AUTO-VPS-2026')[0]
  assert.equal(its.principalEstimated, '100000'); assert.equal(its.credits, '30000'); assert.equal(its.penaltyEstimated, '108050')
  assert.equal(vps.principalEstimated, '40000'); assert.equal(vps.credits, '0'); assert.equal(vps.penaltyEstimated, '4600'); assert.equal(its.organism, 'DGI')
})

test('pénalités non calculées => NULLES et signalées (jamais zéro)', () => {
  const r = debtsFromCalculations([calc('its_vps', 2026, ITS(false))], 'strict')
  assert.equal(r.debts[0].penaltyEstimated, null); assert.ok(r.warnings.some(w => /pénalités non calculées/.test(w)))
})

test('TVA, AIB, retenues : mapping des totaux', () => {
  const tva = debtsFromCalculations([calc('tva', 2026, { totals: { collected: '0', payable: '0', retained: '150000', unpaid: '50000', penalty487: '5000', interest488: '300', closingCredit: '0' } })], 'strict').debts[0]
  assert.equal(tva.id, 'AUTO-TVA-2026'); assert.equal(tva.principalEstimated, '150000'); assert.equal(tva.credits, '100000'); assert.equal(tva.penaltyEstimated, '5300')
  const aib = debtsFromCalculations([calc('aib', 2026, { totals: { calculated: '10000', netDue: '5000', penalty491: '100000' } })], 'strict').debts[0]
  assert.equal(aib.id, 'AUTO-AIB-2026'); assert.equal(aib.credits, '5000'); assert.equal(aib.penaltyEstimated, '100000')
  const ret = debtsFromCalculations([calc('retenues', 2026, { totals: { calculated: '200000', netDue: '150000', penalty491: null } })], 'strict')
  assert.equal(ret.debts[0].id, 'AUTO-RET-2026'); assert.equal(ret.debts[0].penaltyEstimated, null)
})

test('refus : calcul non validé, doublon, type inconnu, structure, montants', () => {
  blocked(() => debtsFromCalculations([calc('cnss', 2026, CNSS, 'pending_review')], 'strict'), /VALIDÉS/)
  blocked(() => debtsFromCalculations([calc('cnss', 2026, CNSS), calc('cnss', 2026, CNSS, 'validated', 'c2')], 'strict'), /Deux calculs validés/)
  blocked(() => debtsFromCalculations([calc('xyz', 2026, CNSS)], 'strict'), /type de calcul inconnu/)
  blocked(() => debtsFromCalculations([calc('cnss', 2026, {})], 'strict'), /structure invalide/)
  blocked(() => debtsFromCalculations([calc('cnss', 2026, { totals: { ...CNSS.totals, totalDue: 5 } })], 'strict'), /absent du résultat/)
  blocked(() => debtsFromCalculations([], 'strict'), /Aucun calcul/); blocked(() => debtsFromCalculations([calc('cnss', 2026, CNSS)], 'x' as any), /arrondi/)
  blocked(() => debtsFromCalculations([calc('cnss', 1999, CNSS)], 'strict'), /exercice invalide/)
})

test('arrondi : refus au-delà de 2 décimales, sauf choix explicite signalé', () => {
  const r = { totals: { calculated: '10000.0025', netDue: '5000', penalty491: null } }
  blocked(() => debtsFromCalculations([calc('aib', 2026, r)], 'strict'), /plus de 2 décimales/)
  const ok = debtsFromCalculations([calc('aib', 2026, r)], 'half_up_xof')
  assert.equal(ok.debts[0].principalEstimated, '10000'); assert.ok(ok.warnings.some(w => /règle d'arrondi à valider/.test(w)))
})

test('dette nulle ignorée ; crédits plafonnés au brut', () => {
  const z = debtsFromCalculations([calc('aib', 2026, { totals: { calculated: '0', netDue: '0', penalty491: '0' } })], 'strict')
  assert.equal(z.debts.length, 0); assert.ok(z.warnings.some(w => /rien à porter/.test(w)))
})

test('double imputation : règlement déjà pris en compte + paiement du registre', () => {
  const d = debtsFromCalculations([calc('cnss', 2026, CNSS)], 'strict').debts
  assert.equal(doubleImputationWarnings(d, [{ debtId: 'AUTO-CNSS-2026', amount: '10000' }]).length, 1)
  assert.equal(doubleImputationWarnings(d, []).length, 0)
  assert.equal(doubleImputationWarnings(d, [{ debtId: 'AUTO-ITS-2026', amount: '10000' }]).length, 0)
})

test('chaîne complète : moteurs -> résultat enregistré -> dettes -> consolidation', () => {
  const its = computeItsVps([{ employeeId: 'E1', month: '2026-04', itsBase: '300000', vpsExempt: false, provenance: 'real', itsWithheld: '33500', itsPaid: '20000', vpsDeclared: '0', vpsPaid: '0' }],
    { fiscalYear: 2026, legalRef: 'T', vpsRate: '0.04', ortbMarch: '1000', ortbJune: '3000', ortbJuneMinBase: '60000',
      brackets: [{ from: '0', rate: '0' }, { from: '60000', rate: '0.1' }, { from: '150000', rate: '0.15' }, { from: '250000', rate: '0.19' }, { from: '500000', rate: '0.3' }] })
  const pen = computeDgiPenalties(penaltyInputsFromItsVps(its), { dueDay: 10, rate487: '0.1', rate488Monthly: '0.0025', rate491: '0.2', min491Monthly: '100000', rate491Raised: '0.4', raisedAfterFullMonths: 2, legalRef: 'T' }, '2026-10-20')
  const stored = JSON.parse(JSON.stringify({ ...its, penalties: pen }))   // comme relu depuis jsonb
  const adapted = debtsFromCalculations([calc('its_vps', 2026, stored)], 'strict')
  const its1 = adapted.debts.filter(d => d.id === 'AUTO-ITS-2026')[0]
  assert.equal(its1.principalEstimated, '33500'); assert.equal(its1.credits, '20000')
  const cons = consolidateDebts(adapted.debts as any, [], 'verified_only')
  const itsC = cons.debts.filter((d: any) => d.id === 'AUTO-ITS-2026')[0]
  assert.equal(itsC.estimatedBalance, String(33500 + Number(its1.penaltyEstimated) - 20000))
})

// ---------- lecture serveur ----------
const U = (n: number) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0')
function fake(rows: unknown[], err = false): any {
  const b: any = new Proxy({}, { get: (_t, k) => k === 'then' ? (res: any) => res({ data: err ? null : rows, error: err ? { message: 'x' } : null }) : () => b })
  return { from: () => b }
}
const row = (id: string, o: any = {}) => ({ id, dossier_id: U(1), validation_status: 'validated', blockers: [], input_snapshot: { inputs: { kind: 'cnss', fiscal_year: 2026 } }, result_snapshot: CNSS, ...o })

test('lecture serveur : calculs relus, typés, contrôlés', async () => {
  const r = await loadStoredCalculations(fake([row(U(10))]), U(1), [U(10)])
  assert.equal(r[0].kind, 'cnss'); assert.equal(r[0].fiscalYear, 2026); assert.equal(r[0].validationStatus, 'validated')
  const bad = async (rows: unknown[], ids: string[], re: RegExp, err = false, dossier = U(1)) => { await assert.rejects(() => loadStoredCalculations(fake(rows, err), dossier, ids), (e: any) => e instanceof CalcBlockedError && re.test(e.message)) }
  await bad([row(U(10))], [U(10), U(11)], /introuvable/)
  await bad([row(U(10))], [U(10), U(10)], /doublon/); await bad([], [], /attendus/); await bad([row(U(10))], ['x'], /invalide/)
  await bad([row(U(10))], [U(10)], /invalide/, false, 'x')
  await bad([row(U(10), { input_snapshot: { inputs: { kind: 'zzz', fiscal_year: 2026 } } })], [U(10)], /type inconnu/)
  await bad([row(U(10), { input_snapshot: { inputs: { kind: 'cnss' } } })], [U(10)], /exercice absent/)
  await bad([row(U(10), { result_snapshot: null })], [U(10)], /aucun résultat/)
  await bad([row(U(10), { blockers: [{ code: 'x' }] })], [U(10)], /blocages/)
  await bad([row(U(10))], [U(10)], /impossible/, true)
})
