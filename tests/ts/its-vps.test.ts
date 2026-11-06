import test from 'node:test'
import assert from 'node:assert/strict'
import { computeItsVps, ItsVpsBlockedError, type ItsRules, type ItsVpsLine } from '../../lib/fiscal/engine/its-vps'
import { resolveValidatedItsRules } from '../../lib/fiscal/engine/its-rules'
import { parseItsVpsSection } from '../../lib/fiscal/its-input'

// VALEURS DE TEST UNIQUEMENT (reprises du classeur V8 comme jeu d'essai) — AUCUNE valeur réglementaire.
const RULES: ItsRules = { fiscalYear: 2026, legalRef: 'TEST-LOI Art. TEST', vpsRate: '0.04', ortbMarch: '1000', ortbJune: '3000', ortbJuneMinBase: '60000',
  brackets: [{ from: '0', rate: '0' }, { from: '60000', rate: '0.1' }, { from: '150000', rate: '0.15' }, { from: '250000', rate: '0.19' }, { from: '500000', rate: '0.3' }] }
const L = (o: Partial<ItsVpsLine> = {}): ItsVpsLine => ({ employeeId: 'E1', month: '2026-04', itsBase: '300000', vpsExempt: false, provenance: 'real',
  itsWithheld: '0', itsPaid: '0', vpsDeclared: '0', vpsPaid: '0', ...o })
const blocked = (fn: () => unknown, re: RegExp) => assert.throws(fn, (e: any) => e instanceof ItsVpsBlockedError && re.test(e.message))
const one = (o: Partial<ItsVpsLine> = {}) => computeItsVps([L(o)], RULES).lines[0]

test('barème progressif exact (300000 -> 33500 ; 600000 -> 101500)', () => {
  assert.equal(one().bracketTax, '33500'); assert.equal(one().itsDue, '33500')
  assert.equal(one({ itsBase: '600000' }).bracketTax, '101500')
})

test('bornes : tranche exonérée, premier franc imposé, valeurs décimales', () => {
  assert.equal(one({ itsBase: '50000' }).itsDue, '0'); assert.equal(one({ itsBase: '60000' }).itsDue, '0')
  assert.equal(one({ itsBase: '60001' }).itsDue, '0.1'); assert.equal(one({ itsBase: '150000' }).itsDue, '9000')
  assert.equal(one({ itsBase: '250001' }).bracketTax, '24000.19')
})

test('ORTB : mars toujours, juin seulement si base > seuil', () => {
  assert.equal(one({ month: '2026-03' }).ortb, '1000'); assert.equal(one({ month: '2026-03' }).itsDue, '34500')
  assert.equal(one({ month: '2026-06' }).ortb, '3000'); assert.equal(one({ month: '2026-06' }).itsDue, '36500')
  assert.equal(one({ month: '2026-06', itsBase: '60000' }).ortb, '0')
  assert.equal(one({ month: '2026-05' }).ortb, '0')
})

test('VPS : base ITS, base distincte, exonération explicite', () => {
  assert.equal(one().vpsDue, '12000')
  assert.equal(one({ vpsBaseOverride: '400000' }).vpsDue, '16000')
  assert.equal(one({ vpsExempt: true }).vpsDue, '0')
})

test('soldes : retenu, reversé, écarts et plafonnement à zéro', () => {
  const r = one({ month: '2026-03', itsWithheld: '30000', itsPaid: '20000' })
  assert.equal(r.itsGap, '4500'); assert.equal(r.itsDueNet, '14500'); assert.equal(r.withheldNotPaid, '10000')
  assert.equal(one({ itsPaid: '50000' }).itsDueNet, '0')
  const v = one({ vpsDeclared: '10000', vpsPaid: '12000' })
  assert.equal(v.vpsGap, '2000'); assert.equal(v.vpsDueNet, '0')
})

test('valeurs absentes : jamais zéro implicite, résultat incomplet', () => {
  const res = computeItsVps([L({ itsPaid: null, vpsPaid: undefined, itsWithheld: '30000' })], RULES)
  const r = res.lines[0]
  assert.equal(r.itsDueNet, null); assert.equal(r.withheldNotPaid, null); assert.equal(r.vpsDueNet, null)
  assert.equal(res.complete, false); assert.equal(res.unknown.itsPaid, 1); assert.equal(res.unknown.vpsPaid, 1)
  assert.equal(res.totals.itsDueNet, '0'); assert.match(res.warnings[0], /INCOMPLET/)
  assert.ok(r.warnings.some(w => /pas de zéro implicite/.test(w)))
  assert.equal(computeItsVps([L()], RULES).complete, true)
})

test('totaux et agrégats par mois exacts', () => {
  const r = computeItsVps([L({ month: '2026-03' }), L({ employeeId: 'E2', month: '2026-03', itsBase: '600000' }), L({ month: '2026-04', employeeId: 'E3' })], RULES)
  assert.equal(r.byMonth['2026-03'].itsDue, String(34500 + 102500)); assert.equal(r.totals.itsDue, String(34500 + 102500 + 33500))
  assert.equal(r.totals.vpsDue, String(12000 + 24000 + 12000)); assert.equal(r.provisional, false)
})

test('refus : doublon, exercice, mois, nombre JS, vpsExempt absent, vide, provenance', () => {
  blocked(() => computeItsVps([L(), L()], RULES), /Doublon/)
  blocked(() => computeItsVps([L({ month: '2025-12' })], RULES), /hors de l'exercice/)
  blocked(() => computeItsVps([L({ month: '2026-13' })], RULES), /mois invalide/)
  blocked(() => computeItsVps([L({ itsBase: 300000 as any })], RULES), /chaîne décimale/)
  blocked(() => computeItsVps([L({ itsPaid: 100 as any })], RULES), /chaîne décimale/)
  blocked(() => computeItsVps([L({ vpsExempt: undefined as any })], RULES), /vpsExempt/)
  blocked(() => computeItsVps([], RULES), /Aucune ligne/)
  assert.ok(one({ provenance: 'estimated' }).warnings.some(w => /ESTIMÉE/.test(w)))
})

test('refus : barème invalide ou référence absente', () => {
  const b = (brackets: any) => () => computeItsVps([L()], { ...RULES, brackets })
  blocked(b([{ from: '1', rate: '0' }]), /commencer à 0/)
  blocked(b([{ from: '0', rate: '0' }, { from: '0', rate: '0.1' }]), /croissantes/)
  blocked(b([{ from: '0', rate: '10' }]), /taux invalide/)
  blocked(() => computeItsVps([L()], { ...RULES, legalRef: ' ' }), /Référence juridique/)
})

// ---------- résolveur ----------
type E = Record<string, unknown>
function fake(params: E[], sources: E[], err: 'params' | 'sources' | null = null): any {
  const mk = (rows: () => E[], e: boolean) => { const b: any = new Proxy({}, { get: (_t, k) => k === 'then' ? (res: any) => res({ data: e ? null : rows(), error: e ? { message: 'x' } : null }) : () => b }); return b }
  return { from: () => ({ select: (c: string) => c.includes('numeric_value') ? mk(() => params, err === 'params') : mk(() => sources, err === 'sources') }) }
}
const SRC = { id: 's1', entry_type: 'legal_source', code: 'TEST-LOI', verification_status: 'validated' }
const row = (code: string, v: string, unit: string, o: E = {}): E => ({ id: 'id-' + code, entry_type: 'parameter', code, numeric_value: v, unit, currency: unit === 'XOF' ? 'XOF' : null,
  source_entry_id: 's1', article_reference: 'Art. TEST', effective_from: '2026-01-01', effective_to: null, verification_status: 'validated', ...o })
const full = (): E[] => [row('ITS_BRACKET_1_FROM', '0', 'XOF'), row('ITS_BRACKET_1_RATE', '0', 'ratio'), row('ITS_BRACKET_2_FROM', '60000', 'XOF'), row('ITS_BRACKET_2_RATE', '0.1', 'ratio'),
  row('ITS_BRACKET_3_FROM', '150000', 'XOF'), row('ITS_BRACKET_3_RATE', '0.15', 'ratio'),
  row('ITS_ORTB_MARCH', '0', 'XOF'), row('ITS_ORTB_JUNE', '0', 'XOF'), row('ITS_ORTB_JUNE_MIN_BASE', '0', 'XOF'), row('VPS_RATE', '0.04', 'ratio')]

test('résolveur : barème lu du référentiel, ORTB à zéro autorisé, traçabilité', async () => {
  const r = await resolveValidatedItsRules(fake(full(), [SRC]), 2026); assert.equal(r.ok, true); if (!r.ok) return
  assert.equal(r.rules.brackets.length, 3); assert.equal(r.rules.ortbMarch, '0'); assert.equal(r.trace.length, 10)
  assert.match(r.rules.legalRef, /TEST-LOI Art\. TEST/)
  const res = computeItsVps([L({ itsBase: '200000', month: '2026-03' })], r.rules)
  assert.equal(res.lines[0].itsDue, String(9000 + 7500)) // (150000-60000)x10% + (200000-150000)x15%, ORTB 0
})

test('résolveur : blocages (code manquant, trou de tranche, doublon, non validé, source, formats)', async () => {
  const nok = async (rows: E[], src: E[] = [SRC], re?: RegExp, err: any = null) => {
    const r = await resolveValidatedItsRules(fake(rows, src, err), 2026); assert.equal(r.ok, false)
    if (re && !r.ok) assert.ok(r.blockers.some(b => re.test(b.code + b.message)), JSON.stringify(r.blockers))
  }
  await nok(full().filter(x => x.code !== 'VPS_RATE'), [SRC], /VPS_RATE/)
  await nok(full().filter(x => x.code !== 'ITS_BRACKET_1_FROM'), [SRC], /tranche 1/)
  await nok([...full(), row('ITS_BRACKET_5_FROM', '500000', 'XOF'), row('ITS_BRACKET_5_RATE', '0.3', 'ratio')], [SRC], /GAP/)
  await nok(full().filter(x => x.code !== 'ITS_BRACKET_2_RATE'), [SRC], /taux manquant/)
  await nok([...full(), row('VPS_RATE', '0.05', 'ratio', { id: 'dup' })], [SRC], /OVERLAP/)
  await nok(full().map(x => x.code === 'VPS_RATE' ? { ...x, verification_status: 'to_verify' } : x), [SRC], /VPS_RATE/)
  await nok(full(), [{ ...SRC, verification_status: 'to_verify' }], /LEGAL_SOURCE/)
  await nok(full().map(x => x.code === 'ITS_BRACKET_1_FROM' ? { ...x, numeric_value: '100' } : x), [SRC], /ITS_BRACKET_START/)
  await nok(full().map(x => x.code === 'ITS_BRACKET_3_FROM' ? { ...x, numeric_value: '50000' } : x), [SRC], /ITS_BRACKET_ORDER/)
  await nok(full().map(x => x.code === 'VPS_RATE' ? { ...x, numeric_value: '4' } : x), [SRC], /VPS_RATE_FORMAT/)
  await nok(full().map(x => x.code === 'ITS_ORTB_MARCH' ? { ...x, unit: 'ratio' } : x), [SRC], /ORTB_FORMAT/)
  await nok(full().map(x => x.code === 'VPS_RATE' ? { ...x, effective_to: '2026-06-30' } : x), [SRC], /VPS_RATE/)
  await nok(full().map(x => x.code === 'VPS_RATE' ? { ...x, article_reference: '' } : x), [SRC], /TRACE/)
  await nok(full(), [SRC], undefined, 'params'); await nok(full(), [SRC], undefined, 'sources')
})

// ---------- lecture de saisie ----------
const P = (lines: E[], mode = 'actual') => ({ source_mode: mode, data: { lines } })
const R = (o: E = {}): E => ({ employee_id: 'E1', month: '2026-04', its_base: '300000', vps_exempt: false, its_paid: '0', ...o })

test('saisie : cas valide, null conservé, provenance', () => {
  const l = parseItsVpsSection(P([R()]))
  assert.equal(l[0].itsBase, '300000'); assert.equal(l[0].itsWithheld, null); assert.equal(l[0].itsPaid, '0'); assert.equal(l[0].provenance, 'real')
  assert.equal(parseItsVpsSection(P([R()], 'estimated'))[0].provenance, 'estimated')
})

test('saisie : refus des structures et valeurs invalides', () => {
  const bad = (x: unknown, re: RegExp) => assert.throws(() => parseItsVpsSection(x), (e: any) => re.test(e.message))
  bad(null, /structure/); bad({ source_mode: 'x', data: {} }, /Nature/); bad(P([]), /Aucune ligne/)
  bad(P([R({ its_base: 300000 })]), /its_base/); bad(P([R({ vps_exempt: undefined })]), /vps_exempt/)
  bad(P([R({ its_paid: 5 })]), /chaîne décimale/); bad(P([R({ employee_id: ' ' })]), /employee_id/)
  bad(P([R({ provenance: 'estimated' })]), /incompatible/); bad(P([R()], 'mixed'), /obligatoire en mode mixed/)
  bad(P(Array.from({ length: 6001 }, (_, i) => R({ employee_id: 'E' + i }))), /Capacité/)
})

test('bout en bout : saisie -> règles du référentiel -> calcul exact', async () => {
  const rules = await resolveValidatedItsRules(fake(full(), [SRC]), 2026); assert.ok(rules.ok); if (!rules.ok) return
  const lines = parseItsVpsSection(P([R({ its_base: '200000', vps_declared: '8000', vps_paid: '8000', its_withheld: '16500', its_paid: '16500' })]))
  const out = computeItsVps(lines, rules.rules)
  assert.equal(out.complete, true); assert.equal(out.lines[0].itsDue, '16500'); assert.equal(out.lines[0].itsDueNet, '0')
  assert.equal(out.lines[0].vpsDue, '8000'); assert.equal(out.lines[0].vpsGap, '0')
})
