import {
  consolidateDebts,
  type DebtInput,
  type PaymentInput,
  type DebtsResult,
} from './engine/debts'

import { CalcBlockedError } from './engine/arrears-common'

type SectionCode = 'tax_operations' | 'social_operations' | 'payments'

type SectionInput = {
  section_code: string
  status: string
  payload: unknown
  id?: string
  version?: number
}

type SourceMode = 'actual' | 'estimated' | 'mixed'

type ParsedSection = {
  mode: SourceMode
  data: Record<string, unknown>
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const fail = (message: string): never => {
  throw new CalcBlockedError([message])
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    return fail(`${label} : texte obligatoire`)
  }
  return value.trim()
}

function optionalMoney(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') {
    return fail(`${label} : montant à fournir sous forme de chaîne`)
  }
  return value
}

function readSection(
  sections: SectionInput[],
  code: SectionCode,
): ParsedSection {
  const matches = sections.filter((item) => item.section_code === code)

  if (matches.length !== 1) {
    return fail(
      `La section ${code} doit être présente une seule fois dans le dossier`,
    )
  }

  const section = matches[0]

  if (section.status !== 'validated') {
    return fail(`La section ${code} doit être validée avant le calcul`)
  }

  if (!isObject(section.payload) || !isObject(section.payload.data)) {
    return fail(`La structure de la section ${code} est invalide`)
  }

  const mode = section.payload.source_mode

  if (mode !== 'actual' && mode !== 'estimated' && mode !== 'mixed') {
    return fail(`La source des données de ${code} est invalide`)
  }

  return { mode, data: section.payload.data }
}

function parseDebts(
  section: ParsedSection,
  code: 'tax_operations' | 'social_operations',
  expectedType: 'fiscal' | 'social',
): DebtInput[] {
  const rawDebts = section.data.debts

  if (!Array.isArray(rawDebts)) {
    return fail(`${code} : le tableau data.debts est obligatoire`)
  }

  if (rawDebts.length > 1000) {
    return fail(`${code} : maximum 1000 dettes`)
  }

  return rawDebts.map((raw, index) => {
    const label = `${code}, dette ${index + 1}`

    if (!isObject(raw)) return fail(`${label} : objet invalide`)

    const declaredType = raw.type
    if (declaredType !== undefined && declaredType !== expectedType) {
      return fail(`${label} : type incompatible avec la section`)
    }

    const origin = raw.origin
    if (
      origin !== undefined &&
      origin !== 'historical_notice' &&
      origin !== 'payroll'
    ) {
      return fail(`${label} : origine invalide`)
    }

    const debt: DebtInput = {
      id: requiredText(raw.id, `${label} id`),
      organism: requiredText(raw.organism, `${label} organisme`),
      nature: requiredText(raw.nature, `${label} nature`),
      period: requiredText(raw.period, `${label} période`),
      type: expectedType,
      origin: origin as DebtInput['origin'],
      credits: optionalMoney(raw.credits, `${label} crédits`) ?? '0',
      principalConfirmed: optionalMoney(
        raw.principalConfirmed,
        `${label} principal confirmé`,
      ),
      principalEstimated: optionalMoney(
        raw.principalEstimated,
        `${label} principal estimé`,
      ),
      penaltyConfirmed: optionalMoney(
        raw.penaltyConfirmed,
        `${label} pénalité confirmée`,
      ),
      penaltyEstimated: optionalMoney(
        raw.penaltyEstimated,
        `${label} pénalité estimée`,
      ),
      interestConfirmed: optionalMoney(
        raw.interestConfirmed,
        `${label} intérêts confirmés`,
      ),
    }

    if (
      section.mode === 'actual' &&
      (
        debt.principalEstimated !== null ||
        debt.penaltyEstimated !== null
      )
    ) {
      return fail(`${label} : une source actual ne peut contenir de montant estimé`)
    }

    return debt
  })
}

function parsePayments(section: ParsedSection): PaymentInput[] {
  const rawPayments = section.data.payments

  if (!Array.isArray(rawPayments)) {
    return fail('payments : le tableau data.payments est obligatoire')
  }

  if (rawPayments.length > 1000) {
    return fail('payments : maximum 1000 paiements')
  }

  return rawPayments.map((raw, index) => {
    const label = `Paiement ${index + 1}`

    if (!isObject(raw)) return fail(`${label} : objet invalide`)

    const date = requiredText(raw.date, `${label} date`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return fail(`${label} : date attendue au format YYYY-MM-DD`)
    }

    if (
      raw.component !== 'principal' &&
      raw.component !== 'penalty' &&
      raw.component !== 'interest'
    ) {
      return fail(`${label} : composante invalide`)
    }

    if (typeof raw.verified !== 'boolean') {
      return fail(`${label} : confirmation du paiement obligatoire`)
    }

    if (typeof raw.amount !== 'string') {
      return fail(`${label} : montant sous forme de chaîne obligatoire`)
    }

    return {
      id: requiredText(raw.id, `${label} id`),
      debtId: requiredText(raw.debt_id, `${label} dette associée`),
      date,
      component: raw.component,
      amount: raw.amount,
      verified: raw.verified,
      receiptRef:
        typeof raw.receipt_ref === 'string' ? raw.receipt_ref : null,
    }
  })
}

export function calculateArrearsFromSections(
  sections: SectionInput[],
  recognition: 'verified_only' | 'all' = 'verified_only',
): DebtsResult {
  if (!Array.isArray(sections)) {
    return fail('Les sections du dossier sont absentes')
  }

  const taxSection = readSection(sections, 'tax_operations')
  const socialSection = readSection(sections, 'social_operations')
  const paymentSection = readSection(sections, 'payments')

  const debts = [
    ...parseDebts(taxSection, 'tax_operations', 'fiscal'),
    ...parseDebts(socialSection, 'social_operations', 'social'),
  ]

  const payments = parsePayments(paymentSection)

  if (debts.length === 0 && payments.length > 0) {
    return fail('Des paiements sont renseignés sans dette fiscale ou sociale correspondante')
  }

  // Un dossier peut ne contenir que des périodes de paie CNSS.
  // La consolidation générique vide permet alors au moteur CNSS
  // de produire le résultat consolidé sans dette fictive.
  return consolidateDebts(debts, payments, recognition)
}
