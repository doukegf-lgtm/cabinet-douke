import { getServiceClient } from '@/lib/platform/supabase-server'
import { validateEdit } from './edit'

type R = { status: number; body: Record<string, unknown> }

export async function editAction(id: string, b: Record<string, unknown>, adminId: string): Promise<R> {
  const db = getServiceClient()
  const a = await db.from('asta_campaign_actions').select('id, status, kind, slot_key, content').eq('id', id).maybeSingle()
  if (a.error) return { status: 500, body: { error: 'Lecture impossible' } }
  if (!a.data) return { status: 404, body: { error: 'Action introuvable' } }
  if (!['proposed', 'approved'].includes(a.data.status)) return { status: 409, body: { error: 'Cette action n’est plus modifiable' } }
  const cur = (a.data.content && typeof a.data.content === 'object' ? a.data.content : {}) as Record<string, unknown>
  const v = validateEdit(String(a.data.kind), String(a.data.slot_key), cur, b)
  if (!v.ok) return { status: 400, body: { error: v.error } }
  const patch: Record<string, unknown> = { content: v.content }
  if (v.title) patch.title = v.title
  const u = await db.from('asta_campaign_actions').update(patch).eq('id', id).eq('status', a.data.status).select('id')
  if (u.error) return { status: 500, body: { error: 'Mise à jour impossible' } }
  if ((u.data ?? []).length === 0) return { status: 409, body: { error: 'Action modifiée entre-temps' } }
  try {
    await db.from('asta_events').upsert({ type: 'action_edited', payload: { by: adminId }, idempotency_key: `action_edited:${id}:${Date.now()}` }, { onConflict: 'idempotency_key', ignoreDuplicates: true })
  } catch { /* le journal ne bloque jamais */ }
  return { status: 200, body: { ok: true } }
}
