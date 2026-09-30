'use client'
import { useState, useRef, useEffect } from 'react'

type Opt = { value: string; label: string }
type Q = { key: string; type: 'single' | 'multi' | 'text'; prompt: string; options: Opt[] }
type Msg = { from: 'asta' | 'me'; text: string }
type Result = { scores: Record<string, number>; total: number; band: string; recos: string[]; dimensions: Record<string, { label: string; max: number }> }

const GOLD = '#C9A84C'
const OPENING = "Bonjour 👋\n\nJe suis ASTA, l'employée numérique de DOUKE Growth & Funding.\n\nBeaucoup de dirigeants travaillent énormément sans toujours comprendre ce qui bloque réellement leur croissance.\n\nEn moins de 4 minutes, je peux établir votre Score de Croissance DOUKE et vous offrir une première feuille de route.\n\nOn commence ?"
const inp: React.CSSProperties = { width: '100%', padding: '10px', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 8, color: '#E8E8E8', fontSize: 14, boxSizing: 'border-box' }
const btn = (on = false): React.CSSProperties => ({ padding: '10px 14px', borderRadius: 10, cursor: 'pointer', fontSize: 14, border: `1px solid ${on ? GOLD : 'rgba(201,168,76,.35)'}`, background: on ? 'rgba(201,168,76,.22)' : 'rgba(201,168,76,.08)', color: GOLD })

export default function DiagnosticPage() {
  const [msgs, setMsgs] = useState<Msg[]>([{ from: 'asta', text: OPENING }])
  const [token, setToken] = useState('')
  const [q, setQ] = useState<Q | null>(null)
  const [sel, setSel] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(12)
  const [result, setResult] = useState<Result | null>(null)
  const [sent, setSent] = useState(false)
  const [form, setForm] = useState({ full_name: '', whatsapp: '', consent: false, wish: '' })
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, result, sent])

  const add = (...m: Msg[]) => setMsgs((p) => [...p, ...m])
  async function call(action: string, body: object) {
    const r = await fetch(`/api/asta/diagnostic/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || 'Une erreur est survenue')
    return j
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true); setErr('')
    try { await fn() } catch (e) { setErr(e instanceof Error ? e.message : 'Erreur') }
    setBusy(false)
  }
  const begin = () => run(async () => {
    const j = await call('start', {})
    setToken(j.token); setTotal(j.progress.total); setQ(j.question)
    add({ from: 'me', text: 'Oui, on commence' }, { from: 'asta', text: j.question.prompt })
  })
  const submit = (value: string | string[], label: string) => run(async () => {
    if (!q) return
    const j = await call('answer', { token, key: q.key, value })
    add({ from: 'me', text: label }, { from: 'asta', text: j.ack })
    setSel([]); setDone(j.progress.done)
    if (j.question) { setQ(j.question); add({ from: 'asta', text: j.question.prompt }) }
    else { setQ(null); setResult(j.result); add({ from: 'asta', text: j.result.text }) }
  })
  const sendLead = () => run(async () => {
    if (form.wish.trim()) await call('answer', { token, key: 'wish', value: form.wish })
    await call('lead', { token, full_name: form.full_name, whatsapp: form.whatsapp, consent: form.consent })
    setSent(true)
    add({ from: 'asta', text: 'Merci. Votre demande est enregistrée : l’équipe DOUKE vous enverra votre feuille de route.' })
  })

  return (
    <div style={{ minHeight: '100vh', background: '#0F1923', color: '#E8E8E8', fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '20px 16px 60px' }}>
        <div style={{ color: GOLD, fontWeight: 800, letterSpacing: 2, marginBottom: 4 }}>ASTA · DOUKE</div>
        {q && <div style={{ height: 4, background: 'rgba(255,255,255,.08)', borderRadius: 4, marginBottom: 16 }}><div style={{ height: 4, width: `${(done / total) * 100}%`, background: GOLD, borderRadius: 4 }} /></div>}
        {msgs.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.from === 'me' ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
            <div style={{ maxWidth: '85%', whiteSpace: 'pre-wrap', padding: '10px 14px', borderRadius: 14, fontSize: 14, lineHeight: 1.5, background: m.from === 'me' ? 'rgba(201,168,76,.18)' : '#162030', border: '1px solid rgba(201,168,76,.15)' }}>{m.text}</div>
          </div>
        ))}
        {!token && <button style={btn(true)} disabled={busy} onClick={begin}>Oui, on commence</button>}
        {q && q.type === 'single' && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{q.options.map((o) => <button key={o.value} style={btn()} disabled={busy} onClick={() => submit(o.value, o.label)}>{o.label}</button>)}</div>}
        {q && q.type === 'multi' && (
          <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>{q.options.map((o) => <button key={o.value} style={btn(sel.includes(o.value))} onClick={() => setSel((p) => p.includes(o.value) ? p.filter((x) => x !== o.value) : [...p, o.value])}>{o.label}</button>)}</div>
            <button style={btn(true)} disabled={busy || sel.length === 0} onClick={() => submit(sel, q.options.filter((o) => sel.includes(o.value)).map((o) => o.label).join(', '))}>Valider</button>
          </div>
        )}
        {result && (
          <div style={{ background: '#162030', border: '1px solid rgba(201,168,76,.25)', borderRadius: 14, padding: 16, margin: '8px 0 16px' }}>
            <div style={{ fontSize: 34, fontWeight: 800, color: GOLD }}>{result.total}<span style={{ fontSize: 16, color: '#6B7A8D' }}>/100 · {result.band}</span></div>
            {Object.entries(result.dimensions).map(([k, d]) => (
              <div key={k} style={{ marginTop: 10, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{d.label}</span><span>{result.scores[k]}/{d.max}</span></div>
                <div style={{ height: 6, background: 'rgba(255,255,255,.08)', borderRadius: 4 }}><div style={{ height: 6, width: `${(result.scores[k] / d.max) * 100}%`, background: GOLD, borderRadius: 4 }} /></div>
              </div>
            ))}
            <div style={{ marginTop: 14, fontWeight: 600, fontSize: 13 }}>Deux recommandations gratuites</div>
            {result.recos.map((r, i) => <div key={i} style={{ fontSize: 13, color: '#A8B4C0', marginTop: 6 }}>• {r}</div>)}
          </div>
        )}
        {result && !sent && (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 14 }}>Souhaitez-vous recevoir votre feuille de route personnalisée ?</div>
            <input style={inp} placeholder="Votre nom" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            <input style={inp} placeholder="Numéro WhatsApp (ex. +229…)" inputMode="tel" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
            <textarea style={{ ...inp, minHeight: 70 }} maxLength={500} placeholder="Facultatif : si je pouvais résoudre une seule chose pour vous avant la fin de l'année, ce serait…" value={form.wish} onChange={(e) => setForm({ ...form, wish: e.target.value })} />
            <label style={{ fontSize: 12, color: '#A8B4C0', display: 'flex', gap: 8 }}><input type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} />J'accepte que DOUKE Growth & Funding me recontacte au sujet de mon diagnostic et de ma feuille de route. Je peux demander l'arrêt à tout moment.</label>
            <button style={btn(true)} disabled={busy || !form.consent || form.full_name.trim().length < 2 || form.whatsapp.length < 8} onClick={sendLead}>Recevoir ma feuille de route</button>
          </div>
        )}
        {err && <div style={{ color: '#e74c3c', fontSize: 13, marginTop: 10 }}>{err}</div>}
        <div ref={end} />
      </div>
    </div>
  )
}
