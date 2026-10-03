import { getServiceClient } from '@/lib/platform/supabase-server'
import { makeCode, dedupeKey, cleanContact, type CampaignInput } from './campaign'
import { extractJsonArray, filterCandidates } from './candidates'
import { proposePosts, draftMessage, type Camp } from './content'
import { generate } from '../ai/gemini'
import { reserve } from './budget'

type Db = ReturnType<typeof getServiceClient>
type Row = Record<string, any>
export type R = { status: number; body: Record<string, unknown> }
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://cabinet-douke.vercel.app'
const OPEN = ['proposed', 'accepted', 'contacted', 'replied', 'meeting']
const chunk = <T,>(a: T[], n: number): T[][] => { const o: T[][] = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o }
const now = () => new Date().toISOString()
const num = (v: unknown): number | null => { const n = Number(v); return v !== '' && v != null && Number.isInteger(n) && n >= 0 && n <= 1000000 ? n : null }
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k)
async function ev(db: Db, type: string, key: string, payload: Record<string, unknown>) {
  await db.from('asta_events').upsert({ type, payload, idempotency_key: key }, { onConflict: 'idempotency_key', ignoreDuplicates: true })
}

export async function createCampaign(input: CampaignInput, adminId: string): Promise<R> {
  const db = getServiceClient()
  for (let i = 0; i < 5; i++) {
    const ins = await db.from('asta_campaigns').insert({ ...input, code: makeCode(), created_by: adminId }).select('*').single()
    if (!ins.error) { await ev(db, 'campaign_created', `campaign_created:${ins.data.id}`, { type: input.type }); return { status: 201, body: { campaign: ins.data } } }
    if (ins.error.code !== '23505') break
  }
  return { status: 500, body: { error: 'Création impossible' } }
}

export async function listCampaigns() {
  const db = getServiceClient()
  const c = await db.from('asta_campaigns').select('*').order('created_at', { ascending: false }).limit(100)
  if (c.error) throw new Error('lecture')
  const camps: Row[] = c.data ?? []
  const ids = camps.map((x) => x.id as string)
  let prof: Row[] = [], act: Row[] = []
  if (ids.length) {
    const [p, a] = await Promise.all([
      db.from('asta_campaign_profiles').select('campaign_id, status').in('campaign_id', ids).limit(5000),
      db.from('asta_campaign_actions').select('campaign_id, status').in('campaign_id', ids).limit(5000),
    ])
    if (p.error || a.error) throw new Error('lecture')
    prof = p.data ?? []; act = a.data ?? []
  }
  const count = (rows: Row[], id: string) => { const o: Record<string, number> = {}; rows.filter((r) => r.campaign_id === id).forEach((r) => { o[r.status] = (o[r.status] ?? 0) + 1 }); return o }
  return {
    campaigns: camps.map((x) => ({ ...x, profiles: count(prof, x.id), actions: count(act, x.id) })),
    summary: {
      active: camps.filter((x) => x.status === 'active').length,
      profiles_proposed: prof.filter((x) => x.status === 'proposed').length,
      actions_to_approve: act.filter((x) => x.status === 'proposed').length,
    },
  }
}

async function stats(db: Db, c: Row, profiles: Row[], actions: Row[]) {
  const s = await db.from('asta_diagnostic_sessions').select('id, completed_at').eq('campaign_code', c.code).limit(1000)
  const sess: Row[] = s.data ?? []
  let leads = 0
  for (const part of chunk(sess.map((x) => x.id as string), 100)) {
    const e = await db.from('asta_events').select('id', { count: 'exact', head: true }).eq('type', 'lead_captured').in('session_id', part)
    leads += e.count ?? 0
  }
  const sum = (k: string) => actions.reduce((t, a) => t + (Number(a[k]) || 0), 0)
  const by = (st: string) => profiles.filter((p) => p.status === st).length
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null)
  const sent = sum('sent_count'), replies = sum('reply_count'), meetings = sum('meeting_count')
  const kept = profiles.filter((p) => ['accepted', 'contacted', 'replied', 'meeting'].includes(p.status)).length
  return {
    tracking: { started: sess.length, completed: sess.filter((x) => x.completed_at).length, leads },
    profiles: { total: profiles.length, proposed: by('proposed'), accepted: by('accepted'), contacted: by('contacted'), replied: by('replied'), meeting: by('meeting'), rejected: by('rejected') },
    actions: { total: actions.length, done: actions.filter((a) => a.status === 'done').length, sent, replies, meetings, reply_rate: pct(replies, sent), meeting_rate: pct(meetings, sent) },
    target: c.target_count, progress: pct(kept, c.target_count),
  }
}

export async function getCampaign(id: string): Promise<Record<string, unknown> | null> {
  const db = getServiceClient()
  const c = await db.from('asta_campaigns').select('*').eq('id', id).maybeSingle()
  if (c.error) throw new Error('lecture')
  if (!c.data) return null
  const [p, a] = await Promise.all([
    db.from('asta_campaign_profiles').select('*').eq('campaign_id', id).order('created_at', { ascending: false }).limit(500),
    db.from('asta_campaign_actions').select('*').eq('campaign_id', id).order('scheduled_at', { ascending: true }).limit(300),
  ])
  if (p.error || a.error) throw new Error('lecture')
  const profiles: Row[] = p.data ?? [], actions: Row[] = a.data ?? []
  return { campaign: c.data, profiles, actions, stats: await stats(db, c.data, profiles, actions) }
}

const TRANS: Record<string, { from: string[]; to: string }> = {
  validate: { from: ['draft'], to: 'active' }, pause: { from: ['active'], to: 'paused' }, resume: { from: ['paused'], to: 'active' },
  complete: { from: ['active', 'paused'], to: 'completed' }, cancel: { from: ['draft', 'active', 'paused'], to: 'cancelled' },
}
export async function setStatus(id: string, op: string, adminId: string): Promise<R> {
  if (!has(TRANS, op)) return { status: 400, body: { error: 'Opération inconnue' } }
  const db = getServiceClient()
  const c = await db.from('asta_campaigns').select('id, status').eq('id', id).maybeSingle()
  if (c.error) return { status: 500, body: { error: 'Lecture impossible' } }
  if (!c.data) return { status: 404, body: { error: 'Campagne introuvable' } }
  const t = TRANS[op]
  if (!t.from.includes(c.data.status)) return { status: 409, body: { error: 'Cette campagne ne peut pas passer à cet état' } }
  const patch: Row = { status: t.to }
  if (op === 'validate') { patch.validated_by = adminId; patch.validated_at = now() }
  const u = await db.from('asta_campaigns').update(patch).eq('id', id).eq('status', c.data.status).select('id')
  if (u.error) return { status: 500, body: { error: 'Mise à jour impossible' } }
  if ((u.data ?? []).length === 0) return { status: 409, body: { error: 'Campagne modifiée entre-temps' } }
  await ev(db, `campaign_${t.to}`, `campaign_${t.to}:${id}:${Date.now()}`, { by: adminId })
  return { status: 200, body: { ok: true, status: t.to } }
}

const SYS_DISCOVERY = `Tu es ASTA, analyste commerciale de DOUKE Growth & Funding (Bénin, Afrique de l'Ouest). Utilise la recherche web pour trouver des ORGANISATIONS réelles (entreprises, PME, coopératives, ONG) correspondant à la demande.
Réponds UNIQUEMENT par un tableau JSON, sans texte autour. Chaque élément : {"name": nom de l'organisation, "sector": secteur, "city": ville, "source_url": URL https de la page où tu as trouvé l'information, "public_contact": e-mail ou téléphone PROFESSIONNEL publié sur cette page, sinon null, "reason": pourquoi elle correspond (1 phrase), "fit": 0 à 100}.
Règles strictes : n'invente jamais un nom, une URL, un e-mail ou un téléphone ; ne devine jamais un contact ; pas de personnes privées ; pas de données issues de réseaux sociaux personnels ; si tu n'es pas sûre, n'inclus pas l'élément ; moins d'éléments vaut mieux que des éléments douteux.`

export async function discover(db: Db, c: Row, max = 8): Promise<{ added: number; dropped: number; note: string | null }> {
  if (c.type === 'publication') return { added: 0, dropped: 0, note: 'Une campagne de publication ne cherche pas de profils.' }
  const pr = await db.from('asta_campaign_profiles').select('dedupe_key, status, prospect_id').eq('campaign_id', c.id).limit(2000)
  if (pr.error) throw new Error('lecture')
  const rows: Row[] = pr.data ?? []
  const limit = Math.min(max, c.target_count - rows.filter((x) => OPEN.includes(x.status)).length)
  if (limit <= 0) return { added: 0, dropped: 0, note: 'Objectif atteint.' }

  if (c.type === 'relance') {
    const p = await db.from('asta_prospects').select('id, full_name, sector, whatsapp')
      .not('consent_at', 'is', null).eq('do_not_contact', false).neq('stage', 'client').order('created_at', { ascending: false }).limit(200)
    if (p.error) throw new Error('lecture')
    const known = new Set<string>(rows.map((x) => x.prospect_id).filter(Boolean))
    const cand: Row[] = (p.data ?? []).filter((x: Row) => !known.has(x.id)).slice(0, limit)
    if (cand.length === 0) return { added: 0, dropped: 0, note: 'Aucun prospect éligible (consentement requis).' }
    const ss = await db.from('asta_diagnostic_sessions').select('id, prospect_id').in('prospect_id', cand.map((x) => x.id)).not('completed_at', 'is', null)
    const sess: Row[] = ss.data ?? []
    let results: Row[] = []
    if (sess.length) { const r = await db.from('asta_diagnostic_results').select('session_id, total').in('session_id', sess.map((x) => x.id)); results = r.data ?? [] }
    const score = (pid: string) => { const sid = sess.find((x) => x.prospect_id === pid)?.id; return results.find((r) => r.session_id === sid)?.total as number | undefined }
    const ins = await db.from('asta_campaign_profiles').upsert(cand.map((x) => ({
      campaign_id: c.id, prospect_id: x.id, dedupe_key: `p:${x.id}`, name: x.full_name || 'Prospect', sector: x.sector ?? null, public_contact: cleanContact(x.whatsapp),
      reason: 'A terminé le diagnostic DOUKE et accepté d’être recontacté', fit_score: score(x.id) ?? null,
    })), { onConflict: 'campaign_id,dedupe_key', ignoreDuplicates: true }).select('id')
    if (ins.error) throw new Error('écriture')
    await ev(db, 'profiles_proposed', `profiles_proposed:${c.id}:${Date.now()}`, { count: (ins.data ?? []).length, type: 'relance' })
    return { added: (ins.data ?? []).length, dropped: 0, note: null }
  }

  if (!(await reserve('discovery'))) return { added: 0, dropped: 0, note: 'Plafond quotidien de recherches atteint.' }
  const existing = new Set<string>(rows.map((x) => x.dedupe_key))
  const dnc = await db.from('asta_campaign_profiles').select('dedupe_key').eq('status', 'do_not_contact').limit(2000)
  ;(dnc.data ?? []).forEach((x: Row) => existing.add(x.dedupe_key))
  const ask = `Campagne "${c.name}". Service DOUKE proposé : ${c.service}. Zone : ${c.zone}. Secteur : ${c.sector || 'tous secteurs'}.${c.conditions ? ' Conditions : ' + c.conditions + '.' : ''} Trouve jusqu'à ${limit} organisations de cette zone ayant un besoin plausible pour ce service.`
  const g = await generate({ system: SYS_DISCOVERY, contents: [{ role: 'user', text: ask }], search: true, maxTokens: 3000, temperature: 0.2 })
  const { kept, dropped } = filterCandidates(extractJsonArray(g.text), g.sources, existing, limit)
  if (kept.length === 0) return { added: 0, dropped, note: g.sources.length === 0 ? 'Recherche sans sources vérifiables : rien proposé.' : null }
  const ins = await db.from('asta_campaign_profiles').upsert(kept.map((k) => ({ campaign_id: c.id, ...k })), { onConflict: 'campaign_id,dedupe_key', ignoreDuplicates: true }).select('id')
  if (ins.error) throw new Error('écriture')
  await ev(db, 'profiles_proposed', `profiles_proposed:${c.id}:${Date.now()}`, { count: (ins.data ?? []).length, dropped, type: 'prospection' })
  return { added: (ins.data ?? []).length, dropped, note: null }
}

export async function runDiscovery(id: string): Promise<R> {
  const db = getServiceClient()
  const c = await db.from('asta_campaigns').select('*').eq('id', id).maybeSingle()
  if (c.error) return { status: 500, body: { error: 'Lecture impossible' } }
  if (!c.data) return { status: 404, body: { error: 'Campagne introuvable' } }
  if (c.data.status !== 'active') return { status: 409, body: { error: 'La campagne doit être validée (active) pour chercher des profils' } }
  try { return { status: 200, body: await discover(db, c.data) } }
  catch (e) { console.error('asta discover', e); return { status: 502, body: { error: 'Recherche indisponible, réessayez plus tard' } } }
}

export async function proposeActions(id: string): Promise<R> {
  const db = getServiceClient()
  const c = await db.from('asta_campaigns').select('*').eq('id', id).maybeSingle()
  if (c.error) return { status: 500, body: { error: 'Lecture impossible' } }
  if (!c.data) return { status: 404, body: { error: 'Campagne introuvable' } }
  if (!['draft', 'active', 'paused'].includes(c.data.status)) return { status: 409, body: { error: 'Campagne terminée ou annulée' } }
  const rows: Row[] = []
  if (c.data.type === 'publication') {
    proposePosts(c.data as Camp, SITE).forEach((p) => rows.push({ campaign_id: id, slot_key: p.slot_key, kind: 'publication', title: p.title, content: p.content, scheduled_at: p.scheduled_at }))
  } else {
    const p = await db.from('asta_campaign_profiles').select('*').eq('campaign_id', id).eq('status', 'accepted').limit(200)
    if (p.error) return { status: 500, body: { error: 'Lecture impossible' } }
    ;(p.data ?? []).forEach((x: Row) => rows.push({ campaign_id: id, profile_id: x.id, slot_key: `msg:${x.id}`, kind: 'message', title: `Message à ${x.name}`.slice(0, 120), content: { draft: draftMessage(c.data as Camp, x as { name: string; sector?: string | null; city?: string | null }), contact: x.public_contact ?? null } }))
  }
  if (rows.length === 0) return { status: 200, body: { created: 0, note: 'Aucun profil accepté pour lequel préparer un message.' } }
  const ins = await db.from('asta_campaign_actions').upsert(rows, { onConflict: 'campaign_id,slot_key', ignoreDuplicates: true }).select('id')
  if (ins.error) return { status: 500, body: { error: 'Création impossible' } }
  await ev(db, 'actions_proposed', `actions_proposed:${id}:${Date.now()}`, { count: (ins.data ?? []).length })
  return { status: 200, body: { created: (ins.data ?? []).length } }
}

const PROF: Record<string, { from: string[]; to: string }> = {
  accept: { from: ['proposed'], to: 'accepted' }, reject: { from: ['proposed', 'accepted'], to: 'rejected' },
  contacted: { from: ['accepted'], to: 'contacted' }, replied: { from: ['contacted'], to: 'replied' },
  meeting: { from: ['contacted', 'replied'], to: 'meeting' },
  dnc: { from: ['proposed', 'accepted', 'rejected', 'contacted', 'replied', 'meeting'], to: 'do_not_contact' },
}
export async function decideProfile(id: string, op: string, adminId: string): Promise<R> {
  if (!has(PROF, op)) return { status: 400, body: { error: 'Opération inconnue' } }
  const db = getServiceClient()
  const p = await db.from('asta_campaign_profiles').select('id, status, prospect_id').eq('id', id).maybeSingle()
  if (p.error) return { status: 500, body: { error: 'Lecture impossible' } }
  if (!p.data) return { status: 404, body: { error: 'Profil introuvable' } }
  const r = PROF[op]
  if (!r.from.includes(p.data.status)) return { status: 409, body: { error: 'Ce profil ne peut pas passer à cet état' } }
  const patch: Row = { status: r.to }
  if (op === 'contacted') patch.contacted_at = now()
  const u = await db.from('asta_campaign_profiles').update(patch).eq('id', id).eq('status', p.data.status).select('id')
  if (u.error) return { status: 500, body: { error: 'Mise à jour impossible' } }
  if ((u.data ?? []).length === 0) return { status: 409, body: { error: 'Profil modifié entre-temps' } }
  if (op === 'dnc' && p.data.prospect_id) await db.from('asta_prospects').update({ do_not_contact: true }).eq('id', p.data.prospect_id)
  await ev(db, `profile_${r.to}`, `profile_${r.to}:${id}:${Date.now()}`, { by: adminId })
  return { status: 200, body: { ok: true, status: r.to } }
}

const ACT: Record<string, { from: string[]; to: string | null }> = {
  approve: { from: ['proposed'], to: 'approved' }, done: { from: ['approved'], to: 'done' },
  cancel: { from: ['proposed', 'approved'], to: 'cancelled' }, stats: { from: ['approved', 'done'], to: null },
}
export async function decideAction(id: string, op: string, b: Record<string, unknown>, adminId: string): Promise<R> {
  if (!has(ACT, op)) return { status: 400, body: { error: 'Opération inconnue' } }
  const db = getServiceClient()
  const a = await db.from('asta_campaign_actions').select('id, status').eq('id', id).maybeSingle()
  if (a.error) return { status: 500, body: { error: 'Lecture impossible' } }
  if (!a.data) return { status: 404, body: { error: 'Action introuvable' } }
  const r = ACT[op]
  if (!r.from.includes(a.data.status)) return { status: 409, body: { error: 'Cette action ne peut pas passer à cet état' } }
  const patch: Row = { decided_by: adminId, decided_at: now() }
  if (r.to) patch.status = r.to
  if (op === 'done' || op === 'stats') {
    for (const [field, key] of [['sent_count', 'sent'], ['reply_count', 'replies'], ['meeting_count', 'meetings']] as const) {
      if (b[key] === undefined) continue
      const n = num(b[key]); if (n === null) return { status: 400, body: { error: 'Les résultats doivent être des entiers positifs' } }
      patch[field] = n
    }
  }
  const u = await db.from('asta_campaign_actions').update(patch).eq('id', id).eq('status', a.data.status).select('id')
  if (u.error) return { status: 500, body: { error: 'Mise à jour impossible' } }
  if ((u.data ?? []).length === 0) return { status: 409, body: { error: 'Action modifiée entre-temps' } }
  await ev(db, `action_${r.to ?? 'stats'}`, `action_${r.to ?? 'stats'}:${id}:${Date.now()}`, { by: adminId })
  return { status: 200, body: { ok: true } }
}
