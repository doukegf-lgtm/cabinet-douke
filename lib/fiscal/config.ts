export const FISCAL_MODULE = {
  name: 'Fiscal & Social',
  version: '1.0.0',
  engineStatus: 'not_certified',
  workbook: 'Outil_regularisation_fiscale_sociale_Benin_V8 (1).xlsx',
  mapping: 'Cartographie_des_saisies_V8 (1).xlsx',
} as const

export const FISCAL_DOSSIER_STATUSES = [
  'draft',
  'pending_review',
  'blocked_unvalidated_rule',
  'validated',
  'closed',
] as const

export type FiscalDossierStatus =
  (typeof FISCAL_DOSSIER_STATUSES)[number]

export const FISCAL_CALCULATION_STATUSES = [
  'blocked_unvalidated_rule',
  'pending_review',
  'validated',
  'rejected',
] as const

export type FiscalCalculationStatus =
  (typeof FISCAL_CALCULATION_STATUSES)[number]
