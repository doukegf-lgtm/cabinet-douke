import { randomBytes } from 'crypto'

export const CAMPAIGN_TYPES = ['prospection', 'relance', 'publication'] as const
export type CampaignType = (typeof CAMPAIGN_TYPES)[number]
export interface CampaignInput {
  name: string; type: CampaignType; service: string | null; zone: string | null; sector: string | null
  target_count: number; conditions: string | null; start_date: string; end_date: string
}
type V = { ok: true; value: CampaignInput } | { ok: false; error: string }

const txt = (v: unknown, max: number) =>
  typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : ''
const isDate = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}
const DAY = 24 * 3600 * 1000
export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
export const underCap = (count: number, cap: number) => count < cap

export function validateCampaign(b: Record<string, unknown>): V {
  const name = txt(b.name, 80)
  if (name.length < 3) return { ok: false, error: 'Nom : 3 caractères minimum' }
  if (!CAMPAIGN_TYPES.includes(b.type as CampaignType)) return { ok: false, error: 'Type de campagne invalide' }
  const type = b.type as CampaignType
  const service = txt(b.service, 120), zone = txt(b.zone, 120), sector = txt(b.sector, 120), conditions = txt(b.conditions, 500)
  const n = Number(b.target_count)
  if (!Number.isInteger(n) || n < 1 || n > 500) return { ok: false, error: 'Nombre visé : entier de 1 à 500' }
  const start = txt(b.start_date, 10), end = txt(b.end_date, 10)
  if (!isDate(start) || !isDate(end)) return { ok: false, error: 'Dates invalides (AAAA-MM-JJ)' }
  if (end < start) return { ok: false, error: 'La date de fin précède la date de début' }
  if ((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY > 180) return { ok: false, error: 'Durée maximale : 180 jours' }
  if (type !== 'publication' && !service) return { ok: false, error: 'Service requis' }
  if (type === 'prospection' && !zone) return { ok: false, error: 'Zone requise pour une prospection' }
  return { ok: true, value: { name, type, service: service || null, zone: zone || null, sector: sector || null, target_count: n, conditions: conditions || null, start_date: start, end_date: end } }
}

const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789'
export function makeCode(): string {
  const b = randomBytes(6)
  let s = ''
  for (let i = 0; i < b.length; i++) s += ALPHA[b[i] % ALPHA.length]
  return s
}
export const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
export const dedupeKey = (name: string, city: string | null) => `${norm(name)}|${norm(city ?? '')}`

export function domainOf(url: unknown): string | null {
  if (typeof url !== 'string') return null
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return null
    const h = u.hostname.toLowerCase().replace(/^www\./, '')
    if (!h.includes('.') || /^[0-9.]+$/.test(h) || h.includes(':') || h === 'localhost') return null
    return h
  } catch { return null }
}
export function cleanContact(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (t.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t)) return t.toLowerCase()
  const d = t.replace(/[\s.\-()]/g, '')
  return /^\+?[0-9]{8,15}$/.test(d) ? d : null
}
