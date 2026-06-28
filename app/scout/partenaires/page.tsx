'use client'
import { useState, useEffect } from 'react'
import { createBrowserSupabaseClient } from '@/app/supabaseClient'

const ZONES = ['Tous', 'Bénin', 'Togo', 'Côte d\'Ivoire', 'Sénégal', 'UEMOA', 'OHADA']
const SERVICES = ['Tous', 'Levée PME', 'Financement BC', 'ONG/Impact', 'PPP', 'Garantie', 'Veille']
const TYPES = ['Tous', 'Banque', 'Institution de développement', 'Fonds d\'investissement', 'IMF', 'Garantie', 'Agence']

interface Partenaire {
  id: string
  nom: string
  type: string
  zones: string[]
  services: string[]
  description: string
  contact: string
  email: string
  site: string
  ticket_min: number
  ticket_max: number
  score: number
  statut: string
}

const PARTENAIRES_INITIAUX: Omit<Partenaire, 'id'>[] = [
  { nom: 'BOAD', type: 'Institution de développement', zones: ['UEMOA', 'Bénin', 'Togo', 'Côte d\'Ivoire', 'Sénégal'], services: ['PPP', 'Financement BC'], description: 'Banque Ouest Africaine de Développement — financement de projets structurants', contact: 'Direction des opérations', email: 'info@boad.org', site: 'www.boad.org', ticket_min: 500000000, ticket_max: 50000000000, score: 95, statut: 'actif' },
  { nom: 'AFD / Proparco', type: 'Institution de développement', zones: ['UEMOA', 'Bénin', 'Sénégal', 'Côte d\'Ivoire'], services: ['ONG/Impact', 'Levée PME', 'PPP'], description: 'Agence Française de Développement & bras privé Proparco', contact: 'Bureau Cotonou', email: 'afd-cotonou@afd.fr', site: 'www.proparco.fr', ticket_min: 100000000, ticket_max: 20000000000, score: 90, statut: 'actif' },
  { nom: 'Oikocredit', type: 'Fonds d\'investissement', zones: ['Bénin', 'Togo', 'Sénégal'], services: ['ONG/Impact', 'Levée PME'], description: 'Financement coopératif — microfinance et agriculture', contact: 'Bureau Afrique de l\'Ouest', email: 'info@oikocredit.org', site: 'www.oikocredit.org', ticket_min: 10000000, ticket_max: 500000000, score: 80, statut: 'prospect' },
  { nom: 'Cofina', type: 'IMF', zones: ['Bénin', 'Togo', 'Côte d\'Ivoire', 'Sénégal'], services: ['Levée PME', 'Financement BC'], description: 'Institution de microfinance — crédit PME et entrepreneuriat', contact: 'Direction commerciale', email: 'contact@cofina.net', site: 'www.cofina.net', ticket_min: 1000000, ticket_max: 100000000, score: 75, statut: 'actif' },
  { nom: 'Ecobank', type: 'Banque', zones: ['Bénin', 'Togo', 'Côte d\'Ivoire', 'Sénégal', 'OHADA'], services: ['Levée PME', 'Financement BC', 'Garantie'], description: 'Banque panafricaine — financement PME et trade finance', contact: 'Direction PME', email: 'pme@ecobank.com', site: 'www.ecobank.com', ticket_min: 5000000, ticket_max: 2000000000, score: 85, statut: 'actif' },
  { nom: 'BNDE Bénin', type: 'Institution de développement', zones: ['Bénin'], services: ['Levée PME', 'PPP', 'Financement BC'], description: 'Banque Nationale de Développement Économique du Bénin', contact: 'Direction des crédits', email: 'contact@bnde.bj', site: 'www.bnde.bj', ticket_min: 5000000, ticket_max: 5000000000, score: 88, statut: 'actif' },
  { nom: 'GARI Fund', type: 'Garantie', zones: ['UEMOA', 'Bénin', 'Togo'], services: ['Garantie', 'Levée PME'], description: 'Fonds de garantie des investissements privés en Afrique de l\'Ouest', contact: 'Direction technique', email: 'info@garantie-gari.com', site: 'www.garantie-gari.com', ticket_min: 5000000, ticket_max: 1000000000, score: 82, statut: 'actif' },
  { nom: 'UNCDF', type: 'Agence', zones: ['Bénin', 'Togo', 'Sénégal'], services: ['ONG/Impact', 'Financement BC'], description: 'Fonds d\'équipement des Nations Unies — finance inclusive', contact: 'Bureau Dakar', email: 'info@uncdf.org', site: 'www.uncdf.org', ticket_min: 50000000, ticket_max: 2000000000, score: 78, statut: 'prospect' },
  { nom: 'Advans CI', type: 'IMF', zones: ['Côte d\'Ivoire'], services: ['Levée PME'], description: 'Institution de microfinance — crédit PME Côte d\'Ivoire', contact: 'Direction crédit', email: 'contact@advans.com', site: 'www.advans.com', ticket_min: 500000, ticket_max: 50000000, score: 72, statut: 'prospect' },
  { nom: 'BOA Groupe', type: 'Banque', zones: ['Bénin', 'Togo', 'Côte d\'Ivoire', 'Sénégal', 'OHADA'], services: ['Levée PME', 'Financement BC', 'Garantie'], description: 'Bank Of Africa — banque commerciale panafricaine', contact: 'Direction PME', email: 'contact@bank-of-africa.net', site: 'www.bank-of-africa.net', ticket_min: 2000000, ticket_max: 3000000000, score: 83, statut: 'actif' },
]

export default function PartenairesPage() {
  const [partenaires, setPartenaires] = useState<Partenaire[]>([])
  const [loading, setLoading] = useState(true)
  const [zone, setZone] = useState('Tous')
  const [service, setService] = useState('Tous')
  const [type, setType] = useState('Tous')
  const [search, setSearch] = useState('')
  const [scoreMin, setScoreMin] = useState(0)
  const [selected, setSelected] = useState<Partenaire | null>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<Partenaire>>({})
  const [saving, setSaving] = useState(false)
  const [seeded, setSeeded] = useState(false)

  const supabase = createBrowserSupabaseClient()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('partenaires_eden').select('*').order('score', { ascending: false })
    if (data && data.length > 0) {
      setPartenaires(data)
    } else if (!seeded) {
      await seed()
    }
    setLoading(false)
  }

  async function seed() {
    const { data } = await supabase.from('partenaires_eden').insert(PARTENAIRES_INITIAUX).select()
    if (data) { setPartenaires(data); setSeeded(true) }
  }

  const filtered = partenaires.filter(p => {
    if (zone !== 'Tous' && !p.zones?.includes(zone)) return false
    if (service !== 'Tous' && !p.services?.includes(service)) return false
    if (type !== 'Tous' && p.type !== type) return false
    if (p.score < scoreMin) return false
    if (search && !p.nom.toLowerCase().includes(search.toLowerCase()) && !p.description?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  async function save() {
    setSaving(true)
    if (form.id) {
      await supabase.from('partenaires_eden').update(form).eq('id', form.id)
    } else {
      await supabase.from('partenaires_eden').insert(form)
    }
    await load()
    setEditing(false)
    setForm({})
    setSelected(null)
    setSaving(false)
  }

  async function remove(id: string) {
    if (!confirm('Supprimer ce partenaire ?')) return
    await supabase.from('partenaires_eden').delete().eq('id', id)
    setSelected(null)
    await load()
  }

  function scoreColor(s: number) {
    if (s >= 85) return '#2ecc71'
    if (s >= 70) return '#C9A84C'
    if (s >= 55) return '#e67e22'
    return '#e74c3c'
  }

  function fmtMontant(n: number) {
    if (n >= 1000000000) return (n / 1000000000).toFixed(0) + ' Mrd'
    if (n >= 1000000) return (n / 1000000).toFixed(0) + ' M'
    return n?.toLocaleString('fr-FR')
  }

  const S = {
    page: { color: '#E8E8E8', fontFamily: 'system-ui,sans-serif' } as React.CSSProperties,
    card: { background: '#162030', border: '1px solid rgba(201,168,76,.15)', borderRadius: '12px', padding: '16px' } as React.CSSProperties,
    input: { width: '100%', background: '#0F1923', border: '1px solid rgba(201,168,76,.2)', borderRadius: '8px', padding: '8px 12px', color: '#E8E8E8', fontSize: '13px', boxSizing: 'border-box' } as React.CSSProperties,
    btn: (gold?: boolean) => ({ padding: '8px 16px', borderRadius: '8px', fontWeight: 600, fontSize: '12px', cursor: 'pointer', border: '1px solid', background: gold ? 'linear-gradient(135deg,#C9A84C,#8a6d2f)' : 'rgba(201,168,76,.1)', color: gold ? '#0F1923' : '#C9A84C', borderColor: gold ? 'transparent' : 'rgba(201,168,76,.3)' }) as React.CSSProperties,
  }

  return (
    <div style={S.page}>
      <div style={{ fontSize: '20px', fontWeight: 700, color: '#C9A84C', marginBottom: '4px' }}>🔵 SCOUT — Partenaires financiers</div>
      <div style={{ fontSize: '13px', color: '#6B7A8D', marginBottom: '20px' }}>Base de partenaires OHADA — {partenaires.length} partenaires enregistrés</div>

      {/* FILTRES */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px', marginBottom: '16px' }}>
        <input style={S.input} placeholder="Rechercher…" value={search} onChange={e => setSearch(e.target.value)} />
        {[['zone', zone, setZone, ZONES], ['service', service, setService, SERVICES], ['type', type, setType, TYPES]].map(([k, v, fn, opts]) => (
          <select key={k as string} style={S.input} value={v as string} onChange={e => (fn as (v: string) => void)(e.target.value)}>
            {(opts as string[]).map(o => <option key={o}>{o}</option>)}
          </select>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: '#6B7A8D', whiteSpace: 'nowrap' }}>Score min : {scoreMin}</span>
          <input type="range" min={0} max={100} value={scoreMin} onChange={e => setScoreMin(+e.target.value)} style={{ flex: 1 }} />
        </div>
        <button style={S.btn(true)} onClick={() => { setForm({}); setEditing(true); setSelected(null) }}>+ Ajouter</button>
      </div>

      {loading ? (
        <div style={{ color: '#6B7A8D', fontSize: '13px' }}>Chargement…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
          {filtered.map(p => (
            <div key={p.id} onClick={() => { setSelected(p); setEditing(false) }} style={{ ...S.card, cursor: 'pointer', borderColor: selected?.id === p.id ? 'rgba(201,168,76,.5)' : 'rgba(201,168,76,.12)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#E8E8E8' }}>{p.nom}</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: scoreColor(p.score) }}>{p.score}</div>
              </div>
              <div style={{ fontSize: '11px', color: '#6B7A8D', marginBottom: '6px' }}>{p.type}</div>
              <div style={{ fontSize: '12px', color: '#A8B4C0', marginBottom: '10px', lineHeight: '1.5' }}>{p.description?.slice(0, 80)}…</div>
              <div style={{ height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,.06)', marginBottom: '8px' }}>
                <div style={{ height: '100%', width: `${p.score}%`, borderRadius: '2px', background: scoreColor(p.score) }} />
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {p.zones?.slice(0, 3).map(z => <span key={z} style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(201,168,76,.1)', color: '#C9A84C' }}>{z}</span>)}
              </div>
              <div style={{ fontSize: '11px', color: '#6B7A8D', marginTop: '8px' }}>
                Ticket : {fmtMontant(p.ticket_min)} – {fmtMontant(p.ticket_max)} FCFA
              </div>
            </div>
          ))}
        </div>
      )}

      {/* DÉTAIL / ÉDITION */}
      {(selected || editing) && (
        <div style={{ position: 'fixed', top: 0, right: 0, width: '400px', height: '100vh', background: '#162030', borderLeft: '1px solid rgba(201,168,76,.2)', padding: '24px', overflowY: 'auto', zIndex: 100 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#C9A84C' }}>{editing ? (form.id ? 'Modifier' : 'Nouveau partenaire') : selected?.nom}</div>
            <button onClick={() => { setSelected(null); setEditing(false); setForm({}) }} style={{ background: 'none', border: 'none', color: '#6B7A8D', cursor: 'pointer', fontSize: '18px' }}>✕</button>
          </div>

          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[['nom', 'Nom *'], ['type', 'Type'], ['description', 'Description'], ['contact', 'Contact'], ['email', 'Email'], ['site', 'Site web']].map(([k, l]) => (
                <div key={k}>
                  <label style={{ fontSize: '11px', color: '#6B7A8D', display: 'block', marginBottom: '4px' }}>{l}</label>
                  <input style={S.input} value={(form[k as keyof Partenaire] as string) || ''} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
                </div>
              ))}
              {[['ticket_min', 'Ticket min (FCFA)'], ['ticket_max', 'Ticket max (FCFA)'], ['score', 'Score (0-100)']].map(([k, l]) => (
                <div key={k}>
                  <label style={{ fontSize: '11px', color: '#6B7A8D', display: 'block', marginBottom: '4px' }}>{l}</label>
                  <input type="number" style={S.input} value={(form[k as keyof Partenaire] as number) || ''} onChange={e => setForm(f => ({ ...f, [k]: +e.target.value }))} />
                </div>
              ))}
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button style={S.btn(true)} onClick={save} disabled={saving}>{saving ? '…' : '💾 Sauvegarder'}</button>
                <button style={S.btn()} onClick={() => { setEditing(false); setForm({}) }}>Annuler</button>
              </div>
            </div>
          ) : selected && (
            <div>
              {[['Type', selected.type], ['Contact', selected.contact], ['Email', selected.email], ['Site', selected.site], ['Score', selected.score + ' / 100'], ['Ticket min', fmtMontant(selected.ticket_min) + ' FCFA'], ['Ticket max', fmtMontant(selected.ticket_max) + ' FCFA'], ['Statut', selected.statut]].map(([l, v]) => (
                <div key={l as string} style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '11px', color: '#6B7A8D' }}>{l}</div>
                  <div style={{ fontSize: '13px', color: '#E8E8E8', fontWeight: 500 }}>{v}</div>
                </div>
              ))}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', color: '#6B7A8D', marginBottom: '6px' }}>Zones</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {selected.zones?.map(z => <span key={z} style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px', background: 'rgba(201,168,76,.1)', color: '#C9A84C' }}>{z}</span>)}
                </div>
              </div>
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '11px', color: '#6B7A8D', marginBottom: '6px' }}>Services</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {selected.services?.map(s => <span key={s} style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px', background: 'rgba(46,204,113,.1)', color: '#2ecc71' }}>{s}</span>)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button style={S.btn(true)} onClick={() => { setForm(selected); setEditing(true) }}>✏️ Modifier</button>
                <button style={{ ...S.btn(), color: '#e74c3c', borderColor: 'rgba(231,76,60,.3)' }} onClick={() => remove(selected.id)}>🗑️ Supprimer</button>
                <a href={'/eden/connector?partenaire=' + encodeURIComponent(selected.nom) + '&service=' + encodeURIComponent((selected.services || [])[0] || '') + '&zone=' + encodeURIComponent((selected.zones || [])[0] || '') + '&ticket_min=' + (selected.ticket_min || 0)} style={{ ...S.btn(true), textDecoration: 'none', display: 'inline-block', background: 'rgba(46,204,113,.1)', borderColor: 'rgba(46,204,113,.3)', color: '#2ecc71' }}>🔗 Initier mise en relation</a>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
