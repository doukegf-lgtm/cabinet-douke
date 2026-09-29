import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySession, type SessionPayload } from './session'
import { getServiceClient } from './supabase-server'

export const ADMIN_ROLES = ['Super-Admin', 'admin']

export async function getSession(): Promise<SessionPayload | null> {
  return verifySession(cookies().get(SESSION_COOKIE)?.value)
}

export async function requireUser() {
  const session = await getSession()
  if (!session) return { ok: false as const, response: NextResponse.json({ error: 'Non authentifié' }, { status: 401 }) }
  return { ok: true as const, session }
}

// Le rôle est relu en base : un compte supprimé ou rétrogradé perd l'accès admin immédiatement.
export async function requireAdmin() {
  const r = await requireUser()
  if (!r.ok) return r
  const { data } = await getServiceClient().from('auth_accounts').select('id, role').eq('id', r.session.sub).maybeSingle()
  if (!data || !ADMIN_ROLES.includes(String(data.role))) {
    return { ok: false as const, response: NextResponse.json({ error: 'Réservé aux administrateurs' }, { status: 403 }) }
  }
  return r
}
