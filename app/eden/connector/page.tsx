'use client'
import { useState, useEffect } from 'react'
import { createBrowserSupabaseClient } from '@/app/supabaseClient'

interface PipelineItem {
  id: string
  nom: string
  partenaire: string
  zone: string
  service: string
  secteur: string
  montant: number
  statut: 'prospect' | 'contacte' | 'negociation' | 'actif' | 'rejete'
  date_contact: string
  relance: string
  notes: string
  dossier_id: string | null
}

const COLONNES = [
  { key: 'prospect', label: '📋 Prospect', color: '#6B7A8D' },
  { key: 'contacte', label: '📨 Contacté', color: '#3B82F6' },
  { key: 'negociation', label: '🤝 Négociation', color: '#C9A84C' },
  { key: 'actif', label: '✅ Actif', color: '#2ecc71' },
]

const ZONES = ['Bénin', 'Togo', 'Côte d\'Ivoire', 'Sénégal', 'UEMOA', 'OHADA']
const SERVICES = ['Levée PME', 'Financement BC', 'ONG/Impact', 'PPP', 'Garantie', 'Veille']
const PARTENAIRES = ['BOAD', 'AFD / Proparco', 'Oikocredit', 'Cofina', 'Ecobank', 'BNDE Bénin', 'GARI Fund', 'UNCDF', 'Advans', 'BOA Groupe', 'Autre']

export default function ConnectorPage() {
  const [items, setItems] = useState<PipelineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState<PipelineItem | null>(null)
  const [form, setForm] = useState<Partial<PipelineItem>>({ statut: 'prospect' })
  const [saving, setSaving] = useState(false)
  const [emailGen, setEmailGen] = useState('')
  const [genLoading, setGenLoading] = useState(false)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [dossiers, setDossiers] = useState<{id:string,nom_projet:string}[]>([])

  useEffect(() => {
    supabase.from('dossiers_eden').select('id, nom_projet').order('created_at', { ascending: false }).then(({ data }) => setDossiers(data || []))
    // Pré-remplir depuis SCOUT via URL params
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search)
      const p = sp.get('partenaire')
      const s = sp.get('service')
      const z = sp.get('zone')
      const t = sp.get('ticket_min')
      if (p) {
        setForm(f => ({ ...f, partenaire: p, service: s || '', zone: z || '', montant: t ? parseInt(t) : 0, statut: 'prospect' }))
        setEditing(true)
      }
    }
  }, [])

  const supabase = createBrowserSupabaseClient()

  useEffect(() => { load() }, [])

  const [currentUserId, setCurrentUserId] = useState<string>('')
  const [isAdminUser, setIsAdminUser] = useState(false)

  useEffect(() => {
    const raw = localStorage.getItem('eden_current_user')
    if (raw) {
      try {
        const u = JSON.parse(raw)
        setCurrentUserId(u.id || '')
        setIsAdminUser(u.role === 'Super-Admin' || u.role === 'Senior Analyst')
      } catch {}
    }
  }, [])

  async function load() {
    setLoading(true)
    const raw = localStorage.getItem('eden_current_user')
    const me = raw ? JSON.parse(raw) : null
    const isAdm = me?.role === 'Super-Admin' || me?.role === 'Senior Analyst'
    let query = supabase.from('pipeline_connector').select('*').order('created_at', { ascending: false })
    if (!isAdm && me?.id) query = query.eq('assigned_to', me.id)
    const { data } = await query
    setItems(data || [])
    setLoading(false)
  }

  async function save() {
    setSaving(true)
    if (form.id) {
      await supabase.from('pipeline_connector').update(form).eq('id', form.id)
    } else {
      await supabase.from('pipeline_connector').insert(form)
    }
    await load()
    setEditing(false)
    setForm({ statut: 'prospect' })
    setSelected(null)
    setSaving(false)
  }

  async function remove(id: string) {
    if (!confirm('Supprimer cette entrée ?')) return
    await supabase.from('pipeline_connector').delete().eq('id', id)
    setSelected(null)
    await load()
  }

  async function changeStatut(id: string, newStatut: string) {
    await supabase.from('pipeline_connector').update({ statut: newStatut }).eq('id', id)
    setItems(prev => prev.map(i => i.id === id ? { ...i, statut: newStatut as PipelineItem['statut'] } : i))
  }

  async function genererEmail(item: PipelineItem) {
    setGenLoading(true)
    setEmailGen('')
    const prompt = `Rédige un email professionnel de sollicitation de financement en français pour le Cabinet DOUKE.
Destinataire : ${item.partenaire}
Projet/Dossier : ${item.nom}
Zone : ${item.zone}
Service recherché : ${item.service}
Montant : ${item.montant?.toLocaleString('fr-FR')} FCFA
Ton : professionnel, concis, adapté au contexte OHADA/Afrique de l'Ouest.
Structure : Objet + Corps (3 paragraphes max) + Formule de politesse Cabinet DOUKE.`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] })
    })
    const d = await res.json()
    setEmailGen(d.content?.map((x: {type:string;text?:string}) => x.text || '').join('') || '')
    setGenLoading(false)
  }

  const S = {
    page: { color: '#E8E8E8', fontFamily: 'system-ui,sans-serif' } as React.CSSProperties,
    card: { background: '#162030', border: '1px solid rgba(201,168,76,.15)', borderRadius: '10px', padding: '14px', marginBottom: '10px', cursor: 'pointer' } as React.CSSProperties,
    input: { width: '100%', background: '#0F1923', border: '1px solid rgba(201,168,76,.2)', borderRadius: '8px', padding: '8px 12px', color: '#E8E8E8', fontSize: '13px', boxSizing: 'border-box' as const },
    btn: (gold?: boolean) => ({ padding: '8px 16px', borderRadius: '8px', fontWeight: 600, fontSize: '12px', cursor: 'pointer', border: '1px solid', background: gold ? 'linear-gradient(135deg,#C9A84C,#8a6d2f)' : 'rgba(201,168,76,.1)', color: gold ? '#0F1923' : '#C9A84C', borderColor: gold ? 'transparent' : 'rgba(201,168,76,.3)' }) as React.CSSProperties,
  }

  return (
    <div style={S.page}>
      <div style={{ fontSize: '20px', fontWeight: 700, color: '#C9A84C', marginBottom: '4px' }}>🟢 CONNECTOR — Pipeline de mise en relation</div>
      <div style={{ fontSize: '13px', color: '#6B7A8D', marginBottom: '20px' }}>Kanban de suivi — {items.length} entrées pipeline</div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button style={S.btn(true)} onClick={() => { setForm({ statut: 'prospect' }); setEditing(true); setSelected(null); setEmailGen('') }}>+ Nouvelle entrée</button>
        <button style={S.btn()} onClick={load}>🔄 Actualiser</button>
      </div>

      {loading ? <div style={{ color: '#6B7A8D', fontSize: '13px' }}>Chargement…</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', alignItems: 'start' }}>
          {COLONNES.map(col => {
            const colItems = items.filter(i => i.statut === col.key)
            return (
              <div key={col.key}
                onDragOver={e => { e.preventDefault(); setDragOver(col.key) }}
                onDrop={e => { const id = e.dataTransfer.getData('id'); if (id) changeStatut(id, col.key); setDragOver(null) }}
                onDragLeave={() => setDragOver(null)}
                style={{ background: dragOver === col.key ? 'rgba(201,168,76,.05)' : '#0F1923', border: `1px solid ${dragOver === col.key ? 'rgba(201,168,76,.3)' : 'rgba(255,255,255,.06)'}`, borderRadius: '12px', padding: '12px', minHeight: '200px', transition: 'all .2s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: col.color }}>{col.label}</div>
                  <div style={{ fontSize: '11px', background: `${col.color}20`, color: col.color, padding: '2px 8px', borderRadius: '10px', border: `1px solid ${col.color}40` }}>{colItems.length}</div>
                </div>
                {colItems.map(item => (
                  <div key={item.id} draggable
                    onDragStart={e => e.dataTransfer.setData('id', item.id)}
                    onClick={() => { setSelected(item); setEditing(false); setEmailGen('') }}
                    style={{ ...S.card, borderColor: selected?.id === item.id ? 'rgba(201,168,76,.4)' : 'rgba(201,168,76,.1)' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#E8E8E8', marginBottom: '4px' }}>{item.nom}</div>
                    <div style={{ fontSize: '11px', color: '#C9A84C', marginBottom: '4px' }}>{item.partenaire}</div>
                    <div style={{ fontSize: '11px', color: '#6B7A8D', marginBottom: '6px' }}>{item.zone} · {item.service}</div>
                    {item.montant > 0 && <div style={{ fontSize: '12px', fontWeight: 600, color: '#A8B4C0' }}>{(item.montant / 1000000).toFixed(0)} M FCFA</div>}
                    {item.relance && <div style={{ fontSize: '10px', color: '#e67e22', marginTop: '6px' }}>⏰ Relance : {item.relance}</div>}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {/* PANNEAU DÉTAIL / FORMULAIRE */}
      {(selected || editing) && (
        <div style={{ position: 'fixed', top: 0, right: 0, width: '420px', height: '100vh', background: '#162030', borderLeft: '1px solid rgba(201,168,76,.2)', padding: '24px', overflowY: 'auto', zIndex: 100 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#C9A84C' }}>{editing ? (form.id ? 'Modifier' : 'Nouvelle entrée') : selected?.nom}</div>
            <button onClick={() => { setSelected(null); setEditing(false); setForm({ statut: 'prospect' }); setEmailGen('') }} style={{ background: 'none', border: 'none', color: '#6B7A8D', cursor: 'pointer', fontSize: '18px' }}>✕</button>
          </div>

          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[['nom', 'Nom du dossier *'], ['notes', 'Notes']].map(([k, l]) => (
                <div key={k}>
                  <label style={{ fontSize: '11px', color: '#6B7A8D', display: 'block', marginBottom: '4px' }}>{l}</label>
                  <input style={S.input} value={(form[k as keyof PipelineItem] as string) || ''} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
                </div>
              ))}
              {[['zone', 'Zone', ZONES], ['service', 'Service', SERVICES], ['partenaire', 'Partenaire', PARTENAIRES]].map(([k, l, opts]) => (
                <div key={k as string}>
                  <label style={{ fontSize: '11px', color: '#6B7A8D', display: 'block', marginBottom: '4px' }}>{l as string}</label>
                  <select style={S.input} value={(form[k as keyof PipelineItem] as string) || ''} onChange={e => setForm(f => ({ ...f, [k as string]: e.target.value }))}>
                    <option value="">-- Choisir --</option>
                    {(opts as string[]).map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
              <div>
                <label style={{ fontSize: '11px', color: '#6B7A8D', display: 'block', marginBottom: '4px' }}>Montant (FCFA)</label>
                <input type="number" style={S.input} value={form.montant || ''} onChange={e => setForm(f => ({ ...f, montant: +e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#6B7A8D', display: 'block', marginBottom: '4px' }}>Date de relance</label>
                <input type="date" style={S.input} value={form.relance || ''} onChange={e => setForm(f => ({ ...f, relance: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#6B7A8D', display: 'block', marginBottom: '4px' }}>Statut initial</label>
                <select style={S.input} value={form.statut || 'prospect'} onChange={e => setForm(f => ({ ...f, statut: e.target.value as PipelineItem['statut'] }))}>
                  {COLONNES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#6B7A8D', marginBottom: '4px' }}>Dossier ARCHITECT lié</div>
                  <select value={form.dossier_id || ''} onChange={e => setForm(f => ({...f, dossier_id: e.target.value || null}))} style={S.input}>
                    <option value=''>-- Aucun dossier lié --</option>
                    {dossiers.map(d => <option key={d.id} value={d.id}>{d.nom_projet}</option>)}
                  </select>
                </div>
                <button style={S.btn(true)} onClick={save} disabled={saving}>{saving ? '…' : '💾 Sauvegarder'}</button>
                <button style={S.btn()} onClick={() => { setEditing(false); setForm({ statut: 'prospect' }) }}>Annuler</button>
              </div>
            </div>
          ) : selected && (
            <div>
              {[['Partenaire', selected.partenaire], ['Zone', selected.zone], ['Service', selected.service], ['Montant', (selected.montant / 1000000).toFixed(1) + ' M FCFA'], ['Statut', selected.statut], ['Relance', selected.relance || '—'], ['Notes', selected.notes || '—']].map(([l, v]) => (
                <div key={l as string} style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '11px', color: '#6B7A8D' }}>{l}</div>
                  <div style={{ fontSize: '13px', color: '#E8E8E8', fontWeight: 500 }}>{v}</div>
                </div>
              ))}

              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <button style={S.btn(true)} onClick={() => { setForm(selected); setEditing(true) }}>✏️ Modifier</button>
                <button style={{ ...S.btn(), color: '#e74c3c', borderColor: 'rgba(231,76,60,.3)' }} onClick={() => remove(selected.id)}>🗑️ Supprimer</button>
              </div>

              <div style={{ borderTop: '1px solid rgba(201,168,76,.15)', paddingTop: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#C9A84C', marginBottom: '10px' }}>✉️ Générer un email de sollicitation</div>
                <button style={S.btn(true)} onClick={() => genererEmail(selected)} disabled={genLoading}>
                  {genLoading ? '⏳ Génération…' : '✨ Générer l\'email'}
                </button>
                {emailGen && (
                  <div style={{ marginTop: '14px' }}>
                    <textarea style={{ ...S.input, minHeight: '220px', resize: 'vertical', lineHeight: '1.6' }} value={emailGen} onChange={e => setEmailGen(e.target.value)} />
                    <button style={{ ...S.btn(), marginTop: '8px' }} onClick={() => { navigator.clipboard.writeText(emailGen) }}>📋 Copier</button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
