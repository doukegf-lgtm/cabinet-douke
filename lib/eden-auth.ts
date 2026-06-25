// lib/eden-auth.ts
import { createBrowserSupabaseClient, createServerSupabaseClient } from '@/app/supabaseClient'

export interface EdenSession {
  id: string
  username: string
  name: string
  role: 'admin' | 'user'
  eden_access: boolean
}

export function saveEdenSession(session: EdenSession) {
  if (typeof window === 'undefined') return
  localStorage.setItem('eden_session', JSON.stringify(session))
}

export function getEdenSession(): EdenSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem('eden_session')
    if (!raw) return null
    return JSON.parse(raw) as EdenSession
  } catch { return null }
}

export function clearEdenSession() {
  if (typeof window === 'undefined') return
  localStorage.removeItem('eden_session')
}

export async function checkEdenAccessClient(userId: string): Promise<EdenSession | null> {
  const supabase = createBrowserSupabaseClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, name, role, eden_access')
    .eq('id', userId)
    .single()
  if (error || !data || !data.eden_access) return null
  return data as EdenSession
}

export async function checkEdenAccessServer(userId: string): Promise<EdenSession | null> {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, name, role, eden_access')
    .eq('id', userId)
    .single()
  if (error || !data || !data.eden_access) return null
  return data as EdenSession
}

export async function getAllProfiles() {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, name, role, eden_access')
    .order('role', { ascending: false })
  if (error) throw error
  return data || []
}

export async function setEdenAccess(targetId: string, access: boolean) {
  const supabase = createServerSupabaseClient()
  const { error } = await supabase
    .from('profiles')
    .update({ eden_access: access })
    .eq('id', targetId)
  if (error) throw error
}
