import type { DebtInput } from './debts'

export type CnssOriginViolation = {
  code: 'CNSS_PAYROLL_DUPLICATE' | 'CNSS_ORIGIN_REQUIRED'
  debt_id: string
  organism: string
  nature: string
  origin: DebtInput['origin'] | null
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function refersToCnss(value: string): boolean {
  const normalized = normalize(value)
  return (
    normalized.includes('CNSS') ||
    normalized.includes('CAISSENATIONALEDESECURITESOCIALE')
  )
}

export function findCnssOriginViolations(
  debts: DebtInput[],
): CnssOriginViolation[] {
  return debts
    .filter(
      debt =>
        refersToCnss(debt.organism) || refersToCnss(debt.nature),
    )
    .filter(debt => debt.origin !== 'historical_notice')
    .map(debt => ({
      code:
        debt.origin === 'payroll'
          ? 'CNSS_PAYROLL_DUPLICATE'
          : 'CNSS_ORIGIN_REQUIRED',
      debt_id: debt.id,
      organism: debt.organism,
      nature: debt.nature,
      origin: debt.origin ?? null,
    }))
}
