import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { timingSafeEqual } from 'crypto'
import { getServiceClient } from '@/lib/platform/supabase-server'
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/platform/session'
import { hit, clear } from '@/lib/platform/ratelimit'

export const runtime = 'nodejs'
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    if (!username || !password || username.length > 80 || password.length > 200) {
      return NextResponse.json({ error: 'Identifiants incorrects' }, { status: 401 })
    }
    const ip = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim()
    const key = `${ip}|${username}`
    if (!hit(`ip:${ip}`, 40, 15 * 60 * 1000) || !hit(key, 5, 15 * 60 * 1000)) {
      return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans 15 minutes.' }, { status: 429 })
    }

    const supabase = getServiceClient()
    const { data: acc } = await supabase.from('auth_accounts').select('*').eq('username', username).maybeSingle()
    const stored: string = acc && typeof acc.password_hash === 'string' ? acc.password_hash : ''

    let ok = false
    if (stored.startsWith('$2')) {
      ok = await bcrypt.compare(password, stored)
    } else if (stored) {
      // Ancien format (texte en clair) : comparaison à temps constant, puis migration transparente vers bcrypt
      const a = Buffer.from(stored), b = Buffer.from(password)
      ok = a.length === b.length && timingSafeEqual(a, b)
      if (ok) {
        try {
          const upgraded = await bcrypt.hash(password, 10)
          await supabase.from('auth_accounts').update({ password_hash: upgraded }).eq('id', acc!.id)
        } catch (e) { console.error('Migration du mot de passe impossible (colonne trop courte ?)', e) }
      }
    } else {
      await bcrypt.compare(password, DUMMY_HASH) // même durée si le compte n'existe pas
    }

    if (!ok || !acc) return NextResponse.json({ error: 'Identifiants incorrects' }, { status: 401 })

    clear(key)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...safe } = acc as Record<string, unknown>
    const token = await signSession({ sub: String(acc.id), role: String(acc.role ?? ''), name: String(acc.name ?? '') })
    const res = NextResponse.json({ data: safe })
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SESSION_MAX_AGE,
    })
    return res
  } catch (e) {
    console.error('login error', e)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
