import { getServiceClient } from '@/lib/platform/supabase-server'
import { isUuid } from './campaign'
import { mergeContact } from './contact-merge'

type R = { status: number; body: Record<string, unknown> }

export async function attachContact(id: string, b: Record<string, unknown>, adminId: string): Promise<R> {
  const db = getServiceClient()
  const p = await db.from('asta_campaign_profiles').select('id, campaign_id, status, public_contact, reason, source_url').eq('id', id).maybeSingle()
  if (p.error) return { status: 500, body: { error: 'Lecture impossible' } }
  if (!p.data) return { status: 404, body: { error: 'Profil introuvable' } }
  if (typeof b.campaign === 'string' && b.campaign && (!isUuid(b.campaign) || b.campaign !== p.data.campaign_id)) {
    return { status: 400, body: { error: 'Ce profil n’appartient pas à cette campagne' } }
  }
  if (p.data.status === 'do_not_contact') {
    return { status: 409, body: { error: 'Ce profil est marqué « Ne pas contacter » : aucun contact ne peut lui être ajouté.' } }
  }
  const m = mergeContact({ public_contact: p.data.public_contact ?? null, reason: p.data.reason ?? null, source_url: p.data.source_url ?? null }, b)
  if ('error' in m) return { status: 400, body: { error: m.error } }
  if (Object.keys(m.patch).length === 0) return { status: 200, body: { ok: true, message: 'Ce contact est déjà associé au profil.' } }
  const u = await db.from('asta_campaign_profiles').update(m.patch).eq('id', id).select('id')
  if (u.error) return { status: 500, body: { error: 'Mise à jour impossible' } }
  if ((u.data ?? []).length === 0) return { status: 409, body: { error: 'Profil modifié ou supprimé entre-temps' } }
  try {
    await db.from('asta_events').upsert({ type: 'profile_contact_added', payload: { by: adminId, profile_id: id }, idempotency_key: `profile_contact_added:${id}:${Date.now()}` }, { onConflict: 'idempotency_key', ignoreDuplicates: true })
  } catch { /* le journal ne bloque jamais */ }
  const message = m.patch.public_contact ? 'Contact ajouté au profil ASTA.'
    : m.hadContact ? 'Le profil avait déjà un contact : le nouveau est noté dans le motif.'
    : 'Nom du contact noté dans le profil (aucun e-mail ou téléphone valide trouvé).'
  return { status: 200, body: { ok: true, message } }
}
