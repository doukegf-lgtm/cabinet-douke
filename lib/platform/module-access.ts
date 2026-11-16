import { NextResponse } from 'next/server'
import { requireUser } from './auth'
import { getServiceClient } from './supabase-server'

export type ModuleName = 'asta' | 'eden' | 'scout' | 'fiscal'

const ACCESS_FIELDS = {
  asta: 'asta_access',
  eden: 'eden_access',
  scout: 'scout_access',
  fiscal: 'fiscal_access',
} as const

export async function requireModuleAccess(module: ModuleName) {
  const auth = await requireUser()
  if (!auth.ok) return auth

  const { data, error } = await getServiceClient()
    .from('auth_accounts')
    .select('id, role, all_modules_access, asta_access, eden_access, scout_access, fiscal_access, fiscal_validate_access')
    .eq('id', auth.session.sub)
    .maybeSingle()

  if (error || !data) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Compte introuvable ou accès indisponible.' },
        { status: 403 }
      ),
    }
  }

  const isAdmin = ['Super-Admin', 'admin'].includes(String(data.role))
  const hasAllModules = data.all_modules_access === true
  const hasModuleAccess = data[ACCESS_FIELDS[module]] === true

  if (!isAdmin && !hasAllModules && !hasModuleAccess) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Accès non autorisé à ce module.' },
        { status: 403 }
      ),
    }
  }

  return auth
}


export async function requireFiscalValidationAccess() {
  const auth = await requireUser()
  if (!auth.ok) return auth

  const { data, error } = await getServiceClient()
    .from('auth_accounts')
    .select('id, role, all_modules_access, fiscal_access, fiscal_validate_access')
    .eq('id', auth.session.sub)
    .maybeSingle()

  if (error || !data) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Compte introuvable ou accès indisponible.' },
        { status: 403 }
      ),
    }
  }

  const isAdmin = ['Super-Admin', 'admin'].includes(String(data.role))
  const hasFiscalAccess =
    data.fiscal_access === true || data.all_modules_access === true
  const canValidate = data.fiscal_validate_access === true

  if (!isAdmin && !(hasFiscalAccess && canValidate)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Autorisation de validation fiscale insuffisante.' },
        { status: 403 }
      ),
    }
  }

  return auth
}