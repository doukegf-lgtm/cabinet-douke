import { DecimalError, ZERO, bmax, fmt, parseMoney } from './decimal'
import { CalcBlockedError } from './arrears-common'

export const MAX_DEBTS = 1000
export const MAX_PAYMENTS = 1000

export type DebtType = 'fiscal' | 'social' | 'other'

export interface DebtInput {
  id: string
  organism: string
  nature: string
  period: string
  type: DebtType
  origin?: 'historical_notice' | 'payroll'
  principalConfirmed?: string | null
  principalEstimated?: string | null
  penaltyConfirmed?: string | null
  penaltyEstimated?: string | null
  interestConfirmed?: string | null
  credits: string
}

export interface PaymentInput {
  id: string
  debtId: string
  date: string
  component: 'principal' | 'penalty' | 'interest'
  amount: string
  verified: boolean
  receiptRef?: string | null
}

export interface DebtResult {
  id: string
  organism: string
  nature: string
  period: string
  type: DebtType
  origin?: 'historical_notice' | 'payroll'
  principalBasis: 'confirmed' | 'estimated' | 'none'
  penaltyBasis: 'confirmed' | 'estimated' | 'none'
  principal: string
  penalty: string
  interest: string
  paidPrincipal: string
  paidPenalty: string
  paidInterest: string
  credits: string
  confirmedTotal: string | null
  confirmedBalance: string | null
  estimatedBalance: string
  principalBalance: string
  penaltyBalance: string
  interestBalance: string
  proof: 'CONFIRMÉ' | 'PARTIELLEMENT CONFIRMÉ' | 'ESTIMATIF'
}

export interface DebtsResult {
  provisional: false
  debts: DebtResult[]
  totals: {
    principal: string
    penalty: string
    paid: string
    estimatedBalance: string
    confirmedBalance: string
    principalBalance: string
    penaltyBalance: string
    interest: string
    interestBalance: string
  }
  byType: Record<string, string>
  byOrganism: Record<string, string>
  excludedPayments: { count: number; amount: string }
  warnings: string[]
}

function optionalMoney(value: string | null | undefined, label: string): bigint | null {
  return value === undefined || value === null ? null : parseMoney(value, label)
}

export function consolidateDebts(
  debts: DebtInput[],
  payments: PaymentInput[],
  recognition: 'verified_only' | 'all' = 'verified_only'
): DebtsResult {
  try {
    return runConsolidation(debts, payments, recognition)
  } catch (error) {
    if (error instanceof DecimalError) throw new CalcBlockedError([error.message])
    throw error
  }
}

function runConsolidation(
  debts: DebtInput[],
  payments: PaymentInput[],
  recognition: 'verified_only' | 'all'
): DebtsResult {
  if (!Array.isArray(debts) || debts.length === 0) {
    throw new CalcBlockedError(['Aucune dette à consolider.'])
  }
  if (debts.length > MAX_DEBTS || !Array.isArray(payments) || payments.length > MAX_PAYMENTS) {
    throw new CalcBlockedError(['Capacité maximale de dettes ou de paiements dépassée.'])
  }
  if (recognition !== 'verified_only' && recognition !== 'all') {
    throw new CalcBlockedError(['Mode de reconnaissance des paiements invalide.'])
  }

  const debtIds: Record<string, boolean> = {}
  debts.forEach(function (debt) {
    if (!debt.id || !debt.id.trim() || debtIds[debt.id]) {
      throw new CalcBlockedError(['Identifiant de dette absent ou en doublon : ' + debt.id])
    }
    if (['fiscal', 'social', 'other'].indexOf(debt.type) < 0) {
      throw new CalcBlockedError([debt.id + ' : type de dette invalide.'])
    }
    if (!debt.organism || !debt.organism.trim()) {
      throw new CalcBlockedError([debt.id + ' : organisme obligatoire.'])
    }
    debtIds[debt.id] = true
  })

  const paymentIds: Record<string, boolean> = {}
  const receipts: Record<string, boolean> = {}
  const paidPrincipal: Record<string, bigint> = {}
  const paidPenalty: Record<string, bigint> = {}
  const paidInterest: Record<string, bigint> = {}
  let excludedCount = 0
  let excludedAmount = ZERO

  payments.forEach(function (payment) {
    if (!payment.id || paymentIds[payment.id]) {
      throw new CalcBlockedError(['Identifiant de paiement absent ou en doublon.'])
    }
    paymentIds[payment.id] = true
    if (!debtIds[payment.debtId]) {
      throw new CalcBlockedError(['Paiement ' + payment.id + ' : dette inconnue.'])
    }
    if (['principal', 'penalty', 'interest'].indexOf(payment.component) < 0) {
      throw new CalcBlockedError(['Paiement ' + payment.id + ' : composante invalide.'])
    }
    if (typeof payment.verified !== 'boolean') {
      throw new CalcBlockedError(['Paiement ' + payment.id + ' : vérification obligatoire.'])
    }
    if (payment.receiptRef && payment.receiptRef.trim()) {
      const receipt = payment.receiptRef.trim()
      if (receipts[receipt]) throw new CalcBlockedError(['Quittance en doublon : ' + receipt])
      receipts[receipt] = true
    }

    const amount = parseMoney(payment.amount, 'paiement ' + payment.id)
    if (amount <= ZERO) throw new CalcBlockedError(['Paiement nul ou négatif : ' + payment.id])

    if (recognition === 'verified_only' && !payment.verified) {
      excludedCount++
      excludedAmount += amount
      return
    }

    if (payment.component === 'principal') {
      paidPrincipal[payment.debtId] = (paidPrincipal[payment.debtId] || ZERO) + amount
    } else if (payment.component === 'penalty') {
      paidPenalty[payment.debtId] = (paidPenalty[payment.debtId] || ZERO) + amount
    } else {
      paidInterest[payment.debtId] = (paidInterest[payment.debtId] || ZERO) + amount
    }
  })

  const results: DebtResult[] = []
  const byType: Record<string, bigint> = {}
  const byOrganism: Record<string, bigint> = {}
  let totalPrincipal = ZERO
  let totalPenalty = ZERO
  let totalInterest = ZERO
  let totalPaid = ZERO
  let totalEstimated = ZERO
  let totalConfirmed = ZERO
  let totalPrincipalBalance = ZERO
  let totalPenaltyBalance = ZERO
  let totalInterestBalance = ZERO

  debts.forEach(function (debt) {
    const id = debt.id
    const principalC = optionalMoney(debt.principalConfirmed, id + ' principal confirmé')
    const principalE = optionalMoney(debt.principalEstimated, id + ' principal estimé')
    const penaltyC = optionalMoney(debt.penaltyConfirmed, id + ' pénalité confirmée')
    const penaltyE = optionalMoney(debt.penaltyEstimated, id + ' pénalité estimée')
    const interest = optionalMoney(debt.interestConfirmed, id + ' intérêts confirmés')
    const credits = parseMoney(debt.credits, id + ' crédits')

    if (principalC === null && principalE === null &&
        penaltyC === null && penaltyE === null && interest === null) {
      throw new CalcBlockedError([id + ' : aucun montant renseigné.'])
    }

    const principal = principalC !== null ? principalC : (principalE || ZERO)
    const penalty = penaltyC !== null ? penaltyC : (penaltyE || ZERO)
    const interestValue = interest || ZERO
    const paidP = paidPrincipal[id] || ZERO
    const paidF = paidPenalty[id] || ZERO
    const paidI = paidInterest[id] || ZERO
    const paid = paidP + paidF + paidI
    const penaltyAndInterest = penalty + interestValue

    const estimated = bmax(ZERO, principal + penaltyAndInterest - paid - credits)

    // Imputation : composante désignée d'abord, puis débordement sur l'autre.
    const paidOnPenaltiesAndInterest = paidF + paidI
    const principalAfter = bmax(
      ZERO,
      principal - paidP - credits - bmax(ZERO, paidOnPenaltiesAndInterest - penaltyAndInterest)
    )

    // Les paiements de composante couvrent d'abord leur composante.
    // Les excédents couvrent ensuite l'autre composante.
    const penaltyAfterSpecific = bmax(
      ZERO,
      penalty - paidF - bmax(ZERO, paidI - interestValue)
    )
    const interestAfterSpecific = bmax(
      ZERO,
      interestValue - paidI - bmax(ZERO, paidF - penalty)
    )

    // Les paiements de principal et crédits excédentaires
    // couvrent ensuite les pénalités, puis les intérêts.
    const principalExcess = bmax(ZERO, paidP + credits - principal)
    const penaltyAfter = bmax(ZERO, penaltyAfterSpecific - principalExcess)
    const interestAfter = bmax(
      ZERO,
      interestAfterSpecific - bmax(ZERO, principalExcess - penaltyAfterSpecific)
    )

    // Une absence de montant ne vaut jamais confirmation d'un montant nul.
    // Pour confirmer une composante inexistante, saisir explicitement "0".
    const fullyConfirmed =
      principalC !== null && penaltyC !== null && interest !== null

    const confirmedTotal = fullyConfirmed
      ? principalC + penaltyC + interest
      : null
    const confirmedBalance = confirmedTotal === null
      ? null
      : bmax(ZERO, confirmedTotal - paid - credits)

    const proof: DebtResult['proof'] = fullyConfirmed
      ? 'CONFIRMÉ'
      : (principalC !== null || penaltyC !== null || interest !== null
        ? 'PARTIELLEMENT CONFIRMÉ' : 'ESTIMATIF')

    results.push({
      id: id,
      organism: debt.organism,
      nature: debt.nature,
      period: debt.period,
      type: debt.type,
      origin: debt.origin,
      principalBasis: principalC !== null ? 'confirmed' : (principalE !== null ? 'estimated' : 'none'),
      penaltyBasis: penaltyC !== null ? 'confirmed' : (penaltyE !== null ? 'estimated' : 'none'),
      principal: fmt(principal),
      penalty: fmt(penalty),
      interest: fmt(interestValue),
      paidPrincipal: fmt(paidP),
      paidPenalty: fmt(paidF),
      paidInterest: fmt(paidI),
      credits: fmt(credits),
      confirmedTotal: confirmedTotal === null ? null : fmt(confirmedTotal),
      confirmedBalance: confirmedBalance === null ? null : fmt(confirmedBalance),
      estimatedBalance: fmt(estimated),
      principalBalance: fmt(principalAfter),
      penaltyBalance: fmt(penaltyAfter),
      interestBalance: fmt(interestAfter),
      proof: proof
    })

    totalPrincipal += principal
    totalPenalty += penalty
    totalInterest += interestValue
    totalPaid += paid
    totalEstimated += estimated
    totalPrincipalBalance += principalAfter
    totalPenaltyBalance += penaltyAfter
    totalInterestBalance += interestAfter
    if (confirmedBalance !== null) totalConfirmed += confirmedBalance

    byType[debt.type] = (byType[debt.type] || ZERO) + estimated
    byOrganism[debt.organism] = (byOrganism[debt.organism] || ZERO) + estimated
  })

  const typeOutput: Record<string, string> = {}
  const organismOutput: Record<string, string> = {}
  Object.keys(byType).forEach(function (key) { typeOutput[key] = fmt(byType[key]) })
  Object.keys(byOrganism).forEach(function (key) { organismOutput[key] = fmt(byOrganism[key]) })

  const warnings: string[] = []
  if (excludedCount > 0) {
    warnings.push(excludedCount + ' paiement(s) non vérifié(s) exclu(s), soit ' + fmt(excludedAmount) + ' XOF.')
  }

  return {
    provisional: false,
    debts: results,
    totals: {
      principal: fmt(totalPrincipal),
      penalty: fmt(totalPenalty),
      interest: fmt(totalInterest),
      paid: fmt(totalPaid),
      estimatedBalance: fmt(totalEstimated),
      confirmedBalance: fmt(totalConfirmed),
      principalBalance: fmt(totalPrincipalBalance),
      penaltyBalance: fmt(totalPenaltyBalance),
      interestBalance: fmt(totalInterestBalance)
    },
    byType: typeOutput,
    byOrganism: organismOutput,
    excludedPayments: { count: excludedCount, amount: fmt(excludedAmount) },
    warnings: warnings
  }
}
