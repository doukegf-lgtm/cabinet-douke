'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

// Voix du navigateur (reconnaissance fr-FR et synthèse). Aucun audio ne passe par notre serveur.
export function useDiagVoice() {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const rec = useRef<any>(null)
  const gen = useRef(0)

  useEffect(() => {
    const w = window as any
    setSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition) && 'speechSynthesis' in window)
    return () => {
      const r = rec.current; rec.current = null
      try { r?.abort() } catch { /* déjà arrêté */ }
      gen.current++
      try { window.speechSynthesis?.cancel() } catch { /* indisponible */ }
    }
  }, [])

  const stop = useCallback(() => {
    const r = rec.current; rec.current = null
    try { r?.abort() } catch { /* déjà arrêté */ }
    setListening(false)
  }, [])

  const cancel = useCallback(() => {
    gen.current++
    try { window.speechSynthesis?.cancel() } catch { /* indisponible */ }
    setSpeaking(false)
  }, [])

  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (!('speechSynthesis' in window)) { onEnd?.(); return }
    const my = ++gen.current
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'fr-FR'
    const voice = window.speechSynthesis.getVoices().find((x) => x.lang.toLowerCase().startsWith('fr'))
    if (voice) u.voice = voice
    let ended = false
    const end = () => { if (ended) return; ended = true; if (gen.current === my) { setSpeaking(false); onEnd?.() } }
    u.onend = end; u.onerror = end
    window.speechSynthesis.cancel()
    setSpeaking(true)
    window.speechSynthesis.speak(u)
  }, [])

  const listen = useCallback((onText: (t: string) => void, onMiss?: () => void, onFatal?: (msg: string) => void) => {
    const w = window as any
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!SR) { onFatal?.('La reconnaissance vocale n’est pas disponible sur ce navigateur : continuez par écrit.'); return }
    const old = rec.current; rec.current = null
    try { old?.abort() } catch { /* déjà arrêté */ }
    const r = new SR()
    let got = false, fatal = false
    r.lang = 'fr-FR'; r.interimResults = false; r.maxAlternatives = 1; r.continuous = false
    r.onresult = (e: any) => {
      if (rec.current !== r) return
      const t = e?.results?.[0]?.[0]?.transcript
      if (t) { got = true; onText(String(t)) }
    }
    r.onerror = (e: any) => {
      if (rec.current !== r) return
      const c = e?.error
      if (c === 'not-allowed' || c === 'service-not-allowed' || c === 'audio-capture') {
        fatal = true
        onFatal?.(c === 'audio-capture' ? 'Aucun micro détecté : continuez par écrit.' : 'Micro refusé : autorisez-le dans le navigateur ou continuez par écrit.')
      }
    }
    r.onend = () => {
      if (rec.current !== r) return
      rec.current = null; setListening(false)
      if (!got && !fatal) onMiss?.()
    }
    rec.current = r
    try { r.start(); setListening(true) } catch { rec.current = null; setListening(false); onFatal?.('Micro indisponible : continuez par écrit.') }
  }, [])

  return { supported, listening, speaking, speak, cancel, listen, stop }
}
