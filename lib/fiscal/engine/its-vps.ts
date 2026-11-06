import { DecimalError, ZERO, bmax, bmin, fmt, mulRate, parseMoney, parseRate } from './decimal'

/**
 * Moteur ITS + VPS (feuille ITS_VPS du classeur V8), arithmétique exacte.
 * Le barème, les montants ORTB et le taux VPS viennent EXCLUSIVEMENT de règles validées (its-rules.ts).
 * Aucun paiement manquant n'est remplacé par zéro : les soldes qui en dépendent restent null et le
 * résultat est marqué `complete: false`.
 */
export type Provenance = 'real' | 'estimated' | 'flat_split'
export const MAX_ITS_LINES = 6000

export interface ItsRules {
  fiscalYear: number
  brackets: Array<{ from: string; rate: string }>   // from croissant, la première = 0
  ortbMarch: string
  ortbJune: string
  ortbJuneMinBase: string                           // montant de juin si base > cette valeur
  vpsRate: string
  legalRef: string
}

export interface ItsVpsLine {
  employeeId: string
  month: string                                     // YYYY-MM
  itsBase: string                                   // base imposable ITS validée
  vpsBaseOverride?: string | null                   // base VPS distincte, sinon = itsBase
  vpsExempt: boolean                                // explicite : jamais déduit d'une absence
  itsWithheld?: string | null
  itsPaid?: string | null
  vpsDeclared?: string | null
  vpsPaid?: string | null
  provenance: Provenance
}

export interface ItsVpsLineResult {
  employeeId: string; month: string; provenance: Provenance
  itsBase: string; bracketTax: string; ortb: string; itsDue: string
  vpsBase: string; vpsExempt: boolean; vpsDue: string
  itsWithheld: string | null; itsGap: string | null
  itsPaid: string | null; itsDueNet: string | null; withheldNotPaid: string | null
  vpsDeclared: string | null; vpsGap: string | null
  vpsPaid: string | null; vpsDueNet: string | null
  warnings: string[]
}

export interface ItsVpsResult {
  provisional: false
  fiscalYear: number
  lines: ItsVpsLineResult[]
  byMonth: Record<string, { itsDue: string; vpsDue: string }>
  totals: { itsDue: string; vpsDue: string; itsDueNet: string; vpsDueNet: string; withheldNotPaid: string; itsGap: string; vpsGap: string }
  unknown: { itsWithheld: number; itsPaid: number; vpsDeclared: number; vpsPaid: number }
  complete: boolean
  warnings: string[]
}

export class ItsVpsBlockedError extends Error {
  public readonly reasons: string[]
  constructor(reasons: string[]) {
    super('ITS_VPS_BLOCKED: ' + reasons.join(' | '))
    this.reasons = reasons
    Object.setPrototypeOf(this, ItsVpsBlockedError.prototype)
  }
}

const opt = (v: unknown, label: string): bigint | null => (v === undefined || v === null ? null : parseMoney(v, label))

export function computeItsVps(lines: ItsVpsLine[], rules: ItsRules): ItsVpsResult {
  try { return run(lines, rules) } catch (e) {
    if (e instanceof DecimalError) throw new ItsVpsBlockedError([e.message])
    throw e
  }
}

function run(lines: ItsVpsLine[], rules: ItsRules): ItsVpsResult {
  if (!Array.isArray(lines) || lines.length === 0) throw new ItsVpsBlockedError(['Aucune ligne ITS/VPS.'])
  if (lines.length > MAX_ITS_LINES) throw new ItsVpsBlockedError(['Capacité dépassée : ' + MAX_ITS_LINES + ' lignes maximum.'])
  if (!rules || !Array.isArray(rules.brackets) || rules.brackets.length === 0) throw new ItsVpsBlockedError(['Barème ITS absent.'])

  const froms = rules.brackets.map((b, i) => parseMoney(b.from, 'tranche ' + (i + 1) + ' borne'))
  const rates = rules.brackets.map((b, i) => parseRate(b.rate, 'tranche ' + (i + 1) + ' taux'))
  if (froms[0] !== ZERO) throw new ItsVpsBlockedError(['La première tranche doit commencer à 0.'])
  for (let i = 1; i < froms.length; i++) if (froms[i] <= froms[i - 1]) throw new ItsVpsBlockedError(['Bornes de tranches non strictement croissantes.'])
  const ortbMarch = parseMoney(rules.ortbMarch, 'ORTB mars')
  const ortbJune = parseMoney(rules.ortbJune, 'ORTB juin')
  const ortbJuneMin = parseMoney(rules.ortbJuneMinBase, 'ORTB juin base minimale')
  const vpsRate = parseRate(rules.vpsRate, 'taux VPS')
  if (!rules.legalRef || !rules.legalRef.trim()) throw new ItsVpsBlockedError(['Référence juridique des règles absente.'])

  const seen: Record<string, true> = {}
  const out: ItsVpsLineResult[] = []
  const byMonth: Record<string, { itsDue: bigint; vpsDue: bigint }> = {}
  let tItsDue = ZERO, tVpsDue = ZERO, tItsNet = ZERO, tVpsNet = ZERO, tWnp = ZERO, tItsGap = ZERO, tVpsGap = ZERO
  const unknown = { itsWithheld: 0, itsPaid: 0, vpsDeclared: 0, vpsPaid: 0 }

  for (const l of lines) {
    const id = l.employeeId + '/' + l.month
    if (typeof l.employeeId !== 'string' || !l.employeeId.trim()) throw new ItsVpsBlockedError(['Salarié invalide (' + id + ').'])
    const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(l.month || '')
    if (!m) throw new ItsVpsBlockedError([id + ' : mois invalide.'])
    if (parseInt(m[1], 10) !== rules.fiscalYear) throw new ItsVpsBlockedError([id + " : mois hors de l'exercice " + rules.fiscalYear + '.'])
    if (seen[id]) throw new ItsVpsBlockedError(['Doublon salarié/mois ' + id + '.'])
    seen[id] = true
    if (typeof l.vpsExempt !== 'boolean') throw new ItsVpsBlockedError([id + " : vpsExempt (oui/non) doit être renseigné explicitement."])
    const warnings: string[] = []
    if (l.provenance !== 'real') warnings.push('Donnée ' + (l.provenance === 'estimated' ? 'ESTIMÉE' : 'en RÉPARTITION FORFAITAIRE'))

    const base = parseMoney(l.itsBase, id + ' base ITS')
    let tax = ZERO
    for (let i = 0; i < froms.length; i++) {
      if (base > froms[i]) {
        const top = i + 1 < froms.length ? bmin(base, froms[i + 1]) : base
        tax += mulRate(top - froms[i], rates[i], id + ' tranche ' + (i + 1))
      }
    }
    const month = parseInt(m[2], 10)
    const ortb = month === 3 ? ortbMarch : (month === 6 && base > ortbJuneMin ? ortbJune : ZERO)
    const itsDue = tax + ortb

    const vpsBaseOpt = opt(l.vpsBaseOverride, id + ' base VPS')
    const vpsBase = vpsBaseOpt === null ? base : vpsBaseOpt
    const vpsDue = l.vpsExempt ? ZERO : mulRate(vpsBase, vpsRate, id + ' VPS')

    const withheld = opt(l.itsWithheld, id + ' ITS retenu')
    const paid = opt(l.itsPaid, id + ' ITS reversé')
    const vDecl = opt(l.vpsDeclared, id + ' VPS déclaré')
    const vPaid = opt(l.vpsPaid, id + ' VPS payé')
    if (withheld === null) unknown.itsWithheld++
    if (paid === null) unknown.itsPaid++
    if (vDecl === null) unknown.vpsDeclared++
    if (vPaid === null) unknown.vpsPaid++

    const itsGap = withheld === null ? null : itsDue - withheld
    const itsNet = paid === null ? null : bmax(ZERO, itsDue - paid)
    const wnp = withheld === null || paid === null ? null : bmax(ZERO, withheld - paid)
    const vGap = vDecl === null ? null : vpsDue - vDecl
    const vNet = vPaid === null ? null : bmax(ZERO, vpsDue - vPaid)
    if (paid === null) warnings.push('ITS reversé non renseigné : solde ITS non calculé (pas de zéro implicite)')
    if (vPaid === null) warnings.push('VPS payé non renseigné : solde VPS non calculé (pas de zéro implicite)')
    if (paid !== null && paid > itsDue) warnings.push('ITS reversé supérieur à l\'ITS dû : crédit éventuel non traité ici')

    out.push({
      employeeId: l.employeeId, month: l.month, provenance: l.provenance,
      itsBase: fmt(base), bracketTax: fmt(tax), ortb: fmt(ortb), itsDue: fmt(itsDue),
      vpsBase: fmt(vpsBase), vpsExempt: l.vpsExempt, vpsDue: fmt(vpsDue),
      itsWithheld: withheld === null ? null : fmt(withheld), itsGap: itsGap === null ? null : fmt(itsGap),
      itsPaid: paid === null ? null : fmt(paid), itsDueNet: itsNet === null ? null : fmt(itsNet),
      withheldNotPaid: wnp === null ? null : fmt(wnp),
      vpsDeclared: vDecl === null ? null : fmt(vDecl), vpsGap: vGap === null ? null : fmt(vGap),
      vpsPaid: vPaid === null ? null : fmt(vPaid), vpsDueNet: vNet === null ? null : fmt(vNet),
      warnings,
    })
    tItsDue += itsDue; tVpsDue += vpsDue
    if (itsNet !== null) tItsNet += itsNet
    if (vNet !== null) tVpsNet += vNet
    if (wnp !== null) tWnp += wnp
    if (itsGap !== null) tItsGap += itsGap
    if (vGap !== null) tVpsGap += vGap
    const bm = byMonth[l.month] || { itsDue: ZERO, vpsDue: ZERO }
    byMonth[l.month] = { itsDue: bm.itsDue + itsDue, vpsDue: bm.vpsDue + vpsDue }
  }

  const complete = unknown.itsPaid === 0 && unknown.vpsPaid === 0 && unknown.itsWithheld === 0 && unknown.vpsDeclared === 0
  const bm: Record<string, { itsDue: string; vpsDue: string }> = {}
  Object.keys(byMonth).sort().forEach(k => { bm[k] = { itsDue: fmt(byMonth[k].itsDue), vpsDue: fmt(byMonth[k].vpsDue) } })
  return {
    provisional: false, fiscalYear: rules.fiscalYear, lines: out, byMonth: bm,
    totals: { itsDue: fmt(tItsDue), vpsDue: fmt(tVpsDue), itsDueNet: fmt(tItsNet), vpsDueNet: fmt(tVpsNet), withheldNotPaid: fmt(tWnp), itsGap: fmt(tItsGap), vpsGap: fmt(tVpsGap) },
    unknown, complete,
    warnings: complete ? [] : ['RÉSULTAT INCOMPLET : des retenues, reversements, déclarations ou paiements ne sont pas renseignés ; les soldes concernés ne couvrent que les lignes renseignées.'],
  }
}
