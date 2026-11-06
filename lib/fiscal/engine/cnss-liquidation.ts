/**
 * Moteur de liquidation CNSS — reconstitution de la logique du classeur V8
 * (feuille Paie_CNSS, colonnes H..AF ; Parametres B5..B9, B20..B29).
 *
 * Principes :
 *  - arithmétique BigInt exacte, échelle 1e-14 ; montants <= 2 décimales, taux <= 6 décimales ;
 *    toute division inexacte lève une erreur (aucun arrondi caché).
 *  - AUCUN taux, plafond, périodicité ou jour limite par défaut : tout vient de règles
 *    portant statut + référence juridique + période de validité.
 *  - mode 'validated' : refuse si une règle n'est pas 'validated'.
 *    mode 'provisional' : calcule mais marque le résultat provisoire (jamais validable).
 */

export type RuleStatus = 'to_verify' | 'in_review' | 'validated' | 'replaced' | 'repealed';
export type Mode = 'validated' | 'provisional';
export type Payer = 'employer' | 'employee';
export type Provenance = 'real' | 'estimated' | 'flat_split';

export type Ceiling =
  | { kind: 'none' }                       // absence de plafond VALIDÉE
  | { kind: 'monthly'; amount: string }    // plafond mensuel d'assiette
  | { kind: 'unknown' };                   // non vérifié (cas actuel du classeur)

export interface ContributionRule {
  code: string;               // ex. 'CNSS_PF'
  payer: Payer;
  rate: string | null;        // décimal string, ex. '0.09' ; null = à notifier (RP)
  ceiling: Ceiling;
  status: RuleStatus;
  legalRef: string;
  validFrom: string;          // YYYY-MM
  validTo: string | null;     // YYYY-MM inclus, null = ouvert
}

export interface ProcedureRule {
  periodicity: 'monthly' | 'quarterly' | 'by_headcount';
  headcountThreshold?: number;
  dueDay: number;                         // 1..28
  lateCounting: 'date_to_date' | 'calendar_months';
  latePenaltyRate: string;                // par mois ou fraction
  status: RuleStatus;
  legalRef: string;
}

export interface PayrollLine {
  employeeId: string;
  period: string;                         // YYYY-MM
  gross: string | null;
  bonuses: string | null;
  benefits: string | null;
  otherTaxable: string | null;
  baseOverride?: string;                  // assiette validée par le cabinet (remplace la somme)
  rpRate?: string;                        // taux RP propre à la ligne
  dueDate?: string;                       // YYYY-MM-DD, sinon calculée
  payment: 'yes' | 'no' | 'partial';
  paymentDate?: string;
  amountPaid?: string;                    // si partial
  paymentVerified?: boolean;
  manualLateMonths?: number;
  provenance: Provenance;
}

export interface Params {
  mode: Mode;
  calcDate: string;                       // YYYY-MM-DD (jamais "aujourd'hui" implicite)
  headcount?: number;
  rpRateDefault?: string | null;          // taux notifié CNSS
  paymentRecognition: 'verified_only' | 'all';
  contributionRules: ContributionRule[];
  procedure: ProcedureRule;
}

export interface LineResult {
  employeeId: string; period: string; provenance: Provenance;
  baseCommon: string;
  components: Record<string, { payer: Payer; base: string; amount: string; ceilingApplied: boolean }>;
  employerTotal: string; employeeShare: string; totalDue: string;
  paidRecognized: string; unpaid: string;
  dueDateUsed: string; lateMonths: number | null; penalty: string;
  warnings: string[];
}

export interface CnssResult {
  provisional: boolean;
  lines: LineResult[];
  byPeriod: Record<string, { totalDue: string; unpaid: string; penalty: string }>;
  totals: { employer: string; employee: string; totalDue: string; unpaid: string; penalty: string; principalPlusPenalty: string };
  warnings: string[];
}

export class CnssBlockedError extends Error {
  constructor(public readonly reasons: string[]) { super('CNSS_BLOCKED: ' + reasons.join(' | ')); }
}

// ---------- exact decimal helpers ----------
const S = 100_000_000_000_000n;      // 1e14
const RS = 1_000_000n;               // 1e6
function parseScaled(v: unknown, maxDec: number, label: string): bigint {
  if (typeof v !== 'string') throw new CnssBlockedError([`${label}: chaîne décimale exigée (nombre JS refusé)`]);
  const m = /^(\d+)(?:\.(\d+))?$/.exec(v);
  if (!m || (m[2] ?? '').length > maxDec) throw new CnssBlockedError([`${label}: valeur décimale invalide "${v}"`]);
  const frac = (m[2] ?? '').padEnd(14, '0');
  return BigInt(m[1]) * S + BigInt(frac);
}
const money = (v: unknown, l: string) => parseScaled(v, 2, l);
function rateInt(v: unknown, l: string): bigint {
  if (typeof v !== 'string') throw new CnssBlockedError([`${l}: chaîne décimale exigée`]);
  const m = /^(\d+)(?:\.(\d{1,6}))?$/.exec(v);
  if (!m) throw new CnssBlockedError([`${l}: taux invalide "${v}"`]);
  return BigInt(m[1]) * RS + BigInt((m[2] ?? '').padEnd(6, '0'));
}
function mulRate(a: bigint, r: bigint, l: string): bigint {
  const p = a * r;
  if (p % RS !== 0n) throw new CnssBlockedError([`${l}: division inexacte (arrondi non défini)`]);
  return p / RS;
}
export function fmt(a: bigint): string {
  const neg = a < 0n; const x = neg ? -a : a;
  const i = x / S; let f = (x % S).toString().padStart(14, '0').replace(/0+$/, '');
  return (neg ? '-' : '') + i.toString() + (f ? '.' + f : '');
}

// ---------- dates (UTC, sans fuseau) ----------
interface YMD { y: number; m: number; d: number }
function parseDate(s: string, l: string): YMD {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
  if (!m) throw new CnssBlockedError([`${l}: date invalide "${s}"`]);
  const r = { y: +m[1], m: +m[2], d: +m[3] };
  const t = new Date(Date.UTC(r.y, r.m - 1, r.d));
  if (t.getUTCFullYear() !== r.y || t.getUTCMonth() !== r.m - 1 || t.getUTCDate() !== r.d)
    throw new CnssBlockedError([`${l}: date inexistante "${s}"`]);
  return r;
}
const cmp = (a: YMD, b: YMD) => (a.y - b.y) || (a.m - b.m) || (a.d - b.d);
const iso = (a: YMD) => `${a.y}-${String(a.m).padStart(2, '0')}-${String(a.d).padStart(2, '0')}`;
function parsePeriod(p: string, l: string) {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(p ?? '');
  if (!m) throw new CnssBlockedError([`${l}: période invalide "${p}"`]);
  return { y: +m[1], m: +m[2] };
}

/** AE : échéance auto = jour limite du mois suivant (mensuel) ou du mois suivant le trimestre. */
export function computeDueDate(period: string, per: 'monthly' | 'quarterly', day: number): string {
  const { y, m } = parsePeriod(period, 'période');
  let nm = per === 'quarterly' ? 3 * Math.floor((m + 2) / 3) + 1 : m + 1;
  let ny = y; while (nm > 12) { nm -= 12; ny += 1; }
  return iso({ y: ny, m: nm, d: day });
}

/** Z : retard en mois ou fraction (deux modes du classeur, Parametres!B29). */
export function lateMonths(due: YMD, ref: YMD, mode: 'date_to_date' | 'calendar_months'): number {
  const diff = (ref.y - due.y) * 12 + (ref.m - due.m);
  if (mode === 'calendar_months') return cmp(ref, due) > 0 ? diff + 1 : 0;
  return Math.max(0, diff + (ref.d > due.d ? 1 : 0));
}

// ---------- validation des règles ----------
function inRange(p: string, r: ContributionRule) { return p >= r.validFrom && (r.validTo === null || p <= r.validTo); }

function checkRules(params: Params, periods: string[]): string[] {
  const errs: string[] = [];
  const strict = params.mode === 'validated';
  const proc = params.procedure;
  if (strict && proc.status !== 'validated') errs.push(`Procédure CNSS (périodicité/jour limite/mode de retard) non validée (statut ${proc.status})`);
  if (!proc.legalRef?.trim()) errs.push('Procédure CNSS sans référence juridique');
  if (!Number.isInteger(proc.dueDay) || proc.dueDay < 1 || proc.dueDay > 28) errs.push('Jour limite hors 1..28');
  if (proc.periodicity === 'by_headcount' && (params.headcount === undefined || proc.headcountThreshold === undefined))
    errs.push('Périodicité selon effectif : effectif et seuil requis');
  for (const p of periods) {
    const by: Record<string, ContributionRule[]> = {};
    for (const r of params.contributionRules) if (inRange(p, r)) (by[r.code] ??= []).push(r);
    for (const [code, rs] of Object.entries(by)) if (rs.length > 1) errs.push(`Règles ${code} qui se chevauchent en ${p}`);
    if (!Object.keys(by).length) errs.push(`Aucune règle de cotisation applicable en ${p}`);
    for (const rs of Object.values(by)) {
      const r = rs[0];
      if (!r.legalRef?.trim()) errs.push(`${r.code}: référence juridique absente`);
      if (r.status === 'replaced' || r.status === 'repealed') errs.push(`${r.code}: règle ${r.status} en ${p}`);
      if (strict && r.status !== 'validated') errs.push(`${r.code}: règle non validée (${r.status}) en ${p}`);
      if (strict && r.ceiling.kind === 'unknown') errs.push(`${r.code}: plafond d'assiette non vérifié en ${p}`);
    }
  }
  return [...new Set(errs)];
}

// ---------- calcul ----------
export function computeCnss(lines: PayrollLine[], params: Params): CnssResult {
  const errs: string[] = [];
  const calc = parseDate(params.calcDate, 'calcDate');
  const seen = new Set<string>();
  for (const l of lines) {
    const k = `${l.employeeId}|${l.period}`;
    if (seen.has(k)) errs.push(`Doublon salarié/période ${k}`);
    seen.add(k);
  }
  errs.push(...checkRules(params, [...new Set(lines.map(l => l.period))]));
  if (errs.length) throw new CnssBlockedError(errs);

  const proc = params.procedure;
  const per: 'monthly' | 'quarterly' = proc.periodicity === 'by_headcount'
    ? ((params.headcount as number) >= (proc.headcountThreshold as number) ? 'monthly' : 'quarterly') : proc.periodicity;
  const penRate = rateInt(proc.latePenaltyRate, 'latePenaltyRate');
  const out: LineResult[] = [];
  const runWarn: string[] = [];
  const byPeriod: CnssResult['byPeriod'] = {};
  let tE = 0n, tS = 0n, tU = 0n, tP = 0n;

  for (const l of lines) {
    const w: string[] = [];
    const id = `${l.employeeId}/${l.period}`;
    parsePeriod(l.period, id);
    const parts = [l.gross, l.bonuses, l.benefits, l.otherTaxable];
    let base: bigint;
    if (l.baseOverride !== undefined) base = money(l.baseOverride, `${id} baseOverride`);
    else {
      if (parts.every(x => x === null)) throw new CnssBlockedError([`${id}: aucun élément de rémunération (aucun zéro implicite)`]);
      if (l.gross === null) throw new CnssBlockedError([`${id}: salaire brut manquant`]);
      base = parts.reduce<bigint>((a, x, i) => a + (x === null ? 0n : money(x, `${id} champ ${i}`)), 0n);
    }
    if (l.provenance !== 'real') w.push(`Donnée ${l.provenance === 'estimated' ? 'ESTIMÉE' : 'en RÉPARTITION FORFAITAIRE'}`);

    const comps: LineResult['components'] = {};
    let emp = 0n, sal = 0n;
    for (const r of params.contributionRules.filter(x => inRange(l.period, x))) {
      let rate = r.rate;
      if (r.code.includes('RP') || rate === null) {
        // ordre du classeur : ligne (J) > notifié CNSS (B20) ; sinon BLOQUANT (le classeur ne faisait que signaler)
        rate = l.rpRate ?? params.rpRateDefault ?? r.rate;
        if (rate === null || rate === undefined) throw new CnssBlockedError([`${id}: taux ${r.code} (risques professionnels) manquant — cotisation non calculable`]);
      }
      let b = base, capped = false;
      if (r.ceiling.kind === 'monthly') {
        const c = money(r.ceiling.amount, `${r.code} plafond`);
        if (b > c) { b = c; capped = true; }
      } else if (r.ceiling.kind === 'unknown') w.push(`${r.code}: plafond non vérifié (aucun plafond appliqué — PROVISOIRE)`);
      const amt = mulRate(b, rateInt(rate, `${r.code} taux`), `${id} ${r.code}`);
      comps[r.code] = { payer: r.payer, base: fmt(b), amount: fmt(amt), ceilingApplied: capped };
      if (r.payer === 'employer') emp += amt; else sal += amt;
    }
    const due = emp + sal;

    // paiement reconnu (Parametres!B24)
    let paid = 0n;
    const recognized = params.paymentRecognition === 'all' || l.paymentVerified === true;
    if (l.payment === 'yes') { if (recognized) paid = due; else w.push('Paiement non vérifié : non reconnu'); }
    else if (l.payment === 'partial') {
      if (l.amountPaid === undefined) throw new CnssBlockedError([`${id}: paiement partiel sans montant`]);
      if (recognized) paid = money(l.amountPaid, `${id} amountPaid`); else w.push('Paiement partiel non vérifié : non reconnu');
      if (paid > due) { w.push('Montant payé > dû : plafonné au dû'); paid = due; }
    }
    const fullyPaid = paid === due && l.payment === 'yes' && recognized;
    const unpaid = fullyPaid ? 0n : due - paid;

    // échéance et retard
    const dueStr = l.dueDate ?? computeDueDate(l.period, per, proc.dueDay);
    const dueD = parseDate(dueStr, `${id} échéance`);
    let late: number | null;
    if (l.manualLateMonths !== undefined) late = Math.max(0, l.manualLateMonths);
    else if (fullyPaid && !l.paymentDate) { late = null; w.push('Payé sans date de paiement : retard indéterminé, pénalité NON calculée'); }
    else late = lateMonths(dueD, l.paymentDate ? parseDate(l.paymentDate, `${id} paiement`) : calc, proc.lateCounting);
    // base de pénalité du classeur (U) : payé => cotisation totale ; sinon => reste dû
    const penBase = fullyPaid ? due : unpaid;
    const pen = late === null ? 0n : mulRate(penBase * BigInt(late), penRate, `${id} pénalité`);
    if (l.payment === 'partial') w.push('Paiement partiel : retard du versement partiel non modélisé (limite du classeur)');

    out.push({ employeeId: l.employeeId, period: l.period, provenance: l.provenance, baseCommon: fmt(base), components: comps,
      employerTotal: fmt(emp), employeeShare: fmt(sal), totalDue: fmt(due), paidRecognized: fmt(paid), unpaid: fmt(unpaid),
      dueDateUsed: dueStr, lateMonths: late, penalty: fmt(pen), warnings: w });
    tE += emp; tS += sal; tU += unpaid; tP += pen;
    const bp = byPeriod[l.period] ??= { totalDue: '0', unpaid: '0', penalty: '0' };
    byPeriod[l.period] = { totalDue: fmt(BigInt(0) + parseScaled(bp.totalDue, 14, 'x') + due), unpaid: fmt(parseScaled(bp.unpaid, 14, 'x') + unpaid), penalty: fmt(parseScaled(bp.penalty, 14, 'x') + pen) };
  }
  const provisional = params.mode === 'provisional';
  if (provisional) runWarn.push('RÉSULTAT PROVISOIRE : règles non toutes validées — ne pas valider ni présenter comme définitif');
  return { provisional, lines: out, byPeriod,
    totals: { employer: fmt(tE), employee: fmt(tS), totalDue: fmt(tE + tS), unpaid: fmt(tU), penalty: fmt(tP), principalPlusPenalty: fmt(tU + tP) },
    warnings: runWarn };
}

/** R14 du classeur : taux RP inconnu => deux calculs (bas/haut) et une fourchette. */
export function computeCnssRange(lines: PayrollLine[], params: Params, lowRp: string, highRp: string) {
  const mk = (rp: string) => computeCnss(lines, { ...params, rpRateDefault: rp, mode: 'provisional' });
  return { low: mk(lowRp), high: mk(highRp), note: 'Fourchette provisoire : taux RP à obtenir de la notification CNSS' };
}
