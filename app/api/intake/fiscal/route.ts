// À placer dans : app/api/intake/fiscal/route.ts
// Reçoit le formulaire web, valide strictement, enregistre (fiscal_web_intakes) et notifie le cabinet par email.
import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import nodemailer from 'nodemailer'
import { getServiceClient } from '@/lib/platform/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BODY = 250_000
const ORIGINS = (process.env.INTAKE_ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const FULL_EMAIL = process.env.INTAKE_EMAIL_MODE !== 'notify' // 'notify' = alerte sans pièce jointe

type Obj = Record<string, unknown>
class Bad extends Error {}
function bad(m: string): never { throw new Bad(m) }
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)

const MONEY = /^\d{1,15}(\.\d{1,2})?$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const EST_REF = /^DK-\d{6}-[A-Z0-9]{4}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MODES = ['actual', 'estimated'] as const
const AMOUNTS = ['ca_fiscal_ht', 'charges_comptables', 'charges_deductibles_justifiees', 'reintegrations_fiscales', 'deductions_fiscales', 'acomptes_is_justifies', 'credits_is_valides']

function txt(v: unknown, l: string, max: number, req = false): string | null {
  if (v === undefined || v === null) return req ? bad(`${l} : obligatoire.`) : null
  if (typeof v !== 'string') return bad(`${l} : texte attendu.`)
  const t = v.trim()
  if (!t) return req ? bad(`${l} : obligatoire.`) : null
  if (t.length > max) return bad(`${l} : ${max} caractères maximum.`)
  return t
}
function money(v: unknown, l: string, req = false): string | null {
  const t = txt(v, l, 20, req)
  if (t !== null && !MONEY.test(t)) bad(`${l} : montant invalide (chiffres, 2 décimales maximum).`)
  return t
}
function validDate(s: string): boolean {
  if (!DATE.test(s)) return false
  const d = new Date(`${s}T00:00:00.000Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}
function date(v: unknown, l: string, req = false): string | null {
  const t = txt(v, l, 10, req)
  if (t !== null && !validDate(t)) bad(`${l} : date invalide.`)
  return t
}
function month(v: unknown, l: string, req = false): string | null {
  const t = txt(v, l, 7, req)
  if (t !== null && !MONTH.test(t)) bad(`${l} : mois invalide (AAAA-MM).`)
  return t
}
function pick<T extends string>(v: unknown, l: string, list: readonly T[]): T {
  if (typeof v !== 'string' || !list.includes(v as T)) return bad(`${l} : valeur invalide.`)
  return v as T
}
function flag(v: unknown, l: string): boolean {
  if (typeof v !== 'boolean') return bad(`${l} : réponse oui/non attendue.`)
  return v
}
function only(o: Obj, keys: string[], l: string): void {
  for (const k of Object.keys(o)) if (!keys.includes(k)) bad(`${l} : champ non autorisé.`)
}
function rows(v: unknown, l: string, max: number): Obj[] {
  if (v === undefined || v === null) return []
  if (!Array.isArray(v)) return bad(`${l} : liste attendue.`)
  if (v.length > max) return bad(`${l} : ${max} lignes maximum.`)
  return v.map((r, i) => (isObj(r) ? r : bad(`${l}, ligne ${i + 1} : objet attendu.`)))
}
function ratio(v: unknown): string | null {
  const t = txt(v, 'Taux accidents du travail', 10)
  if (t === null) return null
  const s = t.replace(',', '.').replace('%', '').trim()
  if (!/^\d{1,3}(\.\d{1,4})?$/.test(s) || Number(s) > 100) return bad('Taux accidents du travail : pourcentage invalide (ex. 2 ou 2,5).')
  const r = (Math.round(Number(s) * 10000) / 1000000).toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
  return r === '1' ? '1.0' : r
}

type Col = { k: string; t: 'text' | 'month' | 'date' | 'money' | 'bool' | 'enum'; req?: boolean; opts?: readonly string[]; max?: number }
const EMP: Col = { k: 'employee_id', t: 'text', req: true, max: 100 }
const SPEC: Record<'cnss' | 'its' | 'aib' | 'wh', { label: string; code: string; max: number; cols: Col[] }> = {
  cnss: { label: 'Paie CNSS', code: 'cnss_periods', max: 300, cols: [EMP,
    { k: 'period', t: 'month', req: true }, { k: 'gross', t: 'money' }, { k: 'bonuses', t: 'money' }, { k: 'benefits', t: 'money' },
    { k: 'payment', t: 'enum', req: true, opts: ['yes', 'no', 'partial'] }, { k: 'amount_paid', t: 'money' }, { k: 'payment_date', t: 'date' }] },
  its: { label: 'ITS / VPS', code: 'its_vps', max: 300, cols: [EMP,
    { k: 'month', t: 'month', req: true }, { k: 'its_base', t: 'money', req: true }, { k: 'vps_exempt', t: 'bool' },
    { k: 'its_withheld', t: 'money' }, { k: 'its_paid', t: 'money' }, { k: 'vps_declared', t: 'money' }, { k: 'vps_paid', t: 'money' }] },
  aib: { label: 'AIB', code: 'aib', max: 200, cols: [
    { k: 'reference', t: 'text', req: true, max: 100 }, { k: 'date', t: 'date', req: true },
    { k: 'op_type', t: 'enum', req: true, opts: ['import', 'services', 'wholesale_goods', 'goods_supply'] }, { k: 'has_ifu', t: 'bool' },
    { k: 'base', t: 'money', req: true }, { k: 'reversed', t: 'money', req: true }, { k: 'credit', t: 'money', req: true }, { k: 'suffered', t: 'money' }] },
  wh: { label: 'Retenues à la source', code: 'withholding', max: 200, cols: [
    { k: 'reference', t: 'text', req: true, max: 100 }, { k: 'date', t: 'date', req: true },
    { k: 'kind', t: 'enum', req: true, opts: ['non_resident', 'other'] }, { k: 'payee_type', t: 'enum', opts: ['natural', 'legal'] },
    { k: 'exemption_claimed', t: 'bool' }, { k: 'base', t: 'money', req: true }, { k: 'reversed', t: 'money', req: true }] },
}
function line(r: Obj, cols: Col[], l: string): Obj {
  only(r, cols.map((c) => c.k), l)
  const o: Obj = {}
  for (const c of cols) {
    const w = `${l} ${c.k}`
    const v = r[c.k]
    if (c.t === 'bool') o[c.k] = flag(v, w)
    else if (c.t === 'money') o[c.k] = money(v, w, c.req)
    else if (c.t === 'month') o[c.k] = month(v, w, c.req)
    else if (c.t === 'date') o[c.k] = date(v, w, c.req)
    else if (c.t === 'enum') {
      if (v === undefined || v === null || v === '') { if (c.req) bad(`${w} : obligatoire.`); o[c.k] = null }
      else o[c.k] = pick(v, w, c.opts as readonly string[])
    } else o[c.k] = txt(v, w, c.max ?? 100, c.req)
  }
  return o
}

function build(body: unknown) {
  const b = isObj(body) ? body : bad('Données invalides.')
  only(b, ['v', 'estimate_ref', 'consent', 'consent_version', 'website', 'scope', 'client', 'dossier', 'groups'], 'Envoi')
  if (b.v !== 1) bad('Version de formulaire non prise en charge.')
  if (b.consent !== true) bad('Votre accord est obligatoire pour envoyer le dossier.')
  const consentVersion = txt(b.consent_version, 'Version de l’accord', 20, true) as string
  const estimateRef = txt(b.estimate_ref, 'Référence d’estimation', 20)
  if (estimateRef && !EST_REF.test(estimateRef)) bad('Référence d’estimation invalide.')
  const scope = pick(b.scope, 'Régularisation souhaitée', ['fiscal', 'social', 'both'] as const)

  const cl = isObj(b.client) ? b.client : bad('Identité manquante.')
  only(cl, ['legal_name', 'ifu', 'rccm', 'phone', 'email', 'address'], 'Identité')
  const email = txt(cl.email, 'Email', 254)
  if (email && !EMAIL.test(email)) bad('Adresse email invalide.')
  const phone = txt(cl.phone, 'Téléphone', 40)
  if (!email && !phone) bad('Indiquez au moins un email ou un téléphone.')
  const client = { legal_name: txt(cl.legal_name, 'Raison sociale', 200, true) as string, ifu: txt(cl.ifu, 'IFU', 50), rccm: txt(cl.rccm, 'RCCM', 100), phone, email, address: txt(cl.address, 'Adresse', 500) }

  const ds = isObj(b.dossier) ? b.dossier : bad('Période manquante.')
  only(ds, ['period_start', 'period_end', 'notes'], 'Période')
  const start = date(ds.period_start, 'Début de période', true) as string
  const end = date(ds.period_end, 'Fin de période', true) as string
  if (end < start) bad('La fin de période doit suivre le début.')
  const y0 = Number(start.slice(0, 4)), y1 = Number(end.slice(0, 4))
  if (y0 < 2000 || y1 > 2100) bad('La période doit se situer entre 2000 et 2100.')
  const dossier = { dossier_type: scope === 'social' ? 'regularisation_sociale' : 'regularisation_fiscale', period_start: start, period_end: end, notes: txt(ds.notes, 'Message', 5000) }

  const gr = b.groups === undefined ? {} : (isObj(b.groups) ? b.groups : bad('Sections invalides.'))
  only(gr, ['annual', 'tax', 'social', 'pay', 'cnss', 'its', 'aib', 'wh'], 'Sections')
  const g = (k: string): Obj | null => (gr[k] === undefined ? null : (isObj(gr[k]) ? (gr[k] as Obj) : bad(`${k} : objet attendu.`)))
  const sections: Obj[] = []
  const counts: Record<string, number> = {}
  const FY = y1 // hypothèse : fiscal_year des sections non annuelles = année de fin de période
  const push = (code: string, fy: number, mode: string, data: Obj, n: number) => {
    sections.push({ section_code: code, fiscal_year: fy, payload: { source_mode: mode, source_note: null, data } })
    counts[code] = n
  }

  const an = g('annual')
  if (an) {
    only(an, ['rows'], 'Chiffres annuels')
    const seen = new Set<number>()
    rows(an.rows, 'Chiffres annuels', 30).forEach((r, i) => {
      const l = `Chiffres annuels, exercice ${i + 1}`
      only(r, ['fiscal_year', 'mode', ...AMOUNTS], l)
      const fy = r.fiscal_year
      if (typeof fy !== 'number' || !Number.isInteger(fy) || fy < y0 || fy > y1) bad(`${l} : exercice hors de la période.`)
      if (seen.has(fy as number)) bad(`${l} : exercice en double.`)
      seen.add(fy as number)
      const p: Obj = { source_mode: pick(r.mode, `${l} nature des données`, MODES), source_note: null }
      for (const k of AMOUNTS) p[k] = money(r[k], `${l} ${k}`)
      sections.push({ section_code: 'annual_figures', fiscal_year: fy, payload: p })
      counts.annual_figures = (counts.annual_figures ?? 0) + 1
    })
  }

  const debtIds = new Set<string>()
  const debts = (key: 'tax' | 'social', code: string, prefix: string, org: string, label: string) => {
    const d = g(key)
    if (!d) return
    only(d, ['mode', 'rows'], label)
    const m = pick(d.mode, `${label} nature des données`, MODES)
    const list = rows(d.rows, label, 100).map((r, i) => {
      const l = `${label}, ligne ${i + 1}`
      only(r, ['nature', 'period', 'principal', 'penalty', 'interest', 'credits'], l)
      const id = `${prefix}${i + 1}`
      debtIds.add(id)
      const o: Obj = { id, organism: org, nature: txt(r.nature, `${l} nature`, 80, true), period: txt(r.period, `${l} période`, 40, true) }
      const pr = money(r.principal, `${l} montant dû`), pe = money(r.penalty, `${l} pénalités`)
      const it = money(r.interest, `${l} intérêts`), cr = money(r.credits, `${l} crédits`)
      if (pr !== null) o[m === 'actual' ? 'principalConfirmed' : 'principalEstimated'] = pr
      if (pe !== null) o[m === 'actual' ? 'penaltyConfirmed' : 'penaltyEstimated'] = pe
      if (it !== null) o.interestConfirmed = it
      if (cr !== null) o.credits = cr
      return o
    })
    if (list.length) push(code, FY, m, { debts: list }, list.length)
  }
  debts('tax', 'tax_operations', 'T', 'DGI', 'Impôts impayés')
  debts('social', 'social_operations', 'S', 'CNSS', 'Cotisations impayées')

  const py = g('pay')
  if (py) {
    only(py, ['mode', 'rows'], 'Paiements')
    const m = pick(py.mode, 'Paiements nature des données', MODES)
    const list = rows(py.rows, 'Paiements', 100).map((r, i) => {
      const l = `Paiement ${i + 1}`
      only(r, ['debt_ref', 'date', 'component', 'amount', 'receipt_ref'], l)
      const ref = txt(r.debt_ref, `${l} dette`, 10, true) as string
      if (!debtIds.has(ref)) bad(`${l} : dette associée introuvable.`)
      return { id: `P${i + 1}`, debt_id: ref, date: date(r.date, `${l} date`, true), component: pick(r.component, `${l} composante`, ['principal', 'penalty', 'interest'] as const), amount: money(r.amount, `${l} montant`, true), verified: false, receipt_ref: txt(r.receipt_ref, `${l} quittance`, 100) }
    })
    if (list.length) push('payments', FY, m, { payments: list }, list.length)
  }

  for (const key of ['cnss', 'its', 'aib', 'wh'] as const) {
    const d = g(key)
    if (!d) continue
    const s = SPEC[key]
    only(d, key === 'cnss' ? ['mode', 'headcount', 'rp_rate_percent', 'rows'] : ['mode', 'rows'], s.label)
    const m = pick(d.mode, `${s.label} nature des données`, MODES)
    const lines = rows(d.rows, s.label, s.max).map((r, i) => line(r, s.cols, `${s.label}, ligne ${i + 1}`))
    if (!lines.length) continue
    const data: Obj = { lines }
    if (key === 'cnss') {
      const hc = d.headcount
      if (typeof hc !== 'number' || !Number.isInteger(hc) || hc < 1 || hc > 9999) bad('Paie CNSS : effectif invalide (entier de 1 à 9999).')
      data.headcount = hc
      data.rp_rate = ratio(d.rp_rate_percent)
    }
    push(s.code, FY, m, data, lines.length)
  }

  // Complétude : ce qui manque est signalé au cabinet, jamais bloquant.
  const missing: string[] = []
  const warnings: string[] = []
  if (!client.ifu) missing.push('Numéro IFU')
  if (!counts.annual_figures) missing.push('Chiffres annuels (IS)')
  if (scope !== 'social' && !counts.tax_operations) missing.push('Dettes d’impôts (DGI)')
  if (scope !== 'fiscal' && !counts.social_operations && !counts.cnss_periods) missing.push('Dettes ou paie CNSS')
  if (counts.payments) warnings.push(`${counts.payments} paiement(s) déclaré(s) : à vérifier sur justificatifs`)
  const est = sections.filter((x) => (x.payload as Obj).source_mode === 'estimated').map((x) => String(x.section_code))
  if (est.length) warnings.push(`Données estimées : ${Array.from(new Set(est)).join(', ')}`)
  warnings.push('Paiement Kkiapay à confirmer manuellement')
  const completeness = { counts, missing, warnings }

  const now = new Date()
  const ymd = now.toISOString().slice(2, 10).replace(/-/g, '')
  const intakeRef = `DKI-${ymd}-${randomBytes(4).toString('hex').toUpperCase().slice(0, 6)}`
  const doc: Obj = {
    schema: 'douke-fiscal-intake-v1', intake_ref: intakeRef, estimate_ref: estimateRef, received_at: now.toISOString(),
    consent: { accepted: true, text_version: consentVersion, at: now.toISOString() },
    scope, client, dossier, sections, completeness,
  }
  return { doc, intakeRef, estimateRef, client, scope, dossier, completeness, consentVersion, receivedAt: now.toISOString() }
}

function summarize(x: ReturnType<typeof build>): string {
  const c = x.client
  const L = [
    `Nouvelle souscription Fiscal-Social : ${x.intakeRef}`,
    `Reçue le : ${x.receivedAt}`,
    x.estimateRef ? `Référence d’estimation : ${x.estimateRef}` : 'Référence d’estimation : non fournie',
    '',
    `Entreprise : ${c.legal_name}`,
    `IFU : ${c.ifu ?? 'non communiqué'}   RCCM : ${c.rccm ?? 'non communiqué'}`,
    `Contact : ${c.email ?? '—'} / ${c.phone ?? '—'}`,
    `Régularisation : ${x.scope === 'both' ? 'impôts et CNSS' : x.scope === 'fiscal' ? 'impôts (DGI)' : 'cotisations (CNSS)'}`,
    `Période : ${x.dossier.period_start} au ${x.dossier.period_end}`,
    '',
    'Blocs renseignés :',
    ...Object.entries(x.completeness.counts).map(([k, n]) => `  - ${k} : ${n}`),
    '',
    'À compléter :', ...(x.completeness.missing.length ? x.completeness.missing.map((m) => `  - ${m}`) : ['  - rien d’évident']),
    '',
    'Points d’attention :', ...x.completeness.warnings.map((m) => `  - ${m}`),
    '',
    FULL_EMAIL ? 'Le dossier structuré est en pièce jointe (JSON).' : 'Dossier disponible dans la table fiscal_web_intakes.',
    'Rien n’a été validé ni importé automatiquement : contrôle obligatoire dans Cabinet DOUKE.',
  ]
  return L.join('\n')
}

async function sendMail(x: ReturnType<typeof build>): Promise<void> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, INTAKE_NOTIFY_TO } = process.env
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !SMTP_FROM || !INTAKE_NOTIFY_TO) throw new Error('smtp_not_configured')
  const port = Number(SMTP_PORT || 587)
  const tr = nodemailer.createTransport({ host: SMTP_HOST, port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } })
  await tr.sendMail({
    from: SMTP_FROM, to: INTAKE_NOTIFY_TO,
    subject: `[DOUKE] Nouvelle souscription Fiscal-Social ${x.intakeRef} - ${x.client.legal_name}`.replace(/[\r\n]+/g, ' '),
    text: summarize(x),
    attachments: FULL_EMAIL ? [{ filename: `${x.intakeRef}.json`, content: JSON.stringify(x.doc, null, 2), contentType: 'application/json' }] : [],
  })
}

const HITS = new Map<string, number[]>()
function limited(ip: string): boolean {
  const now = Date.now()
  const w = (HITS.get(ip) ?? []).filter((t) => now - t < 3_600_000)
  if (w.length >= 6) { HITS.set(ip, w); return true }
  w.push(now)
  HITS.set(ip, w)
  if (HITS.size > 5000) HITS.clear()
  return false
}
function corsHeaders(origin: string): Record<string, string> | null {
  if (!ORIGINS.includes(origin)) return null
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin', 'Cache-Control': 'no-store' }
}
const reply = (data: Obj, status: number, h: Record<string, string>) => NextResponse.json(data, { status, headers: h })

export async function OPTIONS(request: Request) {
  const h = corsHeaders(request.headers.get('origin') ?? '')
  return h ? new NextResponse(null, { status: 204, headers: h }) : new NextResponse(null, { status: 403 })
}

export async function POST(request: Request) {
  const h = corsHeaders(request.headers.get('origin') ?? '')
  if (!h) return NextResponse.json({ error: 'Origine non autorisée.' }, { status: 403 })
  const ip = (request.headers.get('x-forwarded-for') ?? 'inconnu').split(',')[0].trim()
  if (limited(ip)) return reply({ error: 'Trop de tentatives. Réessayez plus tard.' }, 429, h)

  const len = request.headers.get('content-length')
  if (len && /^\d+$/.test(len) && Number(len) > MAX_BODY) return reply({ error: 'Dossier trop volumineux.' }, 413, h)
  let raw = ''
  try { raw = await request.text() } catch { return reply({ error: 'Corps invalide.' }, 400, h) }
  if (raw.length > MAX_BODY) return reply({ error: 'Dossier trop volumineux.' }, 413, h)
  let body: unknown
  try { body = JSON.parse(raw) } catch { return reply({ error: 'Corps JSON invalide.' }, 400, h) }

  // Champ piège : un robot le remplit. Réponse de succès sans rien enregistrer.
  if (isObj(body) && typeof body.website === 'string' && body.website.trim()) return reply({ ok: true, ref: 'DKI-000000-000000' }, 200, h)

  let x: ReturnType<typeof build>
  try { x = build(body) } catch (e) {
    if (e instanceof Bad) return reply({ error: e.message }, 400, h)
    return reply({ error: 'Une erreur est survenue.' }, 500, h)
  }

  let stored = false
  try {
    const { error } = await getServiceClient().from('fiscal_web_intakes').insert({
      intake_ref: x.intakeRef, estimate_ref: x.estimateRef, legal_name: x.client.legal_name,
      contact_email: x.client.email, contact_phone: x.client.phone, scope: x.scope,
      payload: x.doc, completeness: x.completeness, consent_text_version: x.consentVersion, consent_at: x.receivedAt,
    })
    stored = !error
  } catch { stored = false }

  let mailed = false
  let mailError: string | null = null
  try { await sendMail(x); mailed = true } catch (e) { mailError = String((e as Error)?.message ?? 'erreur').slice(0, 200) }

  if (stored) {
    try { await getServiceClient().from('fiscal_web_intakes').update({ email_sent: mailed, email_error: mailError }).eq('intake_ref', x.intakeRef) } catch { /* suivi non critique */ }
  }
  if (!stored && !mailed) return reply({ error: 'Envoi impossible pour le moment. Réessayez dans quelques minutes.' }, 500, h)
  return reply({ ok: true, ref: x.intakeRef }, 200, h)
}