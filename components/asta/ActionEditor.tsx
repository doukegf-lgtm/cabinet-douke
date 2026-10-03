'use client'
import { useState } from 'react'
import { posterSvg } from '@/lib/asta/ops/content'

type Row = Record<string, any>
const GOLD = '#C9A84C'
const MAX_B64 = 380000
const inp: React.CSSProperties = { width: '100%', padding: 8, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 8, color: '#E8E8E8', fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit' }
const lab: React.CSSProperties = { fontSize: 11, color: '#6B7A8D', display: 'block', marginBottom: 2, marginTop: 8 }
const btn = (gold = false): React.CSSProperties => ({ padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, display: 'inline-block', border: `1px solid ${gold ? 'rgba(201,168,76,.5)' : 'rgba(255,255,255,.15)'}`, background: gold ? 'rgba(201,168,76,.15)' : 'rgba(255,255,255,.05)', color: gold ? GOLD : '#C8D0DA' })

export function ActionVisual({ a, camp }: { a: Row; camp: string }) {
  const c: Row = a.content ?? {}
  const src = typeof c.image === 'string' && c.image
    ? c.image
    : 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(posterSvg({ headline: String(c.headline ?? ''), sub: String(c.sub ?? ''), cta: String(c.cta ?? ''), footer: camp }))
  return (
    <div style={{ margin: '8px 0' }}>
      <img src={src} alt="Aperçu du visuel" style={{ width: 160, height: 160, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(201,168,76,.3)', display: 'block' }} />
      <div style={{ fontSize: 11, color: '#6B7A8D', marginTop: 2 }}>{c.image ? 'Visuel personnel' : 'Visuel proposé par ASTA'}</div>
    </div>
  )
}

// Redimensionne (1080 px max) et compresse en JPEG pour rester sous la limite de stockage.
function compress(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return reject(new Error('Format accepté : JPEG, PNG ou WebP'))
    if (file.size > 15000000) return reject(new Error('Image trop lourde (15 Mo maximum)'))
    const url = URL.createObjectURL(file)
    const im = new Image()
    im.onload = () => {
      URL.revokeObjectURL(url)
      const base = Math.min(1, 1080 / Math.max(im.width, im.height))
      for (const k of [1, 0.8, 0.65, 0.5]) {
        const w = Math.max(1, Math.round(im.width * base * k)), h = Math.max(1, Math.round(im.height * base * k))
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h
        const cx = cv.getContext('2d'); if (!cx) return reject(new Error('Image illisible'))
        cx.fillStyle = '#FFFFFF'; cx.fillRect(0, 0, w, h); cx.drawImage(im, 0, 0, w, h)
        for (const q of [0.85, 0.7, 0.55]) { const d = cv.toDataURL('image/jpeg', q); if (d.length <= MAX_B64) return resolve(d) }
      }
      reject(new Error('Image trop détaillée : choisissez une image plus simple ou plus petite'))
    }
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')) }
    im.src = url
  })
}

export default function ActionEditor({ a, camp, busy, save }: { a: Row; camp: string; busy: boolean; save: (p: Row) => Promise<void> }) {
  const c: Row = a.content ?? {}
  const pub = a.kind === 'publication'
  const init = (): Row => (pub ? { headline: c.headline ?? '', sub: c.sub ?? '', cta: c.cta ?? '', body: c.body ?? '' } : { draft: c.draft ?? '' })
  const [open, setOpen] = useState(false)
  const [f, setF] = useState<Row>(init)
  const [img, setImg] = useState<string | null>(null)
  const [rm, setRm] = useState(false)
  const [err, setErr] = useState('')

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setErr('')
    try { setImg(await compress(file)); setRm(false) } catch (x) { setErr(x instanceof Error ? x.message : 'Image invalide') }
  }
  function reset() { setF(init()); setImg(null); setRm(false); setErr(''); setOpen(false) }
  async function submit() {
    const p: Row = { ...f }
    if (img) p.image = img
    else if (rm) p.remove_image = true
    setOpen(false); setImg(null); setRm(false); setErr('')
    await save(p)
  }
  const hasImage = !rm && (!!img || !!c.image)
  const field = (k: string, label: string) => (<><label style={lab}>{label}</label><input style={inp} value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></>)

  return (
    <>
      <button style={btn(open)} disabled={busy} onClick={() => setOpen(!open)}>{open ? 'Fermer l’éditeur' : 'Modifier'}</button>
      {open && (
        <div style={{ flexBasis: '100%', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(201,168,76,.25)', borderRadius: 10, padding: 12, marginTop: 6 }}>
          {pub ? (
            <>
              {field('headline', 'Titre de l’affiche')}
              {field('sub', 'Sous-titre de l’affiche')}
              {field('cta', 'Texte du bouton de l’affiche')}
              <label style={lab}>{'Texte de la publication (conservez le lien de suivi'}{c.link ? ` : ${c.link}` : ''})</label>
              <textarea style={{ ...inp, minHeight: 140 }} value={f.body ?? ''} onChange={(e) => setF({ ...f, body: e.target.value })} />
              <label style={lab}>Visuel</label>
              <ActionVisual a={{ ...a, content: { ...c, ...f, image: rm ? '' : (img ?? c.image) } }} camp={camp} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <label style={{ ...btn(true), cursor: 'pointer' }}>
                  Téléverser mon visuel
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={pick} style={{ display: 'none' }} />
                </label>
                {hasImage && <button style={btn()} onClick={() => { setImg(null); setRm(true) }}>Revenir à l’affiche d’ASTA</button>}
              </div>
              <div style={{ fontSize: 11, color: '#6B7A8D', marginTop: 4 }}>JPEG, PNG ou WebP. L’image est redimensionnée et compressée automatiquement.</div>
            </>
          ) : (
            <>
              <label style={lab}>Message</label>
              <textarea style={{ ...inp, minHeight: 160 }} value={f.draft ?? ''} onChange={(e) => setF({ ...f, draft: e.target.value })} />
            </>
          )}
          {err && <div style={{ color: '#e8b04c', fontSize: 12, marginTop: 6 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button style={btn(true)} disabled={busy} onClick={submit}>Enregistrer</button>
            <button style={btn()} onClick={reset}>Annuler les modifications</button>
          </div>
        </div>
      )}
    </>
  )
}
