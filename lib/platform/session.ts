import { SignJWT, jwtVerify } from 'jose'

export const SESSION_COOKIE = 'douke_session'
export const SESSION_MAX_AGE = 60 * 60 * 8 // 8 h

export interface SessionPayload { sub: string; role: string; name: string }

function secretKey() {
  const s = process.env.SESSION_SECRET
  if (!s || s.length < 32) throw new Error('SESSION_SECRET manquant ou trop court (>= 32 caractères)')
  return new TextEncoder().encode(s)
}

export async function signSession(p: SessionPayload): Promise<string> {
  return new SignJWT({ role: p.role, name: p.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(p.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secretKey())
}

// Échoue "fermé" : toute erreur (secret absent, jeton invalide, expiré) => null
export async function verifySession(token?: string | null): Promise<SessionPayload | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] })
    if (!payload.sub) return null
    return { sub: payload.sub, role: String(payload.role ?? ''), name: String(payload.name ?? '') }
  } catch { return null }
}
