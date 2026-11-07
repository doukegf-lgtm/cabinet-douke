import { SCALE, ZERO, bmax, fmt } from './decimal'
import { CalcBlockedError } from './penalty-core'

/**
 * Liaison calculs validés -> dettes (feuille Liaison_Dettes du classeur V8) : UNE dette par module et par exercice.
 *   principal = montant dû BRUT du module ; pénalités = pénalités + intérêts calculés ;
 *   crédits   = « déjà réglé selon module » (paiements déjà pris en compte DANS le calcul) ;
 *   paiements du registre = paiements POSTÉRIEURS, saisis à part -> contrôle de double imputation.
 * Seuls des calculs VALIDÉS d'un même dossier sont acceptés ; les montants viennent du résultat enregistré, jamais du navigateur.
 * Une pénalité non calculée (pas de date de calcul) reste NULLE et signalée : elle n'est jamais assimilée à zéro.
 * Aucun arrondi caché : au-delà de 2 décimales, l'adaptateur REFUSE sauf choix explicite « half_up_xof » (décision d'arrondi à valider).
 */
export type CalcKind = 'cnss' | 'its_vps' | 'tva' | 'aib' | 'retenues'
export type Rounding = 'strict' | 'half_up_xof'

export interface StoredCalculation { id: string; kind: CalcKind; fiscalYear: number; validationStatus: string; result: unknown }
export interface AdapterDebt {
  id: string; organism: 'DGI' | 'CNSS'; nature: string; period: string; type: 'fiscal' | 'social'
  principalEstimated: string; penaltyEstimated: string | null; credits: string
}
export interface AdapterResult {
  debts: AdapterDebt[]
  sources: Array<{ debtId: string; calculationId: string; kind: CalcKind }>
  warnings: string[]
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const fail = (m: string): never => { throw new CalcBlockedError([m]) }

function dec(v: unknown, label: string): bigint {
  if (typeof v !== 'string') return fail(label + ' : montant absent du résultat enregistré')
  const m = /^(\d{1,15})(?:\.(\d{1,8}))?$/.exec(v)
  if (!m) return fail(label + ' : montant invalide "' + v + '"')
  return BigInt(m[1]) * SCALE + BigInt((m[2] || '').padEnd(14, '0'))
}
function decOpt(v: unknown, label: string): bigint | null { return v === null || v === undefined ? null : dec(v, label) }
const field = (o: unknown, k: string, label: string): unknown => (isObj(o) ? o[k] : fail(label + ' : structure invalide'))

function conform(a: bigint, label: string, mode: Rounding, warnings: string[]): bigint {
  const frac = a % SCALE
  const centimes = SCALE / BigInt(100)
  if (frac % centimes === ZERO) return a
  if (mode === 'strict') return fail(label + ' : montant à plus de 2 décimales (' + fmt(a) + ') — choisir une règle d\'arrondi XOF explicite (half_up_xof) ou la faire valider.')
  const r = ((a + SCALE / BigInt(2)) / SCALE) * SCALE
  warnings.push(label + ' : arrondi au XOF supérieur à partir de 0,5 (' + fmt(a) + ' -> ' + fmt(r) + ') — règle d\'arrondi à valider.')
  return r
}

interface Parts { gross: bigint; paid: bigint; penalty: bigint | null; penaltyNote: string | null }

function partsFor(kind: CalcKind, res: unknown, label: string): Array<{ key: string; nature: string; organism: 'DGI' | 'CNSS'; type: 'fiscal' | 'social'; parts: Parts }> {
  const t = field(res, 'totals', label)
  if (kind === 'cnss') {
    const due = dec(field(t, 'totalDue', label + ' totalDue'), label + ' total dû'), unpaid = dec(field(t, 'unpaid', label), label + ' impayé')
    return [{ key: 'CNSS', nature: 'Cotisations CNSS employeur + salarié (+ majorations)', organism: 'CNSS', type: 'social',
      parts: { gross: due, paid: due - unpaid, penalty: dec(field(t, 'penalty', label), label + ' pénalité'), penaltyNote: null } }]
  }
  if (kind === 'its_vps') {
    const its = dec(field(t, 'itsDue', label), label + ' ITS dû'), itsNet = dec(field(t, 'itsDueNet', label), label + ' ITS net')
    const vps = dec(field(t, 'vpsDue', label), label + ' VPS dû'), vpsNet = dec(field(t, 'vpsDueNet', label), label + ' VPS net')
    const pen = isObj(res) ? res['penalties'] : undefined
    let pIts: bigint | null = null, pVps: bigint | null = null
    if (pen !== undefined && pen !== null) {
      const pt = field(pen, 'totals', label + ' pénalités')
      pIts = dec(field(pt, 'penalty491', label), label + ' art. 491') + dec(field(pt, 'penalty487Its', label), label + ' art. 487 ITS') + dec(field(pt, 'interest488Its', label), label + ' art. 488 ITS')
      pVps = dec(field(pt, 'penalty487Vps', label), label + ' art. 487 VPS') + dec(field(pt, 'interest488Vps', label), label + ' art. 488 VPS')
    }
    const note = pIts === null ? 'pénalités non calculées (date de calcul absente)' : null
    return [
      { key: 'ITS', nature: 'ITS + ORTB (retenues sur salaires)', organism: 'DGI', type: 'fiscal', parts: { gross: its, paid: its - itsNet, penalty: pIts, penaltyNote: note } },
      { key: 'VPS', nature: 'Versement patronal sur salaires', organism: 'DGI', type: 'fiscal', parts: { gross: vps, paid: vps - vpsNet, penalty: pVps, penaltyNote: note } },
    ]
  }
  if (kind === 'tva') {
    const ret = dec(field(t, 'retained', label), label + ' dû retenu'), unp = dec(field(t, 'unpaid', label), label + ' impayé')
    const p487 = decOpt(field(t, 'penalty487', label), label + ' art. 487'), i488 = decOpt(field(t, 'interest488', label), label + ' art. 488')
    const pen = p487 === null || i488 === null ? null : p487 + i488
    return [{ key: 'TVA', nature: 'TVA (dû retenu = max(calculé, déclaré))', organism: 'DGI', type: 'fiscal',
      parts: { gross: ret, paid: ret - unp, penalty: pen, penaltyNote: pen === null ? 'pénalités non calculées (date de calcul absente)' : null } }]
  }
  const calc = dec(field(t, 'calculated', label), label + ' montant calculé'), net = dec(field(t, 'netDue', label), label + ' dû net')
  const p491 = decOpt(field(t, 'penalty491', label), label + ' art. 491')
  return [{ key: kind === 'aib' ? 'AIB' : 'RET', nature: kind === 'aib' ? 'AIB à reverser' : 'Retenues à reverser (non-résidents, autres) hors AIB', organism: 'DGI', type: 'fiscal',
    parts: { gross: calc, paid: calc - net, penalty: p491, penaltyNote: p491 === null ? 'pénalités non calculées (date de calcul absente)' : null } }]
}

export function debtsFromCalculations(calcs: StoredCalculation[], rounding: Rounding): AdapterResult {
  if (rounding !== 'strict' && rounding !== 'half_up_xof') throw new CalcBlockedError(['Règle d\'arrondi à choisir explicitement (strict ou half_up_xof).'])
  if (!Array.isArray(calcs) || calcs.length === 0) throw new CalcBlockedError(['Aucun calcul fourni.'])
  const seen: Record<string, true> = {}
  const debts: AdapterDebt[] = [], sources: AdapterResult['sources'] = [], warnings: string[] = []
  for (const c of calcs) {
    const label = 'calcul ' + c.id + ' (' + c.kind + ' ' + c.fiscalYear + ')'
    if (c.validationStatus !== 'validated') throw new CalcBlockedError([label + ' : seuls les calculs VALIDÉS peuvent alimenter les dettes (statut ' + c.validationStatus + ').'])
    if (['cnss', 'its_vps', 'tva', 'aib', 'retenues'].indexOf(c.kind) < 0) throw new CalcBlockedError([label + ' : type de calcul inconnu.'])
    if (!Number.isInteger(c.fiscalYear) || c.fiscalYear < 2000 || c.fiscalYear > 2100) throw new CalcBlockedError([label + ' : exercice invalide.'])
    const k = c.kind + ':' + c.fiscalYear
    if (seen[k]) throw new CalcBlockedError(['Deux calculs validés pour ' + c.kind + ' ' + c.fiscalYear + ' : en retenir un seul pour éviter tout double comptage.'])
    seen[k] = true
    for (const p of partsFor(c.kind, c.result, label)) {
      const id = 'AUTO-' + p.key + '-' + c.fiscalYear
      const gross = conform(p.parts.gross, id + ' principal', rounding, warnings)
      const paid = conform(p.parts.paid, id + ' déjà réglé', rounding, warnings)
      const pen = p.parts.penalty === null ? null : conform(p.parts.penalty, id + ' pénalités', rounding, warnings)
      if (p.parts.penaltyNote) warnings.push(id + ' : ' + p.parts.penaltyNote + '.')
      const credits = paid > gross ? gross : paid
      if (gross + (pen === null ? ZERO : pen) <= ZERO) { warnings.push(id + ' : rien à porter (montant nul).'); continue }
      debts.push({ id, organism: p.organism, nature: p.nature, period: String(c.fiscalYear), type: p.type, principalEstimated: fmt(bmax(ZERO, gross)), penaltyEstimated: pen === null ? null : fmt(pen), credits: fmt(credits) })
      sources.push({ debtId: id, calculationId: c.id, kind: c.kind })
    }
  }
  if (debts.length === 0) warnings.push('Aucune dette à porter : tous les calculs retenus sont nuls.')
  return { debts, sources, warnings }
}

/** Contrôle du classeur « VÉRIFIER DOUBLE IMPUTATION » : un règlement déjà pris en compte dans le calcul ET des paiements du registre sur la même dette. */
export function doubleImputationWarnings(debts: AdapterDebt[], payments: Array<{ debtId: string; amount: string }>): string[] {
  const paid: Record<string, bigint> = {}
  payments.forEach(p => { paid[p.debtId] = (paid[p.debtId] || ZERO) + dec(p.amount, 'paiement ' + p.debtId) })
  return debts.filter(d => dec(d.credits, 'crédits ' + d.id) > ZERO && (paid[d.id] || ZERO) > ZERO)
    .map(d => d.id + ' : VÉRIFIER DOUBLE IMPUTATION — des règlements sont déjà pris en compte dans le calcul (' + d.credits + ' XOF) et des paiements du registre existent aussi ; s\'agit-il des mêmes versements ?')
}
