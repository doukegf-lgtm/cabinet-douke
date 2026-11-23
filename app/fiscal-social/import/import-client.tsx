'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'

type Obj = Record<string, unknown>
type Section = { section_code: string; fiscal_year: number; payload: Obj }
type Intake = { ref: string; client: Obj; dossier: Obj; sections: Section[] }
type Alert = { level: 'warn' | 'info'; text: string }
type Hit = { id: string; name: string; ifu: string }
type Progress = { claimed: boolean; clientId: string; dossierId: string; saved: Set<number> }

const SCHEMA = 'douke-fiscal-intake-v1'
const REF_RE = /^DKI-\d{6}-[A-F0-9]{6}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LABELS: Record<string, string> = {
  annual_figures: 'Chiffres annuels (IS)',
  tax_operations: 'Impôts impayés (DGI)',
  social_operations: 'Cotisations impayées (CNSS)',
  payments: 'Paiements déclarés',
  cnss_periods: 'Paie CNSS',
  its_vps: 'ITS / VPS',
  aib: 'AIB',
  withholding: 'Retenues à la source',
}
const MODES: Record<string, string> = { estimated: 'Estimées', actual: 'Réelles', mixed: 'Mixtes' }
const TYPES: Array<[string, string]> = [
  ['regularisation_fiscale', 'Régularisation fiscale'],
  ['regularisation_sociale', 'Régularisation sociale'],
  ['suivi_fiscal', 'Suivi fiscal'],
  ['suivi_social', 'Suivi social'],
]

const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

class ApiError extends Error {}

async function api(method: 'GET' | 'POST', url: string, body?: unknown): Promise<unknown> {
  const r = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  })
  let data: unknown = null
  try { data = await r.json() } catch { /* corps vide */ }
  if (!r.ok) throw new ApiError(isObj(data) && typeof data.error === 'string' ? data.error : 'Erreur ' + r.status)
  return data
}

function extractId(d: unknown): string | null {
  const pool: unknown[] = []
  const first = Array.isArray(d) ? d[0] : d
  pool.push(first)
  if (isObj(first)) pool.push(first.client, first.dossier, first.data, first.item, first.row)
  for (const c of pool) {
    const o = Array.isArray(c) ? c[0] : c
    if (isObj(o) && typeof o.id === 'string' && UUID_RE.test(o.id)) return o.id
  }
  return null
}

function listOf(d: unknown): Obj[] {
  if (Array.isArray(d)) return d.filter(isObj)
  if (isObj(d)) for (const v of Object.values(d)) if (Array.isArray(v)) return v.filter(isObj)
  return []
}

function parse(text: string): { ok: true; data: Intake } | { ok: false; error: string } {
  let j: unknown
  try { j = JSON.parse(text) } catch { return { ok: false, error: 'Ce fichier n’est pas un JSON valide.' } }
  if (!isObj(j) || j.schema !== SCHEMA) return { ok: false, error: 'Fichier non reconnu : il doit provenir du formulaire de souscription (schéma ' + SCHEMA + ').' }
  if (!isObj(j.client) || !isObj(j.dossier) || !Array.isArray(j.sections)) return { ok: false, error: 'Structure du fichier incomplète.' }
  const sections: Section[] = []
  for (const s of j.sections) {
    if (!isObj(s) || typeof s.section_code !== 'string' || !(s.section_code in LABELS) || typeof s.fiscal_year !== 'number' || !isObj(s.payload)) {
      return { ok: false, error: 'Une section du fichier est invalide ou inconnue.' }
    }
    sections.push({ section_code: s.section_code, fiscal_year: s.fiscal_year, payload: s.payload })
  }
  const ref = str(j.intake_ref)
  return { ok: true, data: { ref: REF_RE.test(ref) ? ref : '', client: j.client, dossier: j.dossier, sections } }
}

function countOf(s: Section): number {
  const d = s.payload.data
  if (isObj(d)) for (const k of ['lines', 'debts', 'payments']) { const v = d[k]; if (Array.isArray(v)) return v.length }
  return 1
}

function alertsFor(i: Intake, period: { start: string; end: string }, ifu: string): Alert[] {
  const a: Alert[] = []
  const codes = i.sections.map((s) => s.section_code)
  if (!ifu.trim()) a.push({ level: 'warn', text: 'IFU absent : à demander au client. Sans IFU, un client déjà existant ne peut pas être reconnu avec certitude.' })

  const cn = i.sections.find((s) => s.section_code === 'cnss_periods')
  if (cn && isObj(cn.payload.data)) {
    const r = Number(cn.payload.data.rp_rate)
    if (Number.isFinite(r) && r > 0.05) a.push({ level: 'warn', text: 'Taux accidents du travail de ' + (r * 100).toLocaleString('fr-FR', { maximumFractionDigits: 4 }) + ' % : valeur élevée, à confirmer sur la notification CNSS.' })
  }
  if (codes.includes('social_operations') && codes.includes('cnss_periods')) {
    a.push({ level: 'warn', text: 'Dettes CNSS déclarées ET lignes de paie présentes : précisez l’origine de chaque dette pour éviter un double comptage.' })
  }
  const y0 = Number(period.start.slice(0, 4)), y1 = Number(period.end.slice(0, 4))
  const outside = Array.from(new Set(i.sections.map((s) => s.fiscal_year))).filter((y) => y0 > 0 && y1 > 0 && (y < y0 || y > y1))
  if (outside.length) a.push({ level: 'warn', text: 'Exercice(s) ' + outside.join(', ') + ' hors de la période du dossier : l’enregistrement sera refusé. Corrigez la période.' })
  const have = new Set(i.sections.filter((s) => s.section_code === 'annual_figures').map((s) => s.fiscal_year))
  const miss: number[] = []
  if (y0 > 0 && y1 >= y0) for (let y = y0; y <= y1; y++) if (!have.has(y)) miss.push(y)
  if (miss.length) a.push({ level: 'info', text: 'Chiffres annuels absents pour : ' + miss.join(', ') + '.' })
  const absent = ['tax_operations', 'social_operations', 'payments'].filter((c) => !codes.includes(c)).map((c) => LABELS[c])
  if (absent.length) a.push({ level: 'info', text: 'Sections absentes (nécessaires au calcul, à compléter dans DOUKE) : ' + absent.join(' · ') + '.' })
  const est = i.sections.filter((s) => s.payload.source_mode !== 'actual').map((s) => LABELS[s.section_code])
  if (est.length) a.push({ level: 'info', text: 'Données estimées ou mixtes (non prouvées par des documents) : ' + est.join(' · ') + '.' })
  if (codes.includes('payments')) a.push({ level: 'info', text: 'Les paiements déclarés restent « non vérifiés » tant que le cabinet n’a pas contrôlé les justificatifs.' })
  return a
}

async function searchDup(c: { legal_name: string; ifu: string }): Promise<Hit[]> {
  const hits = new Map<string, Hit>()
  for (const q of [c.ifu.trim(), c.legal_name.trim()].filter((x) => x.length >= 2)) {
    try {
      const d = await api('GET', '/api/fiscal/clients?pageSize=10&search=' + encodeURIComponent(q.slice(0, 100)))
      for (const r of listOf(d)) {
        const id = str(r.id)
        if (UUID_RE.test(id) && !hits.has(id)) hits.set(id, { id, name: str(r.legal_name), ifu: str(r.ifu) })
      }
    } catch { /* la recherche de doublons est facultative */ }
  }
  return Array.from(hits.values())
}

function Field(props: { label: string; value: string; onChange: (v: string) => void; disabled: boolean; type?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-600">{props.label}</span>
      <input
        type={props.type ?? 'text'}
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100"
      />
    </label>
  )
}

export default function ImportClient() {
  const [intake, setIntake] = useState<Intake | null>(null)
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState('')
  const [cf, setCf] = useState({ legal_name: '', ifu: '', rccm: '', phone: '', email: '', address: '' })
  const [df, setDf] = useState({ dossier_type: 'regularisation_fiscale', period_start: '', period_end: '', notes: '' })
  const [picked, setPicked] = useState<boolean[]>([])
  const [hits, setHits] = useState<Hit[]>([])
  const [attach, setAttach] = useState('')
  const [log, setLog] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [locked, setLocked] = useState(false)
  const [done, setDone] = useState<{ dossierId: string } | null>(null)
  const prog = useRef<Progress>({ claimed: false, clientId: '', dossierId: '', saved: new Set<number>() })
  const push = (line: string) => setLog((l) => [...l, line])

  async function load(file: File | undefined) {
    if (!file) return
    setParseError(''); setIntake(null); setDone(null); setLog([]); setError(''); setLocked(false); setAttach('')
    prog.current = { claimed: false, clientId: '', dossierId: '', saved: new Set<number>() }
    if (file.size > 2_000_000) { setParseError('Fichier trop volumineux.'); return }
    const res = parse(await file.text())
    if (!res.ok) { setParseError(res.error); return }
    const c = res.data.client, d = res.data.dossier
    const next = { legal_name: str(c.legal_name), ifu: str(c.ifu), rccm: str(c.rccm), phone: str(c.phone), email: str(c.email), address: str(c.address) }
    setCf(next)
    setDf({
      dossier_type: TYPES.some((t) => t[0] === str(d.dossier_type)) ? str(d.dossier_type) : 'regularisation_fiscale',
      period_start: str(d.period_start), period_end: str(d.period_end), notes: str(d.notes),
    })
    setPicked(res.data.sections.map(() => true))
    setFileName(file.name)
    setIntake(res.data)
    setHits(await searchDup(next))
  }

  async function runImport() {
    if (!intake) return
    const p = prog.current
    setError(''); setBusy(true)
    try {
      if (!cf.legal_name.trim()) throw new Error('La raison sociale est obligatoire.')
      if (!df.period_start || !df.period_end) throw new Error('La période du dossier est obligatoire.')
      if (df.period_end < df.period_start) throw new Error('La fin de période doit suivre le début.')

      if (!p.claimed && intake.ref) {
        const c = await api('POST', '/api/fiscal/intakes', { action: 'claim', intake_ref: intake.ref })
        p.claimed = true
        if (isObj(c) && c.resumed === true) push('⚠ Une importation précédente de cette souscription avait été interrompue : vérifiez qu’aucun dossier en double n’existe.')
      }

      if (!p.clientId) {
        if (attach) {
          p.clientId = attach
          push('✓ Client existant utilisé')
        } else {
          const body = Object.fromEntries(Object.entries(cf).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v !== ''))
          const created = await api('POST', '/api/fiscal/clients', body)
          const id = extractId(created)
          if (!id) throw new Error('Client créé, mais son identifiant est introuvable dans la réponse. Contrôlez la liste des clients avant de réessayer.')
          p.clientId = id
          push('✓ Client créé')
        }
        setLocked(true)
      }

      if (!p.dossierId) {
        const body: Obj = { client_id: p.clientId, dossier_type: df.dossier_type, period_start: df.period_start, period_end: df.period_end }
        if (df.notes.trim()) body.notes = df.notes.trim()
        const created = await api('POST', '/api/fiscal/dossiers', body)
        const id = extractId(created)
        if (!id) throw new Error('Dossier créé, mais son identifiant est introuvable dans la réponse. Contrôlez la liste des dossiers avant de réessayer.')
        p.dossierId = id
        push('✓ Dossier créé (brouillon)')
      }

      for (let i = 0; i < intake.sections.length; i++) {
        if (!picked[i] || p.saved.has(i)) continue
        const s = intake.sections[i]
        if (s.section_code === 'annual_figures') {
          await api('POST', '/api/fiscal/dossiers/' + p.dossierId + '/inputs', { fiscal_year: s.fiscal_year, payload: s.payload, submit: false })
        } else {
          await api('POST', '/api/fiscal/dossiers/' + p.dossierId + '/sections', { section_code: s.section_code, fiscal_year: s.fiscal_year, payload: s.payload, submit: false })
        }
        p.saved.add(i)
        push('✓ ' + LABELS[s.section_code] + ' ' + s.fiscal_year + ' enregistré en brouillon')
      }

      if (intake.ref) await api('POST', '/api/fiscal/intakes', { action: 'complete', intake_ref: intake.ref, dossier_id: p.dossierId })
      setDone({ dossierId: p.dossierId })
    } catch (e) {
      setError((e instanceof Error ? e.message : 'Erreur inconnue') + (prog.current.clientId ? ' — Les étapes déjà réussies sont conservées : corrigez si besoin puis cliquez sur « Reprendre l’import ».' : ''))
    } finally {
      setBusy(false)
    }
  }

  const alerts = intake ? alertsFor(intake, { start: df.period_start, end: df.period_end }, cf.ifu) : []
  const dis = busy || locked || !!done

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-bold text-slate-900">1. Choisir le fichier reçu par email</h2>
        <p className="mt-1 text-sm text-slate-500">Fichier JSON joint à la notification « Nouvelle souscription Fiscal-Social ».</p>
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); void load(e.dataTransfer.files[0]) }}
          className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600 hover:bg-slate-100"
        >
          <span className="font-semibold text-blue-800">Cliquer pour choisir un fichier</span>
          <span className="mt-1 text-xs">ou le glisser ici (.json)</span>
          <input type="file" accept=".json,application/json" className="sr-only" onChange={(e) => { void load(e.target.files?.[0]); e.target.value = '' }} />
        </label>
        {fileName && !parseError && <p className="mt-3 text-sm text-slate-600">Fichier chargé : <b>{fileName}</b>{intake?.ref ? ' · ' + intake.ref : ''}</p>}
        {parseError && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{parseError}</p>}
      </section>

      {intake && (
        <>
          {alerts.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="text-base font-bold text-slate-900">Points à vérifier</h2>
              <ul className="mt-3 space-y-2">
                {alerts.map((a, i) => (
                  <li key={i} className={'rounded-lg border px-3 py-2 text-sm ' + (a.level === 'warn' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-slate-50 text-slate-700')}>
                    {a.level === 'warn' ? '⚠ ' : 'ℹ '}{a.text}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-base font-bold text-slate-900">2. Client</h2>
            <p className="mt-1 text-sm text-slate-500">Vérifiez et corrigez les informations avant création.</p>
            {hits.length > 0 && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-900">Clients existants ressemblant à celui-ci :</p>
                <div className="mt-2 space-y-1 text-sm text-amber-900">
                  {hits.map((h) => (
                    <label key={h.id} className="flex items-center gap-2">
                      <input type="radio" name="attach" disabled={dis} checked={attach === h.id} onChange={() => setAttach(h.id)} />
                      Rattacher à : <b>{h.name || h.id}</b>{h.ifu ? ' · IFU ' + h.ifu : ''}
                    </label>
                  ))}
                  <label className="flex items-center gap-2">
                    <input type="radio" name="attach" disabled={dis} checked={attach === ''} onChange={() => setAttach('')} />
                    Créer un nouveau client
                  </label>
                </div>
              </div>
            )}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Raison sociale *" value={cf.legal_name} disabled={dis || !!attach} onChange={(v) => setCf({ ...cf, legal_name: v })} />
              <Field label="Numéro IFU" value={cf.ifu} disabled={dis || !!attach} onChange={(v) => setCf({ ...cf, ifu: v })} />
              <Field label="N° RCCM" value={cf.rccm} disabled={dis || !!attach} onChange={(v) => setCf({ ...cf, rccm: v })} />
              <Field label="Téléphone" value={cf.phone} disabled={dis || !!attach} onChange={(v) => setCf({ ...cf, phone: v })} />
              <Field label="Email" value={cf.email} disabled={dis || !!attach} onChange={(v) => setCf({ ...cf, email: v })} />
              <Field label="Adresse" value={cf.address} disabled={dis || !!attach} onChange={(v) => setCf({ ...cf, address: v })} />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-base font-bold text-slate-900">3. Dossier</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">Type de dossier *</span>
                <select value={df.dossier_type} disabled={dis} onChange={(e) => setDf({ ...df, dossier_type: e.target.value })} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100">
                  {TYPES.map((t) => <option key={t[0]} value={t[0]}>{t[1]}</option>)}
                </select>
              </label>
              <Field label="Début de période *" type="date" value={df.period_start} disabled={dis} onChange={(v) => setDf({ ...df, period_start: v })} />
              <Field label="Fin de période *" type="date" value={df.period_end} disabled={dis} onChange={(v) => setDf({ ...df, period_end: v })} />
            </div>
            <div className="mt-4">
              <Field label="Notes" value={df.notes} disabled={dis} onChange={(v) => setDf({ ...df, notes: v })} />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-base font-bold text-slate-900">4. Sections à importer en brouillon</h2>
            {intake.sections.length === 0 && <p className="mt-3 text-sm text-slate-500">Le fichier ne contient aucune section : seuls le client et le dossier seront créés.</p>}
            <ul className="mt-3 divide-y divide-slate-100">
              {intake.sections.map((s, i) => (
                <li key={i} className="flex items-center gap-3 py-2 text-sm">
                  <input type="checkbox" disabled={dis} checked={picked[i] ?? false} onChange={(e) => setPicked(picked.map((v, j) => (j === i ? e.target.checked : v)))} />
                  <span className="font-semibold text-slate-800">{LABELS[s.section_code]}</span>
                  <span className="text-slate-500">exercice {s.fiscal_year} · {countOf(s)} ligne(s) · {MODES[str(s.payload.source_mode)] ?? '—'}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-base font-bold text-slate-900">5. Créer en brouillon</h2>
            <p className="mt-1 text-sm text-slate-500">Rien n’est soumis, validé ni calculé : le contrôle humain dans DOUKE reste obligatoire.</p>
            {!done && (
              <button type="button" onClick={() => void runImport()} disabled={busy} className="mt-4 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
                {busy ? 'Import en cours…' : locked ? 'Reprendre l’import' : 'Créer le client et le dossier'}
              </button>
            )}
            {log.length > 0 && <ul className="mt-4 space-y-1 text-sm text-slate-700">{log.map((l, i) => <li key={i}>{l}</li>)}</ul>}
            {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
            {done && (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <p className="font-semibold">Import terminé : le dossier est en brouillon.</p>
                <p className="mt-1">Ouvrez chaque section, contrôlez-la, soumettez-la puis validez-la.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={'/fiscal-social/dossiers/' + done.dossierId + '/saisie'} className="rounded-lg bg-emerald-700 px-3 py-2 font-semibold text-white hover:bg-emerald-800">Ouvrir la saisie du dossier</Link>
                  <Link href="/fiscal-social/dossiers" className="rounded-lg border border-emerald-300 bg-white px-3 py-2 font-semibold text-emerald-800 hover:bg-emerald-100">Liste des dossiers</Link>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}