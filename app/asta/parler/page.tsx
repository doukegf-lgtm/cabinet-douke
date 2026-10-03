'use client'
import { useEffect, useRef, useState } from 'react'
import { useDiagVoice } from '@/lib/asta/diagnostic/useDiagVoice'
import { cleanSpeech } from '@/lib/asta/diagnostic/voice-match'

type Msg = { role: 'user' | 'assistant'; text: string }
const GOLD = '#C9A84C'
const btn = (on = false): React.CSSProperties => ({ padding: '9px 13px', borderRadius: 10, cursor: 'pointer', fontSize: 13, border: `1px solid ${on ? GOLD : 'rgba(201,168,76,.35)'}`, background: on ? 'rgba(201,168,76,.22)' : 'rgba(201,168,76,.08)', color: GOLD })

export default function ParlerPage() {
  const v = useDiagVoice()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [voice, setVoice] = useState(false)
  const [err, setErr] = useState('')
  const sendRef = useRef<(t: string) => void>(() => {})
  const voiceRef = useRef(false)
  const busyRef = useRef(false)
  const end = useRef<HTMLDivElement>(null)
  busyRef.current = busy
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

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
      const r = await fetch('/api/asta/admin/talk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: next.slice(-9) }) })
      const j = await r.json().catch(() => ({}))
      if (r.status === 401) throw new Error('Session absente ou expirée : connectez-vous depuis le menu principal.')
      if (r.status === 403) throw new Error('Page réservée aux administrateurs.')
      if (!r.ok) throw new Error(j.error || 'Erreur ' + r.status)
      setMsgs((p) => [...p, { role: 'assistant', text: String(j.reply) }])
      if (voiceRef.current) v.speak(cleanSpeech(String(j.reply)), listenOnce)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Erreur') }
    setBusy(false)
  }
  sendRef.current = send

  return (
    <div style={{ minHeight: '100vh', background: '#0F1923', color: '#E8E8E8', fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '18px 16px 60px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ color: GOLD, fontWeight: 800, letterSpacing: 2 }}>ASTA · AVEC LA DIRECTION</div>
          <a href="/asta" style={{ color: GOLD, fontSize: 13 }}>{'← Centre opérationnel'}</a>
        </div>
        <p style={{ color: '#A8B4C0', fontSize: 13 }}>{"Posez vos questions sur les campagnes, les profils et les actions. ASTA lit les chiffres des campagnes (jamais les coordonnées des prospects) et ne peut rien exécuter."}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <button style={btn()} disabled={busy} onClick={() => send('Fais-moi le point sur mes campagnes.')}>Faire le point</button>
          {v.supported && <>
            <button style={btn(voice)} onClick={() => { if (voice) { voiceRef.current = false; setVoice(false); v.cancel(); v.stop() } else { voiceRef.current = true; setVoice(true); setErr(''); listenOnce() } }}>{voice ? 'Arrêter le mode vocal' : 'Mode vocal'}</button>
            <button style={btn(v.listening)} disabled={busy} onClick={() => (v.listening ? v.stop() : (v.cancel(), v.listen((x) => sendRef.current(x), undefined, (m) => setErr(m))))}>{v.listening ? 'J’écoute… (stop)' : 'Micro'}</button>
          </>}
        </div>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
            <div style={{ maxWidth: '85%', whiteSpace: 'pre-wrap', padding: '10px 14px', borderRadius: 14, fontSize: 14, lineHeight: 1.5, background: m.role === 'user' ? 'rgba(201,168,76,.18)' : '#162030', border: '1px solid rgba(201,168,76,.15)' }}>{m.text}</div>
          </div>
        ))}
        {busy && <div style={{ color: '#6B7A8D', fontSize: 13 }}>ASTA réfléchit…</div>}
        {err && <div style={{ color: '#e8b04c', fontSize: 13, margin: '8px 0' }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input style={{ flex: 1, padding: 10, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 8, color: '#E8E8E8', fontSize: 14 }} placeholder="Votre question…" maxLength={500} value={text} disabled={busy} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send(text) }} />
          <button style={btn(true)} disabled={busy || !text.trim()} onClick={() => send(text)}>Envoyer</button>
        </div>
        <div ref={end} />
      </div>
    </div>
  )
}
