import { cleanContact, dedupeKey, domainOf } from './campaign'

export interface Candidate {
  name: string; sector: string | null; city: string | null; source_url: string
  public_contact: string | null; reason: string | null; fit_score: number | null; dedupe_key: string
}
const s = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

export function extractJsonArray(text: string): unknown[] {
  const t = text.replace(/```json|```/gi, '')
  const a = t.indexOf('['), b = t.lastIndexOf(']')
  if (a < 0 || b <= a) return []
  try { const v = JSON.parse(t.slice(a, b + 1)); return Array.isArray(v) ? v : [] } catch { return [] }
}
export function matchesSource(domain: string, titles: string[]): boolean {
  return titles.some((raw) => {
    const t = raw.toLowerCase().replace(/^www\./, '').trim()
    return !!t && (domain === t || domain.endsWith('.' + t) || t.endsWith('.' + domain))
  })
}
// Ne garde que les candidats dont la source figure parmi les sources réellement utilisées par la recherche.
export function filterCandidates(raw: unknown[], titles: string[], existing: Set<string>, limit: number) {
  const kept: Candidate[] = []
  let dropped = 0
  const seen = new Set(existing)
  for (let i = 0; i < raw.length; i++) {
    if (kept.length >= limit) break
    const o = (raw[i] && typeof raw[i] === 'object' ? raw[i] : {}) as Record<string, unknown>
    const name = s(o.name, 120), domain = domainOf(o.source_url)
    if (name.length < 2 || !domain || !matchesSource(domain, titles)) { dropped++; continue }
    const city = s(o.city, 80) || null
    const key = dedupeKey(name, city)
    if (seen.has(key)) { dropped++; continue }
    seen.add(key)
    const fit = o.fit == null ? NaN : Number(o.fit)
    kept.push({
      name, sector: s(o.sector, 80) || null, city, source_url: String(o.source_url).slice(0, 300),
      public_contact: cleanContact(o.public_contact), reason: s(o.reason, 200) || null,
      fit_score: Number.isFinite(fit) ? Math.max(0, Math.min(100, Math.round(fit))) : null, dedupe_key: key,
    })
  }
  return { kept, dropped }
}
