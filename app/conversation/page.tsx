'use client'
import { useEffect, useRef, useState } from 'react'
import { useDiagVoice } from '@/lib/asta/diagnostic/useDiagVoice'
import { cleanSpeech } from '@/lib/asta/diagnostic/voice-match'
import { CHAT_CONSENT } from '@/lib/asta/chat/persona'

type Msg = { role: 'user' | 'assistant'; text: string }
const GOLD = '#C9A84C'
const GREETING = "Bonjour, je suis ASTA, l'assistante numérique de DOUKE Growth & Funding. Comment puis-je vous aider ?"
const inp: React.CSSProperties = { width: '100%', padding: 10, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 8, color: '#E8E8E8', fontSize: 14, boxSizing: 'border-box' }
const btn = (on = false): React.CSSProperties => ({ padding: '9px 13px', borderRadius: 10, cursor: 'pointer', fontSize: 13, textDecoration: 'none', display: 'inline-block', border: `1px solid ${on ? GOLD : 'rgba(201,168,76,.35)'}`, background: on ? 'rgba(201,168,76,.22)' : 'rgba(201,168,76,.08)', color: GOLD })

export default function ConversationPage() {
  const v = useDiagVoice()
  const [msgs, setMsgs] = useState<Msg[]>([{ role: 'assistant', text: GREETING }])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [voice, setVoice] = useState(false)
  const [err, setErr] = useState('')
  const [hand, setHand] = useState(false)
  const [lead, setLead] = useState({ full_name: '', whatsapp: '', consent: false })
  const [sent, setSent] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const sendRef = useRef<(t: string) => void>(() => {})
  const voiceRef = useRef(false)
  const busyRef = useRef(false)
  busyRef.current = busy
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, hand, sent])

  function listenOnce() {
    if (!voiceRef.current) return
    v.listen((x) => sendRef.current(x), undefined, (m) => { setErr(m); voiceRef.current = false; setVoice(false) })
  }
  async function send(t: string) {
    const clean = t.trim().slice(0, 500)
    if (!clean || busyRef.current) return
    v.cancel(); v.stop()
    setErr(''); setBusy(true)
    const next: Msg[] = [...msgs, { role: 'user', text: clean }]
    setMsgs(next); setText('')
    try {
      const r = await fetch('/api/asta/chat/turn', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: next.slice(-9) }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Erreur ' + r.status)
      setMsgs((p) => [...p, { role: 'assistant', text: String(j.reply) }])
      if (j.handoff) setHand(true)
      if (voiceRef.current) v.speak(cleanSpeech(String(j.reply)), listenOnce)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Erreur') }
    setBusy(false)
  }
  sendRef.current = send

  function toggleVoice() {
    if (voice) { voiceRef.current = false; setVoice(false); v.cancel(); v.stop(); return }
    voiceRef.current = true; setVoice(true); setErr('')
    v.speak(GREETING, listenOnce)
  }
  async function sendLead() {
    setBusy(true); setErr('')
    try {
      const r = await fetch('/api/asta/chat/handoff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lead) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Erreur ' + r.status)
      setSent(true); setMsgs((p) => [...p, { role: 'assistant', text: 'Merci. Un conseiller de DOUKE vous rappellera.' }])
    } catch (e) { setErr(e instanceof Error ? e.message : 'Erreur') }
    setBusy(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0F1923', color: '#E8E8E8', fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '18px 16px 60px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ color: GOLD, fontWeight: 800, letterSpacing: 2 }}>ASTA · DOUKE</div>
          <a href="/diagnostic" style={{ ...btn(), padding: '6px 10px', fontSize: 12 }}>Diagnostic gratuit</a>
        </div>
        <div style={{ fontSize: 11, color: '#6B7A8D', marginBottom: 12 }}>
          ASTA est une assistante numérique. Ne saisissez aucun mot de passe ni donnée bancaire. Vos messages sont traités par un service d’intelligence artificielle ; en mode vocal, la reconnaissance peut aussi passer par les serveurs de votre navigateur.
        </div>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
            <div style={{ maxWidth: '85%', whiteSpace: 'pre-wrap', padding: '10px 14px', borderRadius: 14, fontSize: 14, lineHeight: 1.5, background: m.role === 'user' ? 'rgba(201,168,76,.18)' : '#162030', border: '1px solid rgba(201,168,76,.15)' }}>{m.text}</div>
          </div>
        ))}
        {busy && <div style={{ color: '#6B7A8D', fontSize: 13 }}>ASTA réfléchit…</div>}
        {hand && !sent && (
          <div style={{ display: 'grid', gap: 8, margin: '10px 0', padding: 12, background: '#162030', borderRadius: 12, border: '1px solid rgba(201,168,76,.25)' }}>
            <div style={{ fontSize: 13 }}>Souhaitez-vous être rappelé par un conseiller ?</div>
            <input style={inp} placeholder="Votre nom" value={lead.full_name} onChange={(e) => setLead({ ...lead, full_name: e.target.value })} />
            <input style={inp} placeholder="Numéro WhatsApp (ex. +229…)" inputMode="tel" value={lead.whatsapp} onChange={(e) => setLead({ ...lead, whatsapp: e.target.value })} />
            <label style={{ fontSize: 12, color: '#A8B4C0', display: 'flex', gap: 8 }}><input type="checkbox" checked={lead.consent} onChange={(e) => setLead({ ...lead, consent: e.target.checked })} />{CHAT_CONSENT}</label>
            <button style={btn(true)} disabled={busy || !lead.consent || lead.full_name.trim().length < 2 || lead.whatsapp.length < 8} onClick={sendLead}>Être rappelé</button>
          </div>
        )}
        {err && <div style={{ color: '#e8b04c', fontSize: 13, margin: '8px 0' }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input style={inp} placeholder="Écrivez votre message…" maxLength={500} value={text} disabled={busy} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send(text) }} />
          <button style={btn(true)} disabled={busy || !text.trim()} onClick={() => send(text)}>Envoyer</button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {v.supported ? <>
            <button style={btn(voice)} onClick={toggleVoice}>{voice ? 'Arrêter le mode vocal' : 'Parler à ASTA'}</button>
            <button style={btn(v.listening)} disabled={busy} onClick={() => (v.listening ? v.stop() : (v.cancel(), v.listen((x) => sendRef.current(x), undefined, (m) => setErr(m))))}>{v.listening ? 'J’écoute… (stop)' : 'Micro'}</button>
          </> : <span style={{ fontSize: 12, color: '#6B7A8D' }}>La voix n’est pas disponible sur ce navigateur : le texte fonctionne normalement.</span>}
          {!hand && <button style={btn()} onClick={() => setHand(true)}>Parler à un conseiller</button>}
        </div>
        <div ref={end} />
      </div>
    </div>
  )
}
