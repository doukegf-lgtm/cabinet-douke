import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { requireAdmin } from '@/lib/platform/auth'
import { getServiceClient } from '@/lib/platform/supabase-server'

export const runtime = 'nodejs'
const USERNAME_RE = /^[a-z0-9._-]{3,40}$/

// Création d'un compte (admin) : le mot de passe est haché ici, jamais côté navigateur
export async function POST(req: NextRequest) {
  const a = await requireAdmin(); if (!a.ok) return a.response
  const b = await req.json().catch(() => ({}))
  const username = typeof b.username === 'string' ? b.username.trim().toLowerCase() : ''
  const password = typeof b.password === 'string' ? b.password : ''
  if (!USERNAME_RE.test(username)) return NextResponse.json({ error: 'Nom d’utilisateur invalide (3-40 caractères a-z 0-9 . _ -)' }, { status: 400 })
  if (password.length < 8) return NextResponse.json({ error: 'Mot de passe : 8 caractères minimum' }, { status: 400 })
  const row = {
    ...(b.id ? { id: String(b.id) } : {}),
    username, password_hash: await bcrypt.hash(password, 10),
    name: String(b.name ?? ''), role: String(b.role ?? ''), org_id: b.org_id ?? null,
    emoji: b.emoji ?? null, collaborator_id: b.collaborator_id ?? null,
    eden_access: false, scout_access: false,
  }
  const { data, error } = await getServiceClient().from('auth_accounts').insert(row).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password_hash, ...safe } = data as Record<string, unknown>
  return NextResponse.json({ data: safe })
}

// Réinitialisation du mot de passe d'un compte (admin)
export async function PATCH(req: NextRequest) {
  const a = await requireAdmin(); if (!a.ok) return a.response
  const b = await req.json().catch(() => ({}))
  if (!b.id || typeof b.password !== 'string' || b.password.length < 8) {
    return NextResponse.json({ error: 'id et mot de passe (8 caractères minimum) requis' }, { status: 400 })
  }
  const { error } = await getServiceClient().from('auth_accounts').update({ password_hash: await bcrypt.hash(b.password, 10) }).eq('id', String(b.id))
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
