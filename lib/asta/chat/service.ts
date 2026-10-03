import { getServiceClient } from '@/lib/platform/supabase-server'
import { generate } from '../ai/gemini'
import { reserve } from '../ops/budget'
import { buildSystem, trimHistory, guardOutput, FALLBACK, CHAT_CONSENT } from './persona'

type R = { status: number; body: Record<string, unknown> }
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://cabinet-douke.vercel.app'

async function ev(type: string, payload: Record<string, unknown>, prospect_id: string | null = null) {
  try {
    await getServiceClient().from('asta_events').upsert({ type, prospect_id, payload, idempotency_key: `${type}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}` }, { onConflict: 'idempotency_key', ignoreDuplicates: true })
  } catch { /* le journal ne doit jamais bloquer la conversation */ }
}

export async function chatTurn(b: Record<string, unknown>): Promise<R> {
  const hist = trimHistory(b.messages)
  if (hist.length === 0 || hist[hist.length - 1].role !== 'user') return { status: 400, body: { error: 'Message invalide' } }
  if (!(await reserve('chat'))) return { status: 200, body: { reply: FALLBACK, handoff: true } }
  let reply = FALLBACK, handoff = true
  try {
    const sv = await getServiceClient().from('scout_services_douke').select('nom, description, structures').eq('actif', true).limit(30)
    const rows = (sv.data ?? []) as { nom?: string | null; description?: string | null; structures?: string | null }[]
    const catalog = rows
      .filter((s) => String(s.structures ?? 'DOUKE').toUpperCase().includes('DOUKE'))
      .slice(0, 10)
      .map((s) => `- ${String(s.nom ?? '').slice(0, 80)} : ${String(s.description ?? '').slice(0, 160)}`)
      .join('\n')
    const g = await generate({ system: buildSystem(catalog), contents: hist.map((t) => ({ role: t.role === 'user' ? 'user' as const : 'model' as const, text: t.text })), maxTokens: 400, temperature: 0.6, timeoutMs: 25000 })
    const out = guardOutput(g.text, SITE)
    reply = out.text; handoff = out.handoff
  } catch (e) { console.error('asta chat', e) }
  await ev('chat_turn', { in: hist[hist.length - 1].text.length, out: reply.length, handoff })
  return { status: 200, body: { reply, handoff } }
}

export async function handoff(b: Record<string, unknown>): Promise<R> {
  const name = typeof b.full_name === 'string' ? b.full_name.replace(/\s+/g, ' ').trim() : ''
  const phone = typeof b.whatsapp === 'string' ? b.whatsapp.replace(/[\s.\-()]/g, '') : ''
  if (name.length < 2 || name.length > 80) return { status: 400, body: { error: 'Nom invalide' } }
  if (!/^\+?[0-9]{8,15}$/.test(phone)) return { status: 400, body: { error: 'Numéro WhatsApp invalide' } }
  if (b.consent !== true) return { status: 400, body: { error: 'Le consentement est requis' } }
  const db = getServiceClient()
  const now = new Date().toISOString()
  // whatsapp n'est pas unique en base : on prend la ligne la plus récente, avec ou sans le « + ».
  const variants = Array.from(new Set([phone, phone.startsWith('+') ? phone.slice(1) : '+' + phone]))
  const found = await db.from('asta_prospects').select('id').in('whatsapp', variants).order('created_at', { ascending: false }).limit(1)
  if (found.error) return { status: 500, body: { error: 'Enregistrement impossible' } }
  let pid: string | null = found.data && found.data.length > 0 ? String(found.data[0].id) : null
  if (pid) {
    const up = await db.from('asta_prospects').update({ next_action: 'rappel_humain', next_action_at: now, consent_at: now, consent_text: CHAT_CONSENT }).eq('id', pid)
    if (up.error) return { status: 500, body: { error: 'Enregistrement impossible' } }
  } else {
    const ins = await db.from('asta_prospects').insert({ full_name: name, whatsapp: phone, stage: 'nouveau', source: 'chat', next_action: 'rappel_humain', next_action_at: now, consent_at: now, consent_text: CHAT_CONSENT }).select('id').single()
    if (ins.error || !ins.data) return { status: 500, body: { error: 'Enregistrement impossible' } }
    pid = String(ins.data.id)
  }
  await ev('human_handoff', { source: 'chat' }, pid)
  return { status: 200, body: { ok: true } }
}
