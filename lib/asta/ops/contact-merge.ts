import { cleanContact, domainOf } from './campaign'
import { normaliserTel } from '../../scout/ia-client'

export interface ProfileLite { public_contact: string | null; reason: string | null; source_url: string | null }
export interface MergePatch { public_contact?: string; reason?: string; source_url?: string }

const t = (v: unknown, max: number) =>
  typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : ''

/** Fusionne un contact trouvé (Scout) dans un profil ASTA : n'écrase jamais un contact existant, sans doublon dans le motif. */
export function mergeContact(cur: ProfileLite, i: Record<string, unknown>): { error: string } | { patch: MergePatch; hadContact: boolean } {
  const nom = t(i.nom, 120), poste = t(i.poste, 120)
  if (nom.length < 2) return { error: 'Nom du contact requis' }
  const e = cleanContact(t(i.email, 120)); const email = e && e.includes('@') ? e : null
  const p = cleanContact(normaliserTel(t(i.telephone, 40), t(i.zone, 80))); const tel = p && !p.includes('@') ? p : null
  const contact = email ?? tel
  const patch: MergePatch = {}
  if (contact && !cur.public_contact) patch.public_contact = contact
  const final = patch.public_contact ?? cur.public_contact
  const tag = `Contact : ${nom}`
  if (!(cur.reason ?? '').includes(tag)) {
    const extra = [email, tel].filter((x): x is string => !!x && x !== final)
    const line = tag + (poste ? ` (${poste})` : '') + (extra.length ? ' · ' + extra.join(' · ') : '')
    patch.reason = [cur.reason, line].filter(Boolean).join(' | ').slice(0, 500)
  }
  const src = t(i.source_url, 500)
  if (!cur.source_url && domainOf(src)) patch.source_url = src
  return { patch, hadContact: !!contact }
}
