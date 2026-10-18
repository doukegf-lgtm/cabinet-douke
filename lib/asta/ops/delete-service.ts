import { getServiceClient } from '@/lib/platform/supabase-server'

type R = { status: number; body: Record<string, unknown> }
type Db = ReturnType<typeof getServiceClient>

async function log(db: Db, type: string, key: string, payload: Record<string, unknown>) {
  try { await db.from('asta_events').upsert({ type, payload, idempotency_key: key }, { onConflict: 'idempotency_key', ignoreDuplicates: true }) } catch { /* le journal ne bloque jamais */ }
}

export async function deleteCampaign(id: string, adminId: string, force: boolean): Promise<R> {
  const db = getServiceClient()
  const c = await db.from('asta_campaigns').select('id, name, status').eq('id', id).maybeSingle()
  if (c.error) return { status: 500, body: { error: 'Lecture impossible' } }
  if (!c.data) return { status: 404, body: { error: 'Campagne introuvable' } }
  if (c.data.status === 'active') return { status: 409, body: { error: 'Une campagne active ne peut pas être supprimée : mettez-la en pause, terminez-la ou annulez-la d’abord.' } }
  if (!force) {
    const d = await db.from('asta_campaign_profiles').select('id', { count: 'exact', head: true }).eq('campaign_id', id).eq('status', 'do_not_contact')
    if (d.error) return { status: 500, body: { error: 'Lecture impossible' } }
    if ((d.count ?? 0) > 0) return { status: 409, body: { needs_force: true, error: `Cette campagne contient ${d.count} profil(s) « Ne pas contacter » : les supprimer retire aussi la protection contre un nouveau contact.` } }
  }
  const u = await db.from('asta_campaigns').delete().eq('id', id).select('id')
  if (u.error) return { status: 500, body: { error: 'Suppression impossible' } }
  if ((u.data ?? []).length === 0) return { status: 409, body: { error: 'Campagne déjà supprimée' } }
  await log(db, 'campaign_deleted', `campaign_deleted:${id}`, { by: adminId, name: c.data.name })
  return { status: 200, body: { ok: true } }
}

export async function deleteProfile(id: string, adminId: string, force: boolean): Promise<R> {
  const db = getServiceClient()
  const p = await db.from('asta_campaign_profiles').select('id, name, status, campaign_id').eq('id', id).maybeSingle()
  if (p.error) return { status: 500, body: { error: 'Lecture impossible' } }
  if (!p.data) return { status: 404, body: { error: 'Profil introuvable' } }
  if (p.data.status === 'do_not_contact' && !force) {
    return { status: 409, body: { needs_force: true, error: 'Ce profil est marqué « Ne pas contacter » : le supprimer retire la protection contre un nouveau contact.' } }
  }
  const u = await db.from('asta_campaign_profiles').delete().eq('id', id).select('id')
  if (u.error) return { status: 500, body: { error: 'Suppression impossible' } }
  if ((u.data ?? []).length === 0) return { status: 409, body: { error: 'Profil déjà supprimé' } }
  await log(db, 'profile_deleted', `profile_deleted:${id}`, { by: adminId, name: p.data.name, campaign_id: p.data.campaign_id })
  return { status: 200, body: { ok: true } }
}

export async function deleteAction(id: string, adminId: string): Promise<R> {
  const db = getServiceClient()
  const a = await db.from('asta_campaign_actions').select('id, title, status, campaign_id').eq('id', id).maybeSingle()
  if (a.error) return { status: 500, body: { error: 'Lecture impossible' } }
  if (!a.data) return { status: 404, body: { error: 'Action introuvable' } }
  const u = await db.from('asta_campaign_actions').delete().eq('id', id).select('id')
  if (u.error) return { status: 500, body: { error: 'Suppression impossible' } }
  if ((u.data ?? []).length === 0) return { status: 409, body: { error: 'Action déjà supprimée' } }
  await log(db, 'action_deleted', `action_deleted:${id}`, { by: adminId, title: a.data.title, campaign_id: a.data.campaign_id })
  return { status: 200, body: { ok: true } }
}
