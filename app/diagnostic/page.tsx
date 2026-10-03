'use client'
import { useState, useRef, useEffect } from 'react'
import { useDiagVoice } from '@/lib/asta/diagnostic/useDiagVoice'
import { matchAnswer, parseYesNo, spokenOptions, cleanSpeech } from '@/lib/asta/diagnostic/voice-match'

type Opt = { value: string; label: string }
type Q = { key: string; type: 'single' | 'multi' | 'text'; prompt: string; options: Opt[] }
type Msg = { from: 'asta' | 'me'; text: string }
type Result = { scores: Record<string, number>; total: number; band: string; recos: string[]; dimensions: Record<string, { label: string; max: number }> }
type Mode = 'text' | 'audio' | null

const GOLD = '#C9A84C'
const OPENING = "Bonjour 👋\n\nJe suis ASTA, l'employée numérique de DOUKE Growth & Funding.\n\nBeaucoup de dirigeants travaillent énormément sans toujours comprendre ce qui bloque réellement leur croissance.\n\nEn moins de 4 minutes, je peux établir votre Score de Croissance DOUKE et vous offrir une première feuille de route.\n\nOn commence ?"
const MODE_ASK = "Avant de continuer : préférez-vous poursuivre par écrit ou à l'oral ? Dans les deux cas, je vous poserai exactement les mêmes questions."
const AUDIO_INTRO = "Très bien. Je vous lis chaque question : répondez à voix haute, ou touchez votre réponse à l'écran."
const inp: React.CSSProperties = { width: '100%', padding: '10px', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 8, color: '#E8E8E8', fontSize: 14, boxSizing: 'border-box' }
const btn = (on = false): React.CSSProperties => ({ padding: '10px 14px', borderRadius: 10, cursor: 'pointer', fontSize: 14, border: `1px solid ${on ? GOLD : 'rgba(201,168,76,.35)'}`, background: on ? 'rgba(201,168,76,.22)' : 'rgba(201,168,76,.08)', color: GOLD })

export default function DiagnosticPage() {
  const v = useDiagVoice()
  const [msgs, setMsgs] = useState<Msg[]>([{ from: 'asta', text: OPENING }])
  const [token, setToken] = useState('')
  const [q, setQ] = useState<Q | null>(null)
  const [pending, setPending] = useState<Q | null>(null)
  const [mode, setMode] = useState<Mode>(null)
  const [sel, setSel] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [hint, setHint] = useState('')
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(12)
  const [result, setResult] = useState<Result | null>(null)
  const [sent, setSent] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [form, setForm] = useState({ full_name: '', whatsapp: '', consent: false, wish: '' })
  const end = useRef<HTMLDivElement>(null)

  const qRef = useRef<Q | null>(null)
  const tokenRef = useRef('')
  const modeRef = useRef<Mode>(null)
  const busyRef = useRef(false)
  const askedRef = useRef(false)
  const tries = useRef(0)
  const confirmRef = useRef<{ value: string | string[]; label: string } | null>(null)
  const submitRef = useRef<(value: string | string[], label: string) => Promise<void>>(async () => {})
  const speechRef = useRef<(t: string) => void>(() => {})
  qRef.current = q; tokenRef.current = token; modeRef.current = mode; busyRef.current = busy

  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, result, sent, pending])
  // Bouton « Retour à ASTA » : seulement si la personne s'est connectée au tableau de bord ET que le serveur confirme le rôle admin.
  useEffect(() => {
    try { if (!localStorage.getItem('eden_current_user')) return } catch { return }
    fetch('/api/asta/admin/me', { cache: 'no-store' }).then((r) => setIsAdmin(r.ok)).catch(() => {})
  }, [])

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

  // ---- Mode audio : ASTA lit, écoute, et passe par le même moteur que le texte ----
  function listenAgain() {
    if (modeRef.current !== 'audio') return
    v.listen((t) => speechRef.current(t), miss, (msg) => { setHint(msg); switchToText() })
  }
  function miss() {
    tries.current++
    if (tries.current >= 3) { v.speak('Je vous laisse répondre à l’écran : touchez votre réponse.'); return }
    v.speak('Je n’ai rien entendu. Pouvez-vous répéter ?', listenAgain)
  }
  function retry(msg: string) {
    tries.current++
    if (tries.current >= 3) { v.speak('Je vous laisse choisir votre réponse à l’écran.'); return }
    v.speak(msg, listenAgain)
  }
  function voiceAsk(qq: Q, lead = '') {
    tries.current = 0; confirmRef.current = null
    const opts = spokenOptions(qq.options)
    v.speak(cleanSpeech(`${lead} ${qq.prompt} ${opts}`), () => {
      if (modeRef.current === 'audio' && qRef.current?.key === qq.key) listenAgain()
    })
  }
  function switchToText() {
    modeRef.current = 'text'; setMode('text'); v.cancel(); v.stop()
  }
  function handleSpeech(t: string) {
    const qq = qRef.current
    if (!qq || modeRef.current !== 'audio' || busyRef.current) return
    const pend = confirmRef.current
    if (pend) {
      const yn = parseYesNo(t)
      if (yn === 'yes') { confirmRef.current = null; void submitRef.current(pend.value, pend.label); return }
      if (yn === 'no') { confirmRef.current = null; retry('D’accord. Quelle est votre réponse ?'); return }
      retry(cleanSpeech(`J’ai besoin d’un oui ou d’un non. J’ai compris : ${pend.label}. C’est bien ça ?`))
      return
    }
    const m = matchAnswer(t, qq.options, qq.type === 'multi')
    if (m.kind === 'sure') { void submitRef.current(m.value, m.label); return }
    if (m.kind === 'maybe') {
      confirmRef.current = { value: m.value, label: m.label }
      v.speak(cleanSpeech(`J’ai compris : ${m.label}. C’est bien ça ?`), listenAgain)
      return
    }
    retry('Je n’ai pas bien compris. Pouvez-vous répéter, ou toucher votre réponse à l’écran ?')
  }
  speechRef.current = handleSpeech

  const begin = () => run(async () => {
    const j = await call('start', { campaign: new URLSearchParams(window.location.search).get('c') })
    setToken(j.token); tokenRef.current = j.token; setTotal(j.progress.total); setQ(j.question); qRef.current = j.question
    add({ from: 'me', text: 'Oui, on commence' }, { from: 'asta', text: j.question.prompt })
  })
  const submit = (value: string | string[], label: string) => run(async () => {
    const qq = qRef.current
    if (!qq) return
    v.cancel(); v.stop(); confirmRef.current = null
    const j = await call('answer', { token: tokenRef.current, key: qq.key, value })
    add({ from: 'me', text: label }, { from: 'asta', text: j.ack })
    setSel([]); setDone(j.progress.done)
    if (j.question) {
      if (!askedRef.current && v.supported) {
        // Deuxième étape : choix du mode, avant la deuxième question.
        askedRef.current = true
        setPending(j.question); setQ(null); qRef.current = null
        add({ from: 'asta', text: MODE_ASK })
      } else {
        setQ(j.question); qRef.current = j.question
        add({ from: 'asta', text: j.question.prompt })
        if (modeRef.current === 'audio') voiceAsk(j.question, j.ack)
      }
    } else {
      setQ(null); qRef.current = null; setResult(j.result)
      add({ from: 'asta', text: j.result.text })
      if (modeRef.current === 'audio') v.speak(cleanSpeech(`${j.ack} ${j.result.text} Vos deux recommandations sont affichées à l’écran. Pour recevoir votre feuille de route, saisissez vos coordonnées en dessous.`))
    }
  })
  submitRef.current = submit

  function choose(m: 'text' | 'audio') {
    const p = pending
    if (!p) return
    modeRef.current = m; setMode(m)
    setPending(null); setQ(p); qRef.current = p
    add({ from: 'me', text: m === 'audio' ? 'À l’oral' : 'Par écrit' }, { from: 'asta', text: p.prompt })
    if (m === 'audio') voiceAsk(p, AUDIO_INTRO)
  }
  const sendLead = () => run(async () => {
    if (form.wish.trim()) await call('answer', { token, key: 'wish', value: form.wish })
    await call('lead', { token, full_name: form.full_name, whatsapp: form.whatsapp, consent: form.consent })
    setSent(true)
    add({ from: 'asta', text: 'Merci. Votre demande est enregistrée : l’équipe DOUKE vous enverra votre feuille de route.' })
  })

  return (
    <div style={{ minHeight: '100vh', background: '#0F1923', color: '#E8E8E8', fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '20px 16px 60px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ color: GOLD, fontWeight: 800, letterSpacing: 2 }}>ASTA · DOUKE</div>
          {isAdmin && <a href="/asta" style={{ ...btn(), padding: '6px 10px', fontSize: 12, textDecoration: 'none' }}>{'← Retour à ASTA'}</a>}
        </div>
        {(q || pending) && <div style={{ height: 4, background: 'rgba(255,255,255,.08)', borderRadius: 4, marginBottom: 16 }}><div style={{ height: 4, width: `${(done / total) * 100}%`, background: GOLD, borderRadius: 4 }} /></div>}
        {msgs.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.from === 'me' ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
            <div style={{ maxWidth: '85%', whiteSpace: 'pre-wrap', padding: '10px 14px', borderRadius: 14, fontSize: 14, lineHeight: 1.5, background: m.from === 'me' ? 'rgba(201,168,76,.18)' : '#162030', border: '1px solid rgba(201,168,76,.15)' }}>{m.text}</div>
          </div>
        ))}
        {!token && <button style={btn(true)} disabled={busy} onClick={begin}>Oui, on commence</button>}
        {pending && !mode && (
          <div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button style={btn()} onClick={() => choose('text')}>{'✍️ Par écrit'}</button>
              <button style={btn(true)} onClick={() => choose('audio')}>{'🎙️ À l’oral'}</button>
            </div>
            <div style={{ fontSize: 11, color: '#6B7A8D', marginTop: 6 }}>À l’oral, la reconnaissance vocale peut passer par les serveurs de votre navigateur. Vous pourrez revenir à l’écrit à tout moment.</div>
          </div>
        )}
        {mode === 'audio' && q && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '4px 0 10px', fontSize: 13, color: '#A8B4C0' }}>
            <span>{v.listening ? '🎙️ Je vous écoute…' : v.speaking ? '🔊 ASTA parle…' : '⏸️ En pause'}</span>
            <button style={{ ...btn(), padding: '6px 10px', fontSize: 12 }} onClick={() => voiceAsk(q)}>Répéter la question</button>
            <button style={{ ...btn(), padding: '6px 10px', fontSize: 12 }} onClick={() => { v.cancel(); tries.current = 0; listenAgain() }}>Parler</button>
            <button style={{ ...btn(), padding: '6px 10px', fontSize: 12 }} onClick={switchToText}>Passer à l’écrit</button>
          </div>
        )}
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
        {hint && <div style={{ color: '#e8b04c', fontSize: 13, marginTop: 10 }}>{hint}</div>}
        {err && <div style={{ color: '#e74c3c', fontSize: 13, marginTop: 10 }}>{err}</div>}
        <div ref={end} />
      </div>
    </div>
  )
}
