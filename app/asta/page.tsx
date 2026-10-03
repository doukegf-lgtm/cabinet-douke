'use client'
import { useCallback, useEffect, useState } from 'react'
import { posterSvg } from '@/lib/asta/ops/content'

type Row = Record<string, any>
const GOLD = '#C9A84C'
const box: React.CSSProperties = { background: '#162030', border: '1px solid rgba(201,168,76,.2)', borderRadius: 12, padding: 14, marginBottom: 10 }
const inp: React.CSSProperties = { width: '100%', padding: 8, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 8, color: '#E8E8E8', fontSize: 13, boxSizing: 'border-box' }
const btn = (gold = false): React.CSSProperties => ({ padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, textDecoration: 'none', display: 'inline-block', border: `1px solid ${gold ? 'rgba(201,168,76,.5)' : 'rgba(255,255,255,.15)'}`, background: gold ? 'rgba(201,168,76,.15)' : 'rgba(255,255,255,.05)', color: gold ? GOLD : '#C8D0DA' })
const CS: Record<string, string> = { draft: 'Brouillon', active: 'Active', paused: 'En pause', completed: 'Terminée', cancelled: 'Annulée' }
const PS: Record<string, string> = { proposed: 'Proposé', accepted: 'Accepté', rejected: 'Refusé', contacted: 'Contacté', replied: 'A répondu', meeting: 'Rendez-vous', do_not_contact: 'Ne pas contacter' }
const AS: Record<string, string> = { proposed: 'À valider', approved: 'Validée', done: 'Faite', cancelled: 'Annulée' }
const TY: Record<string, string> = { prospection: 'Prospection', relance: 'Relance', publication: 'Publication' }
const POPS: Record<string, [string, string][]> = {
  proposed: [['accept', 'Accepter'], ['reject', 'Refuser'], ['dnc', 'Ne pas contacter']], accepted: [['contacted', 'Contacté'], ['reject', 'Refuser'], ['dnc', 'Ne pas contacter']],
  contacted: [['replied', 'A répondu'], ['meeting', 'Rendez-vous'], ['dnc', 'Ne pas contacter']], replied: [['meeting', 'Rendez-vous'], ['dnc', 'Ne pas contacter']],
}
const pl = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`
const reach = (contact: string | null, text: string) => !contact ? null
  : contact.includes('@') ? `mailto:${contact}?subject=${encodeURIComponent('DOUKE Growth & Funding')}&body=${encodeURIComponent(text)}`
  : `https://wa.me/${contact.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`

function poster(a: Row, camp: string) {
  const c = a.content ?? {}
  const svg = posterSvg({ headline: String(c.headline ?? ''), sub: String(c.sub ?? ''), cta: String(c.cta ?? ''), footer: camp })
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  const img = new Image()
  img.onload = () => {
    const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1080
    cv.getContext('2d')?.drawImage(img, 0, 0)
    const l = document.createElement('a'); l.download = `${String(a.slot_key ?? 'visuel')}.png`; l.href = cv.toDataURL('image/png'); l.click()
    URL.revokeObjectURL(url)
  }
  img.src = url
}

export default function AstaPage() {
  const [list, setList] = useState<Row[]>([])
  const [sum, setSum] = useState<Row>({})
  const [sel, setSel] = useState('')
  const [det, setDet] = useState<Row | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState<Row>({ name: '', type: 'prospection', service: '', zone: '', sector: '', target_count: '20', conditions: '', start_date: '', end_date: '' })

  const api = useCallback(async (path: string, method = 'GET', body?: object) => {
    try {
      const r = await fetch(path, { method, cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
      const j: Row = await r.json().catch(() => ({}))
      if (r.status === 401) setMsg('Session absente ou expirée : connectez-vous depuis le menu principal.')
      else if (r.status === 403) setMsg('Page réservée aux administrateurs.')
      else if (!r.ok) setMsg(j.error || 'Erreur ' + r.status)
      return { ok: r.ok, j }
    } catch { setMsg('Erreur réseau.'); return { ok: false, j: {} as Row } }
  }, [])
  const loadList = useCallback(async () => { const r = await api('/api/asta/admin/campaigns'); if (r.ok) { setList(r.j.campaigns ?? []); setSum(r.j.summary ?? {}) } }, [api])
  const loadDet = useCallback(async (id: string) => { const r = await api('/api/asta/admin/campaigns/' + id); if (r.ok) setDet(r.j) }, [api])
  useEffect(() => { loadList() }, [loadList])
  useEffect(() => { if (sel) loadDet(sel); else setDet(null) }, [sel, loadDet])

  async function act(path: string, body: Row, after?: (j: Row) => string) {
    setBusy(true); setMsg('')
    const r = await api(path, 'PATCH', body)
    if (r.ok && after) setMsg(after(r.j))
    await Promise.all([loadList(), sel ? loadDet(sel) : Promise.resolve()])
    setBusy(false)
  }
  async function create() {
    setBusy(true); setMsg('')
    const r = await api('/api/asta/admin/campaigns', 'POST', { ...f, target_count: Number(f.target_count) })
    if (r.ok) { setF({ ...f, name: '', conditions: '' }); setSel(r.j.campaign.id); await loadList() }
    setBusy(false)
  }
  function brief() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return setMsg('Synthèse vocale indisponible sur ce navigateur.')
    const t = `Bonjour. Vous avez ${pl(sum.active ?? 0, 'campagne')} active${(sum.active ?? 0) > 1 ? 's' : ''}, ${pl(sum.profiles_proposed ?? 0, 'profil')} à examiner et ${pl(sum.actions_to_approve ?? 0, 'action')} à valider.`
    const u = new SpeechSynthesisUtterance(t); u.lang = 'fr-FR'
    const v = window.speechSynthesis.getVoices().find((x) => x.lang.toLowerCase().startsWith('fr')); if (v) u.voice = v
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(u)
  }
  function results(a: Row) {
    const s = window.prompt('Envois ou diffusions ?', String(a.sent_count ?? 0)); if (s === null) return
    const r = window.prompt('Réponses ?', String(a.reply_count ?? 0)); if (r === null) return
    const m = window.prompt('Rendez-vous ?', String(a.meeting_count ?? 0)); if (m === null) return
    act('/api/asta/admin/actions/' + a.id, { op: 'stats', sent: s, replies: r, meetings: m })
  }

  const head = (
    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
      <div style={{ color: GOLD, fontWeight: 800, letterSpacing: 2 }}>ASTA · DOUKE</div>
      <div style={{ display: 'flex', gap: 14, fontSize: 13 }}>
        <a href="/" style={{ color: GOLD }}>{'← Menu principal'}</a>
        <a href="/asta/parler" style={{ color: '#A8B4C0' }}>Parler à ASTA</a>
        <a href="/conversation" style={{ color: '#A8B4C0' }}>Conversation publique</a>
      </div>
    </div>
  )
  const shell = (children: React.ReactNode) => (
    <main style={{ minHeight: '100vh', background: '#0F1923', color: '#E8E8E8', padding: 20, fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>{head}{msg && <div style={{ color: '#e8b04c', margin: '10px 0', fontSize: 13 }}>{msg}</div>}{children}</div>
    </main>
  )

  if (sel && !det) return shell(<div style={{ color: '#6B7A8D' }}>Chargement…</div>)

  if (sel && det) {
    const c: Row = det.campaign, st: Row = det.stats, profiles: Row[] = det.profiles ?? [], actions: Row[] = det.actions ?? []
    const op = (o: string, label: string, gold = false) => <button key={o} style={btn(gold)} disabled={busy} onClick={() => act('/api/asta/admin/campaigns/' + c.id, { op: o })}>{label}</button>
    return shell(<>
      <button style={btn()} onClick={() => setSel('')}>{'← Campagnes'}</button>
      <h1 style={{ fontSize: 24, margin: '10px 0 2px' }}>{c.name}</h1>
      <div style={{ color: '#A8B4C0', fontSize: 13 }}>{TY[c.type]} · {CS[c.status]} · code {c.code} · du {c.start_date} au {c.end_date}</div>
      <div style={{ color: '#A8B4C0', fontSize: 13, margin: '4px 0 10px' }}>{[c.service, c.zone, c.sector].filter(Boolean).join(' · ')}{c.conditions ? ` · ${c.conditions}` : ''} · objectif {c.target_count}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {c.status === 'draft' && op('validate', 'Valider la campagne', true)}
        {c.status === 'active' && c.type !== 'publication' && <button style={btn(true)} disabled={busy} onClick={() => act('/api/asta/admin/campaigns/' + c.id, { op: 'discover' }, (j) => `${j.added ?? 0} profil(s) proposé(s), ${j.dropped ?? 0} écarté(s)${j.note ? ' · ' + j.note : ''}`)}>Chercher des profils maintenant</button>}
        {['draft', 'active', 'paused'].includes(c.status) && <button style={btn(true)} disabled={busy} onClick={() => act('/api/asta/admin/campaigns/' + c.id, { op: 'propose_actions' }, (j) => `${j.created ?? 0} action(s) préparée(s)${j.note ? ' · ' + j.note : ''}`)}>Préparer les actions</button>}
        {c.status === 'active' && op('pause', 'Pause')}{c.status === 'paused' && op('resume', 'Reprendre')}
        {['active', 'paused'].includes(c.status) && op('complete', 'Terminer')}{['draft', 'active', 'paused'].includes(c.status) && op('cancel', 'Annuler')}
      </div>
      <div style={{ ...box, fontSize: 13, color: '#A8B4C0' }}>
        <b style={{ color: GOLD }}>Statistiques</b><br />
        Lien : <code>/diagnostic?c={c.code}</code> · {st.tracking.started} diagnostic(s) commencé(s), {st.tracking.completed} terminé(s), {st.tracking.leads} prospect(s) récupéré(s)<br />
        Profils : {st.profiles.proposed} proposé(s), {st.profiles.accepted} accepté(s), {st.profiles.contacted} contacté(s), {st.profiles.replied} réponse(s), {st.profiles.meeting} rendez-vous · avancement {st.progress ?? 0} % de l&apos;objectif<br />
        Actions : {st.actions.done}/{st.actions.total} faites · {st.actions.sent} envoi(s)/diffusion(s), {st.actions.replies} réponse(s), {st.actions.meetings} rendez-vous{st.actions.reply_rate !== null ? ` · taux de réponse ${st.actions.reply_rate} %` : ''}
      </div>
      <h2 style={{ fontSize: 16 }}>Profils ({profiles.length})</h2>
      {profiles.length === 0 && <div style={{ color: '#6B7A8D', fontSize: 13 }}>Aucun profil pour le moment.</div>}
      {profiles.map((p) => (
        <div key={p.id} style={box}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}><b>{p.name}</b><span style={{ color: GOLD, fontSize: 12 }}>{PS[p.status]}{p.fit_score !== null ? ` · adéquation ${p.fit_score}` : ''}</span></div>
          <div style={{ color: '#A8B4C0', fontSize: 13 }}>{[p.sector, p.city].filter(Boolean).join(' · ')}{p.public_contact ? ` · ${p.public_contact}` : ' · contact non trouvé'}</div>
          {p.reason && <div style={{ color: '#A8B4C0', fontSize: 12, marginTop: 2 }}>{p.reason}</div>}
          {p.source_url && <div style={{ fontSize: 12, marginTop: 2 }}>Source à vérifier : <a href={p.source_url} target="_blank" rel="noreferrer" style={{ color: GOLD }}>{p.source_url}</a></div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>{(POPS[p.status] ?? []).map(([o, l]) => <button key={o} style={btn(o === 'accept')} disabled={busy} onClick={() => act('/api/asta/admin/profiles/' + p.id, { op: o })}>{l}</button>)}</div>
        </div>
      ))}
      <h2 style={{ fontSize: 16, marginTop: 20 }}>Actions ({actions.length})</h2>
      {actions.length === 0 && <div style={{ color: '#6B7A8D', fontSize: 13 }}>{'Cliquez sur « Préparer les actions ».'}</div>}
      {actions.map((a) => {
        const draft = String(a.content?.draft ?? a.content?.body ?? '')
        const link = a.kind === 'message' ? reach(a.content?.contact ?? null, draft) : null
        return (
          <div key={a.id} style={box}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}><b>{a.title}</b><span style={{ color: GOLD, fontSize: 12 }}>{AS[a.status]}{a.scheduled_at ? ` · prévue ${new Date(a.scheduled_at).toLocaleDateString('fr-FR')}` : ''}</span></div>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, background: 'rgba(255,255,255,.05)', padding: 10, borderRadius: 8, margin: '8px 0' }}>{draft}</pre>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {a.status === 'proposed' && <button style={btn(true)} disabled={busy} onClick={() => act('/api/asta/admin/actions/' + a.id, { op: 'approve' })}>Valider</button>}
              {a.status !== 'proposed' && a.status !== 'cancelled' && <button style={btn()} onClick={() => navigator.clipboard.writeText(draft)}>Copier</button>}
              {a.status === 'approved' && link && <a style={btn(true)} href={link} target="_blank" rel="noreferrer">{String(a.content?.contact ?? '').includes('@') ? 'Ouvrir dans la messagerie' : 'Ouvrir dans WhatsApp'}</a>}
              {a.kind === 'publication' && a.status !== 'cancelled' && <button style={btn()} onClick={() => poster(a, c.name)}>Télécharger l&apos;affiche</button>}
              {a.status === 'approved' && <button style={btn(true)} disabled={busy} onClick={() => act('/api/asta/admin/actions/' + a.id, { op: 'done' })}>Marquer comme faite</button>}
              {(a.status === 'approved' || a.status === 'done') && <button style={btn()} onClick={() => results(a)}>Saisir les résultats</button>}
              {(a.status === 'proposed' || a.status === 'approved') && <button style={btn()} disabled={busy} onClick={() => act('/api/asta/admin/actions/' + a.id, { op: 'cancel' })}>Annuler</button>}
            </div>
          </div>
        )
      })}
    </>)
  }

  const fld = (k: string, label: string, ph = '') => <div><label style={{ fontSize: 11, color: '#6B7A8D' }}>{label}</label><input style={inp} value={f[k]} placeholder={ph} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
  return shell(<>
    <h1 style={{ fontSize: 26, margin: '8px 0 4px' }}>Centre opérationnel</h1>
    <p style={{ color: '#A8B4C0', marginTop: 0, fontSize: 14 }}>{'ASTA cherche et propose, vous validez, l’envoi reste entre vos mains.'}</p>
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
      <span style={{ fontSize: 13, color: '#A8B4C0' }}>{pl(sum.active ?? 0, 'campagne')} active{(sum.active ?? 0) > 1 ? 's' : ''} · {pl(sum.profiles_proposed ?? 0, 'profil')} à examiner · {pl(sum.actions_to_approve ?? 0, 'action')} à valider</span>
      <button style={btn(true)} onClick={brief}>Briefing vocal</button>
    </div>
    <div style={box}>
      <b style={{ color: GOLD }}>Nouvelle campagne</b>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10, marginTop: 8 }}>
        {fld('name', 'Nom', 'Ex. Formation du 20 octobre')}
        <div><label style={{ fontSize: 11, color: '#6B7A8D' }}>Type</label><select style={inp} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="prospection">Prospection (ASTA cherche des profils)</option><option value="relance">Relance (prospects avec consentement)</option><option value="publication">Publication (visuels et textes)</option></select></div>
        {fld('service', 'Service DOUKE')}{fld('zone', 'Zone géographique', 'Ex. Cotonou')}{fld('sector', 'Secteur (facultatif)')}{fld('target_count', 'Nombre de profils visé')}
        {fld('conditions', 'Conditions (facultatif)')}
        <div><label style={{ fontSize: 11, color: '#6B7A8D' }}>Début</label><input style={inp} type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></div>
        <div><label style={{ fontSize: 11, color: '#6B7A8D' }}>Fin</label><input style={inp} type="date" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></div>
      </div>
      <div style={{ marginTop: 10 }}><button style={btn(true)} disabled={busy} onClick={create}>Créer (brouillon à valider)</button></div>
    </div>
    <h2 style={{ fontSize: 16 }}>Campagnes ({list.length})</h2>
    {list.map((c) => (
      <div key={c.id} style={{ ...box, cursor: 'pointer' }} onClick={() => setSel(c.id)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}><b>{c.name}</b><span style={{ color: GOLD, fontSize: 12 }}>{TY[c.type]} · {CS[c.status]}</span></div>
        <div style={{ color: '#A8B4C0', fontSize: 12 }}>du {c.start_date} au {c.end_date} · objectif {c.target_count} · {c.profiles.proposed ?? 0} à examiner · {c.actions.proposed ?? 0} action(s) à valider</div>
      </div>
    ))}
  </>)
}
