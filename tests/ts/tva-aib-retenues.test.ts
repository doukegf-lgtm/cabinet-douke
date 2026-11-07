import test from 'node:test'
import assert from 'node:assert/strict'
import { computeTva, type TvaLine, type TvaRules } from '../../lib/fiscal/engine/tva'
import { computeAib, computeRetenues, type AibLine, type AibRules, type RetenueLine, type RetenueRules } from '../../lib/fiscal/engine/aib-retenues'
import { CalcBlockedError } from '../../lib/fiscal/engine/penalty-core'
import { resolveValidatedTvaRules, resolveValidatedAibRules, resolveValidatedRetenuesRules } from '../../lib/fiscal/engine/vat-withholding-rules'
import { parseTvaSection, parseAibSection, parseRetenuesSection } from '../../lib/fiscal/vat-withholding-input'

// VALEURS DE TEST UNIQUEMENT (reprises du classeur V8 comme jeu d'essai) — AUCUNE valeur réglementaire.
const blocked = (fn: () => unknown, re: RegExp) => assert.throws(fn, (e: any) => e instanceof CalcBlockedError && re.test(e.message))

// ================= TVA =================
const TR: TvaRules = { vatRate: '0.18', dueDay: 10, rate487: '0.1', rate488Monthly: '0.0025', legalRef: 'TEST Art. TEST' }
const T = (o: Partial<TvaLine> = {}): TvaLine => ({ month: '2026-01', regime: 'taxable', salesHt: '1000000', deductibleVat: '50000', adjustments: '0', filed: false, declared: null, paid: '0', provenance: 'real', ...o })
const tva = (lines: TvaLine[], date: string | null = null, opening = '0') => computeTva({ openingCredit: opening, lines }, TR, 2026, date)

test('TVA : collectée, nette, à payer', () => {
  const l = tva([T()]).lines[0]
  assert.equal(l.collected, '180000'); assert.equal(l.net, '130000'); assert.equal(l.payable, '130000'); assert.equal(l.creditAfter, '0')
  assert.equal(l.penalty487, null) // pas de date de calcul => pas de pénalités
})

test('TVA : report de crédit mois après mois et crédit initial', () => {
  const r = tva([T({ month: '2026-01', salesHt: '100000', deductibleVat: '30000' }), T({ month: '2026-02', salesHt: '200000', deductibleVat: '10000' })])
  assert.equal(r.lines[0].payable, '0'); assert.equal(r.lines[0].creditAfter, '12000')
  assert.equal(r.lines[1].creditBefore, '12000'); assert.equal(r.lines[1].payable, '14000'); assert.equal(r.lines[1].creditAfter, '0')
  assert.equal(tva([T()], null, '30000').lines[0].payable, '100000')
  assert.equal(r.totals.closingCredit, '0')
})

test('TVA : exonérée / hors champ => collectée nulle ; partiellement taxable signalé', () => {
  assert.equal(tva([T({ regime: 'exempt' })]).lines[0].collected, '0')
  assert.equal(tva([T({ regime: 'out_of_scope' })]).lines[0].net, '-50000')
  assert.ok(tva([T({ regime: 'partial' })]).lines[0].warnings.some(w => /partiellement taxable/.test(w)))
})

test('TVA : dû retenu = max(calculé, déclaré), paiements plafonnés', () => {
  const hi = tva([T({ filed: true, declared: '150000', paid: '100000' })]).lines[0]
  assert.equal(hi.retained, '150000'); assert.equal(hi.unpaidBase, '50000'); assert.equal(hi.declaredUnpaid, '50000'); assert.equal(hi.declarationGap, '-20000')
  assert.equal(tva([T({ filed: true, declared: '100000' })]).lines[0].retained, '130000')
  assert.equal(tva([T({ paid: '200000' })]).lines[0].unpaidBase, '0')
})

test('TVA : pénalités art. 487 et intérêt art. 488 (échéance le 10 du mois suivant)', () => {
  const l = tva([T()], '2026-10-20').lines[0]   // échéance 10/02 ; 9 mois ou fraction
  assert.equal(l.dueDate, '2026-02-10'); assert.equal(l.penalty487, '13000'); assert.equal(l.interest488, '2925')
  const none = tva([T()], '2026-02-10').lines[0]; assert.equal(none.penalty487, '0'); assert.equal(none.interest488, '0')
  const r = tva([T()], '2026-10-20'); assert.equal(r.totals.penalty487, '13000'); assert.equal(r.totals.unpaid, '130000')
})

test('TVA : refus (régime à confirmer, déclaration implicite, doublon, exercice, nombre JS, règles)', () => {
  blocked(() => tva([T({ regime: 'to_confirm' as any })]), /régime à confirmer/)
  blocked(() => tva([T({ filed: undefined as any })]), /déclaration déposée/)
  blocked(() => tva([T({ filed: true, declared: null })]), /TVA déclarée à renseigner/)
  blocked(() => tva([T({ filed: false, declared: '1' })]), /incompatible/)
  blocked(() => tva([T(), T()]), /Doublon/); blocked(() => tva([T({ month: '2025-12' })]), /hors de l'exercice/)
  blocked(() => tva([T({ salesHt: 1000 as any })]), /chaîne décimale/); blocked(() => tva([]), /Aucune ligne/)
  blocked(() => computeTva({ openingCredit: '0', lines: [T()] }, { ...TR, legalRef: ' ' }, 2026, null), /Référence juridique/)
  blocked(() => computeTva({ openingCredit: '0', lines: [T()] }, { ...TR, dueDay: 31 }, 2026, null), /1\.\.28/)
  blocked(() => tva([T()], '2026-02-30'), /inexistante/)
  assert.ok(tva([T({ month: '2026-01' }), T({ month: '2026-04' })]).warnings.some(w => /Mois manquant/.test(w)))
})

// ================= AIB / RETENUES =================
const P491 = { rate491: '0.2', rate491Raised: '0.4', raisedAfterFullMonths: 2, min491Monthly: '100000' }
const AR: AibRules = { importRate: '0.01', noIfuRate: '0.05', servicesIfuRate: '0.03', goodsIfuRate: '0.01', dueDay: 10, legalRef: 'TEST Art. TEST', ...P491 }
const A = (o: Partial<AibLine> = {}): AibLine => ({ reference: 'F1', date: '2026-03-15', opType: 'import', hasIfu: true, base: '1000000', reversed: '4000', credit: '1000', provenance: 'real', ...o })
const aib = (l: AibLine[], d: string | null = null) => computeAib(l, AR, 2026, d)

test('AIB : choix du taux selon le type et l\'IFU', () => {
  assert.equal(aib([A()]).lines[0].calculated, '10000')
  assert.equal(aib([A({ reference: 'F2', opType: 'goods_supply', hasIfu: false, base: '200000' })]).lines[0].calculated, '10000')
  assert.equal(aib([A({ reference: 'F3', opType: 'services' })]).lines[0].calculated, '30000')
  assert.equal(aib([A({ reference: 'F4', opType: 'wholesale_goods' })]).lines[0].rateApplied, '0.01')
  const l = aib([A()]).lines[0]; assert.equal(l.netDue, '5000'); assert.equal(l.settled, '5000')
  const e = aib([A({ rate: '0.02' })]).lines[0]; assert.equal(e.rateSource, 'line'); assert.ok(e.warnings.some(w => /Taux saisi/.test(w)))
})

test('AIB : pénalité art. 491, taux majoré après le seuil, minimum mensuel', () => {
  const late = aib([A()], '2026-10-20'); assert.equal(late.lines[0].dueDate, '2026-04-10'); assert.equal(late.lines[0].rate491Applied, '0.4')
  assert.equal(late.lines[0].penalty491, '2000'); assert.equal(late.totals.penalty491, '100000')
  const early = aib([A()], '2026-05-10').lines[0]; assert.equal(early.rate491Applied, '0.2'); assert.equal(early.penalty491, '1000')
  assert.equal(aib([A()], '2026-04-10').lines[0].penalty491, '0')
  const big = aib([A({ reference: 'F1', base: '20000000', reversed: '0', credit: '0' }), A({ reference: 'F2', base: '20000000', reversed: '0', credit: '0' })], '2026-05-10')
  assert.equal(big.by491Month!['2026-03'].lineSum, '80000'); assert.equal(big.by491Month!['2026-03'].applied, '100000')
  const paid = aib([A({ reversed: '10000', credit: '0' })], '2026-10-20'); assert.equal(paid.totals.penalty491, '0') // rien dû => pas de minimum
})

test('AIB : refus (IFU implicite, doublon de pièce, exercice, nombre JS, pièce absente)', () => {
  blocked(() => aib([A({ hasIfu: undefined as any })]), /IFU/); blocked(() => aib([A(), A()]), /doublon/)
  blocked(() => aib([A({ date: '2025-12-31' })]), /hors de l'exercice/); blocked(() => aib([A({ base: 1 as any })]), /chaîne décimale/)
  blocked(() => aib([A({ reference: ' ' })]), /Pièce de référence/); blocked(() => aib([A({ opType: 'x' as any })]), /taux AIB à saisir/)
})

const RR: RetenueRules = { nonResidentNaturalRate: '0.2', nonResidentLegalRate: '0.2', dueDay: 10, legalRef: 'TEST Art. TEST', ...P491 }
const R = (o: Partial<RetenueLine> = {}): RetenueLine => ({ reference: 'Q1', date: '2026-03-15', kind: 'non_resident', payeeType: 'legal', exemptionClaimed: false, base: '1000000', reversed: '50000', provenance: 'real', ...o })

test('Retenues : taux non-résident, dû net, pénalité', () => {
  const r = computeRetenues([R()], RR, 2026, '2026-10-20')
  assert.equal(r.lines[0].calculated, '200000'); assert.equal(r.lines[0].netDue, '150000')
  assert.equal(r.lines[0].penalty491, '60000'); assert.equal(r.totals.penalty491, '100000') // minimum du mois
  assert.equal(computeRetenues([R({ payeeType: 'natural' })], RR, 2026, null).lines[0].calculated, '200000')
})

test('Retenues : aucun taux par défaut en cas de convention/exonération ou de type non couvert', () => {
  blocked(() => computeRetenues([R({ exemptionClaimed: true })], RR, 2026, null), /exonération invoquée/)
  assert.equal(computeRetenues([R({ exemptionClaimed: true, rate: '0' })], RR, 2026, null).lines[0].calculated, '0')
  blocked(() => computeRetenues([R({ kind: 'other', payeeType: null })], RR, 2026, null), /taux de retenue à saisir/)
  blocked(() => computeRetenues([R({ payeeType: null })], RR, 2026, null), /taux de retenue à saisir/)
  blocked(() => computeRetenues([R({ exemptionClaimed: undefined as any })], RR, 2026, null), /exonération \(oui\/non\)/)
})

// ================= RÉSOLVEURS =================
type E = Record<string, unknown>
function fake(params: E[], sources: E[], err: 'params' | 'sources' | null = null): any {
  const mk = (rows: () => E[], e: boolean) => { const b: any = new Proxy({}, { get: (_t, k) => k === 'then' ? (res: any) => res({ data: e ? null : rows(), error: e ? { message: 'x' } : null }) : () => b }); return b }
  return { from: () => ({ select: (c: string) => c.includes('numeric_value') ? mk(() => params, err === 'params') : mk(() => sources, err === 'sources') }) }
}
const SRC = { id: 's1', entry_type: 'legal_source', code: 'TEST-CGI', verification_status: 'validated' }
const row = (code: string, v: string, unit: string, o: E = {}): E => ({ id: 'id-' + code, entry_type: 'parameter', code, numeric_value: v, unit, currency: unit === 'XOF' ? 'XOF' : null,
  source_entry_id: 's1', article_reference: 'Art. TEST', effective_from: '2026-01-01', effective_to: null, verification_status: 'validated', ...o })
const b491 = (): E[] => [row('DGI_491_RATE', '0.2', 'ratio'), row('DGI_491_MIN_MONTHLY', '100000', 'XOF'), row('DGI_491_RAISED_RATE', '0.4', 'ratio'), row('DGI_491_RAISED_AFTER_MONTHS', '2', 'months')]
const tvaRows = (): E[] => [row('VAT_RATE_NORMAL', '0.18', 'ratio'), row('DGI_TVA_DUE_DAY', '10', 'day'), row('DGI_487_RATE', '0.1', 'ratio'), row('DGI_488_RATE_MONTHLY', '0.0025', 'ratio')]
const aibRows = (): E[] => [row('AIB_RATE_IMPORT', '0.01', 'ratio'), row('AIB_RATE_NO_IFU', '0.05', 'ratio'), row('AIB_RATE_SERVICES_IFU', '0.03', 'ratio'), row('AIB_RATE_GOODS_IFU', '0.01', 'ratio'), row('DGI_AIB_DUE_DAY', '10', 'day'), ...b491()]
const retRows = (): E[] => [row('RETENUE_NR_NATURAL_RATE', '0.2', 'ratio'), row('RETENUE_NR_LEGAL_RATE', '0.2', 'ratio'), row('DGI_WITHHOLDING_DUE_DAY', '10', 'day'), ...b491()]

test('résolveurs : lecture complète puis calcul', async () => {
  const t = await resolveValidatedTvaRules(fake(tvaRows(), [SRC]), 2026); assert.ok(t.ok); if (t.ok) assert.equal(computeTva({ openingCredit: '0', lines: [T()] }, t.rules, 2026, null).lines[0].collected, '180000')
  const a = await resolveValidatedAibRules(fake(aibRows(), [SRC]), 2026); assert.ok(a.ok); if (a.ok) { assert.equal(a.rules.raisedAfterFullMonths, 2); assert.equal(a.trace.length, 9) }
  const r = await resolveValidatedRetenuesRules(fake(retRows(), [SRC]), 2026); assert.ok(r.ok); if (r.ok) assert.equal(r.rules.nonResidentLegalRate, '0.2')
})

test('résolveurs : blocages (manquant, non validé, source, doublon, format, couverture, article, erreurs base)', async () => {
  const cases: Array<[string, () => Promise<{ ok: boolean }>]> = [];
  const mkc = (name: string, rows: E[], src: E[] = [SRC], err: any = null) => {
    cases.push([name + ' TVA', () => resolveValidatedTvaRules(fake(rows, src, err), 2026)])
  }
  mkc('absent', tvaRows().filter(x => x.code !== 'VAT_RATE_NORMAL'))
  mkc('non validé', tvaRows().map(x => x.code === 'VAT_RATE_NORMAL' ? { ...x, verification_status: 'to_verify' } : x))
  mkc('source', tvaRows(), [{ ...SRC, verification_status: 'in_review' }])
  mkc('doublon', [...tvaRows(), row('VAT_RATE_NORMAL', '0.2', 'ratio', { id: 'd' })])
  mkc('format', tvaRows().map(x => x.code === 'VAT_RATE_NORMAL' ? { ...x, numeric_value: '18' } : x))
  mkc('jour', tvaRows().map(x => x.code === 'DGI_TVA_DUE_DAY' ? { ...x, numeric_value: '31' } : x))
  mkc('couverture', tvaRows().map(x => x.code === 'VAT_RATE_NORMAL' ? { ...x, effective_to: '2026-06-30' } : x))
  mkc('article', tvaRows().map(x => x.code === 'VAT_RATE_NORMAL' ? { ...x, article_reference: ' ' } : x))
  mkc('erreur params', tvaRows(), [SRC], 'params'); mkc('erreur sources', tvaRows(), [SRC], 'sources')
  for (const [n, f] of cases) assert.equal((await f()).ok, false, n)
  assert.equal((await resolveValidatedAibRules(fake(aibRows().filter(x => x.code !== 'DGI_491_MIN_MONTHLY'), [SRC]), 2026)).ok, false)
  assert.equal((await resolveValidatedAibRules(fake(aibRows().filter(x => x.code !== 'DGI_AIB_DUE_DAY'), [SRC]), 2026)).ok, false)
  assert.equal((await resolveValidatedRetenuesRules(fake(retRows().filter(x => x.code !== 'RETENUE_NR_LEGAL_RATE'), [SRC]), 2026)).ok, false)
  assert.equal((await resolveValidatedRetenuesRules(fake(retRows().map(x => x.code === 'DGI_491_RAISED_AFTER_MONTHS' ? { ...x, unit: 'day' } : x), [SRC]), 2026)).ok, false)
})

// ================= SAISIES =================
const H = (lines: E[], extra: E = {}, mode = 'actual') => ({ source_mode: mode, data: { lines, ...extra } })
const bad = (fn: () => unknown, re: RegExp) => assert.throws(fn, (e: any) => re.test(e.message))
test('saisies : TVA, AIB, retenues — cas valides et refus', () => {
  const tl: E = { month: '2026-01', regime: 'taxable', sales_ht: '1000', deductible_vat: '0', adjustments: '0', filed: false, paid: '0' }
  const t = parseTvaSection(H([tl], { opening_credit: '0' })); assert.equal(t.lines[0].declared, null); assert.equal(t.lines[0].provenance, 'real')
  bad(() => parseTvaSection(H([tl])), /opening_credit/); bad(() => parseTvaSection(H([{ ...tl, filed: undefined }], { opening_credit: '0' })), /filed/)
  bad(() => parseTvaSection(H([{ ...tl, paid: undefined }], { opening_credit: '0' })), /paid/); bad(() => parseTvaSection(H([{ ...tl, sales_ht: 5 }], { opening_credit: '0' })), /sales_ht/)
  bad(() => parseTvaSection(H([], { opening_credit: '0' })), /aucune ligne/); bad(() => parseTvaSection(null), /structure/)
  const al: E = { reference: 'F1', date: '2026-03-15', op_type: 'import', has_ifu: true, base: '1000', reversed: '0', credit: '0' }
  assert.equal(parseAibSection(H([al]))[0].opType, 'import'); bad(() => parseAibSection(H([{ ...al, has_ifu: 'oui' }])), /has_ifu/)
  bad(() => parseAibSection(H([{ ...al, op_type: 'zzz' }])), /op_type/); bad(() => parseAibSection(H([{ ...al, reference: '' }])), /reference/)
  bad(() => parseAibSection(H([al], {}, 'mixed')), /mixed/); bad(() => parseAibSection(H([{ ...al, provenance: 'estimated' }])), /incompatible/)
  const rl: E = { reference: 'Q1', date: '2026-03-15', kind: 'non_resident', payee_type: 'legal', exemption_claimed: false, base: '1000', reversed: '0' }
  assert.equal(parseRetenuesSection(H([rl]))[0].payeeType, 'legal'); bad(() => parseRetenuesSection(H([{ ...rl, exemption_claimed: undefined }])), /exemption_claimed/)
  bad(() => parseRetenuesSection(H([{ ...rl, kind: 'x' }])), /kind/); bad(() => parseRetenuesSection(H([{ ...rl, payee_type: 'z' }])), /payee_type/)
  bad(() => parseAibSection(H(Array.from({ length: 501 }, (_, i) => ({ ...al, reference: 'F' + i })))), /Capacité/)
})
