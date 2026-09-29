import { createHash, randomBytes } from 'crypto'
import { getServiceClient } from '@/lib/platform/supabase-server'
import { DEF, nextQuestion, publicQuestion, validate, score, detectMode, restitution, ackFor, type Answers } from './engine'

type R = { status: number; body: Record<string, unknown> }
type Db = ReturnType<typeof getServiceClient>
const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const fail = (status: number, error: string): R => ({ status, body: { error } })
const TOTAL = DEF.questions.filter((q) => !q.afterResult).length

async function log(db: Db, type: string, session_id: string, payload: object, key: string, prospect_id: string | null = null) {
  await db.from('asta_events').upsert({ type, session_id, prospect_id, payload, idempotency_key: key }, { onConflict: 'idempotency_key', ignoreDuplicates: true })
}
async function findSession(db: Db, token: unknown) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null
  const { data } = await db.from('asta_diagnostic_sessions').select('id, completed_at, prospect_id').eq('token_hash', sha(token)).maybeSingle()
  return data
}
async function loadAnswers(db: Db, id: string): Promise<Answers> {
  const { data } = await db.from('asta_diagnostic_answers').select('question_key, value').eq('session_id', id)
  return Object.fromEntries((data ?? []).map((r) => [r.question_key, r.value]))
}

export async function start(ip: string): Promise<R> {
  const db = getServiceClient()
  const token = randomBytes(32).toString('hex')
  const { data, error } = await db.from('asta_diagnostic_sessions')
    .insert({ definition_version: DEF.version, token_hash: sha(token), ip_hash: sha(ip) }).select('id').single()
  if (error || !data) return fail(500, 'Démarrage impossible')
  await log(db, 'diagnostic_started', data.id, {}, `start:${data.id}`)
  return { status: 200, body: { token, question: publicQuestion(nextQuestion(new Set())!), progress: { done: 0, total: TOTAL } } }
}

export async function answer(token: unknown, key: unknown, value: unknown): Promise<R> {
  const db = getServiceClient()
  const s = await findSession(db, token)
  if (!s) return fail(401, 'Session invalide')
  const q = DEF.questions.find((x) => x.key === key)
  if (!q) return fail(400, 'Question inconnue')
  const v = validate(q, value)
  if (!v.ok) return fail(400, 'Réponse invalide')
  const answers = await loadAnswers(db, s.id)
  const expected = nextQuestion(new Set(Object.keys(answers)))
  if (q.afterResult ? !s.completed_at : expected?.key !== q.key) return fail(409, 'Ordre des questions non respecté')
  await db.from('asta_diagnostic_answers').upsert({ session_id: s.id, question_key: q.key, value: v.value }, { onConflict: 'session_id,question_key' })
  answers[q.key] = v.value
  await log(db, 'question_answered', s.id, { key: q.key }, `ans:${s.id}:${q.key}`)
  if (q.afterResult) return { status: 200, body: { ack: DEF.wish_ack } }

  const ack = ackFor(q)
  const next = nextQuestion(new Set(Object.keys(answers)))
  const progress = { done: Object.keys(answers).length, total: TOTAL }
  if (next) return { status: 200, body: { ack, question: publicQuestion(next), progress } }

  const result = score(answers)
  const mode = detectMode(answers)
  await db.from('asta_diagnostic_results').upsert({ session_id: s.id, scores: result.scores, total: result.total, band: result.band }, { onConflict: 'session_id' })
  await db.from('asta_diagnostic_sessions').update({ completed_at: new Date().toISOString(), mode }).eq('id', s.id)
  await log(db, 'diagnostic_completed', s.id, { total: result.total, mode }, `done:${s.id}`)
  return { status: 200, body: { ack, progress, result: { ...result, ...restitution(result, mode) } } }
}

export async function lead(token: unknown, b: Record<string, unknown>): Promise<R> {
  const db = getServiceClient()
  const s = await findSession(db, token)
  if (!s || !s.completed_at) return fail(401, 'Session invalide')
  const name = typeof b.full_name === 'string' ? b.full_name.trim() : ''
  const phone = typeof b.whatsapp === 'string' ? b.whatsapp.replace(/[\s.\-()]/g, '') : ''
  if (name.length < 2 || name.length > 80) return fail(400, 'Nom invalide')
  if (!/^\+?[0-9]{8,15}$/.test(phone)) return fail(400, 'Numéro WhatsApp invalide')
  if (b.consent !== true) return fail(400, 'Le consentement est requis')
  if (s.prospect_id) return { status: 200, body: { ok: true } }

  const a = await loadAnswers(db, s.id)
  const now = new Date().toISOString()
  const found = await db.from('asta_prospects').select('id').eq('whatsapp', phone).maybeSingle()
  let pid: string | null = found.data?.id ?? null
  if (!pid) {
    const ins = await db.from('asta_prospects').insert({
      full_name: name, whatsapp: phone, country: a.q10, sector: a.q11, company_age: a.q12,
      stage: 'diagnostic_termine', next_action: 'envoyer_feuille_de_route', next_action_at: now,
      consent_at: now, consent_text: DEF.consent_text,
    }).select('id').single()
    if (ins.error || !ins.data) return fail(500, 'Enregistrement impossible')
    pid = ins.data.id
  }
  await db.from('asta_diagnostic_sessions').update({ prospect_id: pid }).eq('id', s.id)
  await log(db, 'lead_captured', s.id, { stage: 'diagnostic_termine' }, `lead:${s.id}`, pid)
  return { status: 200, body: { ok: true } }
}
