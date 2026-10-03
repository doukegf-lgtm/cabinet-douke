import { NextRequest, NextResponse } from 'next/server'
import { verifySession, SESSION_COOKIE } from '@/lib/platform/session'

const PUBLIC_API = ['/api/auth/login', '/api/auth/logout', '/api/asta/diagnostic', '/api/asta/cron']
const GATED_PAGES = ['/eden', '/scout', '/offres-contrats', '/asta']
const under = (path: string, base: string) => path === base || path.startsWith(base + '/')

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const isApi = pathname.startsWith('/api/')

  // Une mutation doit venir de notre propre origine (vaut aussi pour les routes publiques)
  if (isApi && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.headers.get('origin')
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
    if (origin) {
      let originHost = ''
      try { originHost = new URL(origin).host } catch { /* origine invalide */ }
      if (originHost !== host) return NextResponse.json({ error: 'Origine refusée' }, { status: 403 })
    }
  }
  if (isApi && PUBLIC_API.some((p) => under(pathname, p))) return NextResponse.next()

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value)
  if (isApi) {
    if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    return NextResponse.next()
  }
  if (GATED_PAGES.some((p) => under(pathname, p)) && !session) return NextResponse.redirect(new URL('/', req.url))
  return NextResponse.next()
}

export const config = { matcher: ['/api/:path*', '/eden/:path*', '/scout/:path*', '/offres-contrats/:path*', '/asta/:path*'] }
