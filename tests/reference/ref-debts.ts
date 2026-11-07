// RÉFÉRENCE INDÉPENDANTE (tests uniquement) — ne pas importer depuis le code applicatif. Sert au test différentiel contre les moteurs du dépôt.
import { DecimalError, ZERO, bmax, fmt } from '../../lib/fiscal/engine/decimal'
import { parseAmount } from './ref-core'
import { CalcBlockedError } from './ref-core'

/**
 * Consolidation des dettes DGI / CNSS (feuille Dettes du classeur V8), exacte.
 *  principal retenu = confirmé s'il existe, sinon estimé ; idem pour la pénalité ; intérêts/frais = confirmés seulement
 *  solde estimatif O = max(0, principal + pénalité + intérêts - paiements imputés - crédits)
 *  paiements : ceux marqués « pénalité »/« intérêts » vont aux pénalités, les autres au principal ; l'excédent d'une
 *  composante déborde sur l'autre (soldes Y principal / Z pénalités du classeur)
 *  paiement reconnu seulement s'il est vérifié (ou si le mode « tous » est choisi explicitement)
 * Aucun solde n'est inventé : une dette sans aucun montant est refusée ; les crédits doivent être explicites.
 */
export const MAX_DEBTS = 1000
export const MAX_PAYMENTS = 1000
export type DebtType = 'fiscal' | 'social' | 'other'

export interface DebtInput {
  id: string; organism: string; nature: string; period: string; type: DebtType
  principalConfirmed?: string | null; principalEstimated?: string | null
  penaltyConfirmed?: string | null; penaltyEstimated?: string | null
  interestConfirmed?: string | null
  credits: string
}
export interface PaymentInput {
  id: string; debtId: string; date: string; component: 'principal' | 'penalty' | 'interest'
  amount: string; verified: boolean; receiptRef?: string | null
}
export interface DebtResult {
  id: string; organism: string; nature: string; period: string; type: DebtType
  principalBasis: 'confirmed' | 'estimated' | 'none'; penaltyBasis: 'confirmed' | 'estimated' | 'none'
  principal: string; penalty: string; interest: string
  paidPrincipal: string; paidPenalty: string; credits: string
  confirmedTotal: string | null; confirmedBalance: string | null
  estimatedBalance: string; principalBalance: string; penaltyBalance: string
  proof: 'CONFIRMÉ' | 'PARTIELLEMENT CONFIRMÉ' | 'ESTIMATIF'
}
export interface DebtsResult {
  provisional: false
  debts: DebtResult[]
  totals: { principal: string; penalty: string; paid: string; estimatedBalance: string; confirmedBalance: string; principalBalance: string; penaltyBalance: string }
  byType: Record<string, string>
  byOrganism: Record<string, string>
  excludedPayments: { count: number; amount: string }
  warnings: string[]
}

const opt = (v: unknown, l: string): bigint | null => (v === undefined || v === null ? null : parseAmount(v, l))

export function consolidateDebts(debts: DebtInput[], payments: PaymentInput[], recognition: 'verified_only' | 'all'): DebtsResult {
  try { return run(debts, payments, recognition) } catch (e) {
    if (e instanceof DecimalError) throw new CalcBlockedError([e.message])
    throw e
  }
}

function run(debts: DebtInput[], payments: PaymentInput[], recognition: 'verified_only' | 'all'): DebtsResult {
  if (!Array.isArray(debts) || debts.length === 0) throw new CalcBlockedError(['Aucune dette à consolider.'])
  if (debts.length > MAX_DEBTS) throw new CalcBlockedError(['Capacité dépassée : ' + MAX_DEBTS + ' dettes maximum.'])
  if (!Array.isArray(payments)) throw new CalcBlockedError(['Registre des paiements invalide.'])
  if (payments.length > MAX_PAYMENTS) throw new CalcBlockedError(['Capacité dépassée : ' + MAX_PAYMENTS + ' paiements maximum.'])
  if (recognition !== 'verified_only' && recognition !== 'all') throw new CalcBlockedError(['Mode de reconnaissance des paiements à choisir explicitement.'])

  const ids: Record<string, true> = {}
  for (const d of debts) {
    if (typeof d.id !== 'string' || !d.id.trim()) throw new CalcBlockedError(['Identifiant de dette obligatoire.'])
    if (ids[d.id]) throw new CalcBlockedError(['Identifiant de dette en doublon : ' + d.id + '.'])
    ids[d.id] = true
    if (d.type !== 'fiscal' && d.type !== 'social' && d.type !== 'other') throw new CalcBlockedError([d.id + ' : type de dette obligatoire (fiscal / social / other).'])
    if (!d.organism || !d.organism.trim()) throw new CalcBlockedError([d.id + ' : organisme obligatoire.'])
  }
  const receipts: Record<string, true> = {}
  const payIds: Record<string, true> = {}
  const paidP: Record<string, bigint> = {}, paidF: Record<string, bigint> = {}
  let exCount = 0, exAmount = ZERO
  for (const p of payments) {
    if (typeof p.id !== 'string' || !p.id.trim()) throw new CalcBlockedError(['Identifiant de paiement obligatoire.'])
    if (payIds[p.id]) throw new CalcBlockedError(['Identifiant de paiement en doublon : ' + p.id + '.'])
    payIds[p.id] = true
    if (!ids[p.debtId]) throw new CalcBlockedError(['Paiement ' + p.id + ' : ID dette inconnu (' + p.debtId + ').'])
    if (p.component !== 'principal' && p.component !== 'penalty' && p.component !== 'interest') throw new CalcBlockedError(['Paiement ' + p.id + ' : composante invalide.'])
    if (typeof p.verified !== 'boolean') throw new CalcBlockedError(['Paiement ' + p.id + ' : vérification de la pièce (oui/non) obligatoire.'])
    if (p.receiptRef) { if (receipts[p.receiptRef]) throw new CalcBlockedError(['Quittance en doublon : ' + p.receiptRef + '.']); receipts[p.receiptRef] = true }
    const amt = parseAmount(p.amount, 'paiement ' + p.id)
    if (amt <= ZERO) throw new CalcBlockedError(['Paiement ' + p.id + ' : montant nul ou négatif.'])
    if (recognition === 'all' || p.verified) {
      if (p.component === 'principal') paidP[p.debtId] = (paidP[p.debtId] || ZERO) + amt
      else paidF[p.debtId] = (paidF[p.debtId] || ZERO) + amt
    } else { exCount++; exAmount += amt }
  }

  const out: DebtResult[] = []
  let tPr = ZERO, tPe = ZERO, tPaid = ZERO, tEst = ZERO, tConf = ZERO, tY = ZERO, tZ = ZERO
  const byType: Record<string, bigint> = {}, byOrg: Record<string, bigint> = {}
  for (const d of debts) {
    const w = d.id
    const F = opt(d.principalConfirmed, w + ' principal confirmé'), G = opt(d.principalEstimated, w + ' principal estimé')
    const H = opt(d.penaltyConfirmed, w + ' pénalité confirmée'), I = opt(d.penaltyEstimated, w + ' pénalité estimée')
    const J = opt(d.interestConfirmed, w + ' intérêts confirmés')
    const L = parseAmount(d.credits, w + ' crédits/remises')
    if (F === null && G === null && H === null && I === null && J === null) throw new CalcBlockedError([w + ' : aucun montant renseigné (ni principal, ni pénalité, ni intérêts).'])
    const pr = F !== null ? F : (G !== null ? G : ZERO)
    const pe = H !== null ? H : (I !== null ? I : ZERO)
    const intr = J === null ? ZERO : J
    const AA = paidP[d.id] || ZERO, AB = paidF[d.id] || ZERO
    const K = AA + AB
    const est = bmax(ZERO, pr + pe + intr - K - L)
    const penTotal = pe + intr
    const Y = bmax(ZERO, pr - AA - L - bmax(ZERO, AB - penTotal))
    const Z = bmax(ZERO, penTotal - AB - bmax(ZERO, AA + L - pr))
    let M: bigint | null = null
    if (F !== null || H !== null || J !== null) M = (F === null ? ZERO : F) + (H === null ? ZERO : H) + (J === null ? ZERO : J)
    const N = M === null ? null : bmax(ZERO, M - K - L)
    const proof: DebtResult['proof'] = F !== null && (H !== null || I === null) ? 'CONFIRMÉ'
      : (F !== null || H !== null || J !== null ? 'PARTIELLEMENT CONFIRMÉ' : 'ESTIMATIF')
    out.push({
      id: d.id, organism: d.organism, nature: d.nature, period: d.period, type: d.type,
      principalBasis: F !== null ? 'confirmed' : (G !== null ? 'estimated' : 'none'), penaltyBasis: H !== null ? 'confirmed' : (I !== null ? 'estimated' : 'none'),
      principal: fmt(pr), penalty: fmt(pe), interest: fmt(intr), paidPrincipal: fmt(AA), paidPenalty: fmt(AB), credits: fmt(L),
      confirmedTotal: M === null ? null : fmt(M), confirmedBalance: N === null ? null : fmt(N),
      estimatedBalance: fmt(est), principalBalance: fmt(Y), penaltyBalance: fmt(Z), proof,
    })
    tPr += pr; tPe += pe + intr; tPaid += K; tEst += est; tY += Y; tZ += Z
    if (N !== null) tConf += N
    byType[d.type] = (byType[d.type] || ZERO) + est
    byOrg[d.organism] = (byOrg[d.organism] || ZERO) + est
  }
  const bt: Record<string, string> = {}, bo: Record<string, string> = {}
  Object.keys(byType).sort().forEach(k => { bt[k] = fmt(byType[k]) })
  Object.keys(byOrg).sort().forEach(k => { bo[k] = fmt(byOrg[k]) })
  const warnings: string[] = []
  if (exCount > 0) warnings.push(exCount + ' paiement(s) non vérifié(s) exclu(s) du calcul (' + fmt(exAmount) + ' XOF).')
  return {
    provisional: false, debts: out,
    totals: { principal: fmt(tPr), penalty: fmt(tPe), paid: fmt(tPaid), estimatedBalance: fmt(tEst), confirmedBalance: fmt(tConf), principalBalance: fmt(tY), penaltyBalance: fmt(tZ) },
    byType: bt, byOrganism: bo, excludedPayments: { count: exCount, amount: fmt(exAmount) }, warnings,
  }
}
