'use client'
import { useState, useEffect } from 'react'
import { createBrowserSupabaseClient } from '@/app/supabaseClient'

interface Prospect {
  id: string
  nom: string
  structure: string
  contact: string
  email: string
  telephone: string
  zone: string
  secteur: string
  service_douke: string
  scoring: number
  source: string
  statut: string
  assigned_to: string | null
  notes: string
  created_at: string
}

interface Compte { id: string; name: string; username: string }
interface Service { id: string; nom: string; actif: boolean }

const STATUTS = ['nouveau','affecte','contacte','qualifie','perdu']
const STATUT_COLOR: Record<string,string> = { nouveau:'#6B7A8D',affecte:'#C9A84C',contacte:'#3B82F6',qualifie:'#2ecc71',perdu:'#e74c3c' }

export default function ProspectionPage() {
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [comptes, setComptes] = useState<Compte[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Prospect|null>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<Prospect>>({ statut:'nouveau', scoring:50 })
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genForm, setGenForm] = useState({ secteur:'', zone:'', service_douke:'', nb:'5' })
  const [showGen, setShowGen] = useState(false)
  const [filtreStatut, setFiltreStatut] = useState('tous')
  const [filtreService, setFiltreService] = useState('tous')
  const [session, setSession] = useState<{id:string,role:string}|null>(null)
  const sb = createBrowserSupabaseClient()

  useEffect(() => {
    const raw = localStorage.getItem('eden_current_user')
    if (raw) { try { setSession(JSON.parse(raw)) } catch {} }
    load()
  }, [])

  async function load() {
    setLoading(true)
    const [p, c, s] = await Promise.all([
      sb.from('scout_prospects').select('*').order('created_at', { ascending:false }),
      sb.from('auth_accounts').select('id,name,username').order('name'),
      sb.from('scout_services_douke').select('*').eq('actif', true).order('nom'),
    ])
    setProspects(p.data || [])
    setComptes(c.data || [])
    setServices(s.data || [])
    setLoading(false)
  }

  async function genererProspects() {
    if (!genForm.secteur || !genForm.service_douke) return
    setGenerating(true)
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({
          model:'claude-sonnet-4-6',
          max_tokens: 2000,
          system: `Tu es un expert commercial en Afrique de l'Ouest spécialisé dans l'identification de prospects qualifiés pour un cabinet de conseil (DOUKE). Génère une liste de prospects RÉALISTES et QUALIFIÉS. Réponds UNIQUEMENT en JSON valide: tableau de ${genForm.nb} objets avec les champs: nom (personne contact), structure (entreprise/organisation), contact (titre/poste), email (format valide plausible), telephone (format Bénin/UEMOA), zone, secteur, service_douke, scoring (0-100), source (comment identifier ce prospect), notes (pourquoi ce prospect est qualifié pour le service DOUKE indiqué).`,
          messages:[{ role:'user', content: `Génère ${genForm.nb} prospects qualifiés pour le service DOUKE "${genForm.service_douke}" dans le secteur "${genForm.secteur}" zone "${genForm.zone || 'Bénin'}". Ces prospects doivent avoir un besoin réel et identifiable pour ce service.` }]
        })
      })
      const data = await res.json()
      const text = data.content?.[0]?.text || '[]'
      const parsed = JSON.parse(text.replace(/```json|```/g,'').trim())
      const toInsert = parsed.map((p: Record<string,unknown>) => ({ ...p, statut:'nouveau', service_douke: genForm.service_douke }))
      await sb.from('scout_prospects').insert(toInsert)
      await load()
      setShowGen(false)
      setGenForm({ secteur:'', zone:'', service_douke:'', nb:'5' })
    } catch(e) { alert('Erreur génération IA') }
    setGenerating(false)
  }

  async function affecter(prospectId: string, userId: string) {
    const raw = localStorage.getItem('eden_current_user')
    const me = raw ? JSON.parse(raw) : null
    await sb.from('scout_prospects').update({ assigned_to: userId || null, assigned_by: me?.id || null, statut: userId ? 'affecte' : 'nouveau' }).eq('id', prospectId)
    await load()
    if (selected?.id === prospectId) setSelected(s => s ? {...s, assigned_to: userId, statut: userId ? 'affecte' : 'nouveau'} : null)
  }

  async function save() {
    setSaving(true)
    if (form.id) { await sb.from('scout_prospects').update(form).eq('id', form.id) }
    else { await sb.from('scout_prospects').insert(form) }
    await load(); setEditing(false); setForm({ statut:'nouveau', scoring:50 }); setSelected(null)
    setSaving(false)
  }

  async function remove(id: string) {
    if (!confirm('Supprimer ?')) return
    await sb.from('scout_prospects').delete().eq('id', id)
    setSelected(null); await load()
  }

  const isAdmin = session?.role === 'Super-Admin' || session?.role === 'Senior Analyst'
  const filtered = prospects.filter(p => {
    if (filtreStatut !== 'tous' && p.statut !== filtreStatut) return false
    if (filtreService !== 'tous' && p.service_douke !== filtreService) return false
    return true
  })

  const S = {
    card: { background:'#0F1923', border:'1px solid rgba(255,255,255,.06)', borderRadius:'10px', padding:'12px', marginBottom:'8px', cursor:'pointer' } as React.CSSProperties,
    input: { width:'100%', padding:'8px 10px', background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.1)', borderRadius:'8px', color:'#E8E8E8', fontSize:'12px', boxSizing:'border-box' as const },
    label: { fontSize:'11px', color:'#6B7A8D', marginBottom:'4px', display:'block' },
    btn: (gold=false) => ({ padding:'8px 14px', borderRadius:'8px', border:`1px solid ${gold?'rgba(201,168,76,.4)':' rgba(255,255,255,.1)'}`, background:gold?'rgba(201,168,76,.1)':' rgba(255,255,255,.04)', color:gold?'#C9A84C':'#A8B4C0', fontSize:'12px', cursor:'pointer', fontWeight:gold?600:400 } as React.CSSProperties)
  }

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 380px', gap:'20px' }}>
      <div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
          <h2 style={{ color:'#E8E8E8', fontSize:'16px', fontWeight:700, margin:0 }}>🔍 Prospection qualifiée</h2>
          <div style={{ display:'flex', gap:'8px' }}>
            <button style={S.btn()} onClick={() => setShowGen(!showGen)}>🤖 Générer prospects IA</button>
            <button style={S.btn(true)} onClick={() => { setForm({ statut:'nouveau', scoring:50 }); setEditing(true); setSelected(null) }}>+ Ajouter</button>
          </div>
        </div>

        {showGen && (
          <div style={{ background:'#0F1923', border:'1px solid rgba(201,168,76,.2)', borderRadius:'10px', padding:'14px', marginBottom:'12px' }}>
            <div style={{ fontSize:'13px', fontWeight:600, color:'#C9A84C', marginBottom:'12px' }}>🤖 Génération IA de prospects qualifiés</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'10px' }}>
              <div>
                <label style={S.label}>Secteur cible *</label>
                <input value={genForm.secteur} onChange={e => setGenForm(f => ({...f, secteur:e.target.value}))} placeholder="Ex: Agriculture, BTP, Santé…" style={S.input} />
              </div>
              <div>
                <label style={S.label}>Zone géographique</label>
                <input value={genForm.zone} onChange={e => setGenForm(f => ({...f, zone:e.target.value}))} placeholder="Ex: Bénin, Cotonou, UEMOA…" style={S.input} />
              </div>
              <div>
                <label style={S.label}>Service DOUKE *</label>
                <select value={genForm.service_douke} onChange={e => setGenForm(f => ({...f, service_douke:e.target.value}))} style={S.input}>
                  <option value="">-- Sélectionner --</option>
                  {services.map(s => <option key={s.id} value={s.nom}>{s.nom}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Nombre de prospects</label>
                <select value={genForm.nb} onChange={e => setGenForm(f => ({...f, nb:e.target.value}))} style={S.input}>
                  {['3','5','8','10'].map(n => <option key={n} value={n}>{n} prospects</option>)}
                </select>
              </div>
            </div>
            <div style={{ display:'flex', gap:'8px' }}>
              <button style={S.btn(true)} onClick={genererProspects} disabled={generating || !genForm.secteur || !genForm.service_douke}>{generating ? '⏳ Génération…' : '🚀 Générer et insérer'}</button>
              <button style={S.btn()} onClick={() => setShowGen(false)}>Annuler</button>
            </div>
          </div>
        )}

        <div style={{ display:'flex', gap:'6px', marginBottom:'8px', flexWrap:'wrap' }}>
          {['tous',...STATUTS].map(s => <button key={s} onClick={() => setFiltreStatut(s)} style={{ ...S.btn(filtreStatut===s), fontSize:'11px', padding:'4px 10px' }}>{s}</button>)}
        </div>
        <div style={{ display:'flex', gap:'6px', marginBottom:'12px', flexWrap:'wrap' }}>
          {['tous',...services.map(s => s.nom)].map(s => <button key={s} onClick={() => setFiltreService(s)} style={{ ...S.btn(filtreService===s), fontSize:'11px', padding:'4px 10px' }}>{s}</button>)}
        </div>

        {loading ? <div style={{ color:'#6B7A8D', fontSize:'13px' }}>Chargement…</div> : filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:'40px', color:'#6B7A8D', fontSize:'13px' }}>Aucun prospect — utilisez "Générer prospects IA" ou ajoutez manuellement</div>
        ) : filtered.map(p => (
          <div key={p.id} onClick={() => { setSelected(p); setEditing(false) }} style={{ ...S.card, borderColor: selected?.id===p.id ? 'rgba(201,168,76,.4)' : 'rgba(255,255,255,.06)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div>
                <div style={{ fontSize:'13px', fontWeight:600, color:'#E8E8E8' }}>{p.nom}</div>
                <div style={{ fontSize:'11px', color:'#6B7A8D' }}>{p.structure} · {p.zone}</div>
              </div>
              <div style={{ display:'flex', gap:'6px', alignItems:'center' }}>
                <span style={{ fontSize:'10px', padding:'2px 8px', borderRadius:'10px', background:`${STATUT_COLOR[p.statut]}22`, color:STATUT_COLOR[p.statut], border:`1px solid ${STATUT_COLOR[p.statut]}44` }}>{p.statut}</span>
                <span style={{ fontSize:'11px', fontWeight:700, color: p.scoring>=70?'#2ecc71':p.scoring>=40?'#C9A84C':'#e74c3c' }}>{p.scoring}/100</span>
              </div>
            </div>
            <div style={{ display:'flex', gap:'8px', marginTop:'6px', fontSize:'11px' }}>
              <span style={{ color:'#3B82F6' }}>{p.service_douke}</span>
              {p.assigned_to && <span style={{ color:'#2ecc71' }}>→ {comptes.find(c => c.id===p.assigned_to)?.name || 'Affecté'}</span>}
            </div>
          </div>
        ))}
      </div>

      <div>
        {selected && !editing && (
          <div style={{ background:'#0F1923', border:'1px solid rgba(201,168,76,.2)', borderRadius:'12px', padding:'16px', position:'sticky', top:'20px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'12px' }}>
              <div style={{ fontSize:'14px', fontWeight:700, color:'#C9A84C' }}>{selected.nom}</div>
              <button onClick={() => setSelected(null)} style={{ background:'none', border:'none', color:'#6B7A8D', cursor:'pointer', fontSize:'16px' }}>✕</button>
            </div>
            {[['Structure',selected.structure],['Poste',selected.contact],['Email',selected.email],['Tél',selected.telephone],['Zone',selected.zone],['Secteur',selected.secteur],['Service DOUKE',selected.service_douke],['Source',selected.source]].map(([l,v]) => v ? (
              <div key={l as string} style={{ marginBottom:'6px' }}>
                <div style={{ fontSize:'10px', color:'#6B7A8D' }}>{l as string}</div>
                <div style={{ fontSize:'12px', color:'#E8E8E8' }}>{v as string}</div>
              </div>
            ) : null)}
            <div style={{ marginBottom:'6px' }}>
              <div style={{ fontSize:'10px', color:'#6B7A8D', marginBottom:'2px' }}>Scoring</div>
              <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                <div style={{ flex:1, height:'6px', background:'rgba(255,255,255,.06)', borderRadius:'3px' }}>
                  <div style={{ width:`${selected.scoring}%`, height:'100%', borderRadius:'3px', background: selected.scoring>=70?'#2ecc71':selected.scoring>=40?'#C9A84C':'#e74c3c' }} />
                </div>
                <span style={{ fontSize:'12px', fontWeight:700, color:'#E8E8E8' }}>{selected.scoring}/100</span>
              </div>
            </div>
            {selected.notes && <div style={{ background:'rgba(255,255,255,.03)', borderRadius:'8px', padding:'8px', fontSize:'11px', color:'#A8B4C0', marginBottom:'10px' }}>{selected.notes}</div>}
            {isAdmin && (
              <div style={{ marginBottom:'10px' }}>
                <div style={{ fontSize:'11px', color:'#6B7A8D', marginBottom:'4px' }}>Affecter à un collaborateur</div>
                <select value={selected.assigned_to||''} onChange={e => affecter(selected.id, e.target.value)} style={{ width:'100%', padding:'7px 10px', background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.1)', borderRadius:'8px', color:'#E8E8E8', fontSize:'12px' }}>
                  <option value="">-- Non affecté --</option>
                  {comptes.map(c => <option key={c.id} value={c.id}>{c.name} (@{c.username})</option>)}
                </select>
              </div>
            )}
            <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
              <button style={S.btn(true)} onClick={() => { setForm(selected); setEditing(true) }}>✏️ Modifier</button>
              <button style={{ ...S.btn(), color:'#e74c3c', borderColor:'rgba(231,76,60,.3)' }} onClick={() => remove(selected.id)}>🗑️</button>
            </div>
          </div>
        )}
        {editing && (
          <div style={{ background:'#0F1923', border:'1px solid rgba(201,168,76,.2)', borderRadius:'12px', padding:'16px', position:'sticky', top:'20px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'14px' }}>
              <div style={{ fontSize:'14px', fontWeight:700, color:'#C9A84C' }}>{form.id?'Modifier':'Nouveau prospect'}</div>
              <button onClick={() => { setEditing(false); setForm({ statut:'nouveau', scoring:50 }) }} style={{ background:'none', border:'none', color:'#6B7A8D', cursor:'pointer', fontSize:'16px' }}>✕</button>
            </div>
            {([['Nom *','nom'],['Structure','structure'],['Poste/Contact','contact'],['Email','email'],['Téléphone','telephone'],['Zone','zone'],['Secteur','secteur']] as [string,string][]).map(([l,k]) => (
              <div key={k} style={{ marginBottom:'8px' }}>
                <label style={S.label}>{l}</label>
                <input value={(form as Record<string,unknown>)[k] as string||''} onChange={e => setForm(f => ({...f,[k]:e.target.value}))} style={S.input} />
              </div>
            ))}
            <div style={{ marginBottom:'8px' }}>
              <label style={S.label}>Service DOUKE</label>
              <select value={form.service_douke||''} onChange={e => setForm(f => ({...f,service_douke:e.target.value}))} style={S.input}>
                <option value="">-- Sélectionner --</option>
                {services.map(s => <option key={s.id} value={s.nom}>{s.nom}</option>)}
              </select>
            </div>
            <div style={{ marginBottom:'8px' }}>
              <label style={S.label}>Scoring (0-100)</label>
              <input type="number" min={0} max={100} value={form.scoring||50} onChange={e => setForm(f => ({...f,scoring:parseInt(e.target.value)||0}))} style={S.input} />
            </div>
            <div style={{ marginBottom:'8px' }}>
              <label style={S.label}>Statut</label>
              <select value={form.statut||'nouveau'} onChange={e => setForm(f => ({...f,statut:e.target.value}))} style={S.input}>
                {STATUTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ marginBottom:'12px' }}>
              <label style={S.label}>Notes</label>
              <textarea value={form.notes||''} onChange={e => setForm(f => ({...f,notes:e.target.value}))} rows={3} style={{ ...S.input, resize:'vertical' }} />
            </div>
            <div style={{ display:'flex', gap:'8px' }}>
              <button style={S.btn(true)} onClick={save} disabled={saving}>{saving?'…':'💾 Sauvegarder'}</button>
              <button style={S.btn()} onClick={() => { setEditing(false); setForm({ statut:'nouveau', scoring:50 }) }}>Annuler</button>
            </div>
          </div>
        )}
        {!selected && !editing && (
          <div style={{ background:'#0F1923', border:'1px solid rgba(255,255,255,.06)', borderRadius:'12px', padding:'20px', textAlign:'center', color:'#6B7A8D', fontSize:'12px' }}>
            Sélectionnez un prospect pour voir le détail et affecter à un collaborateur
          </div>
        )}
      </div>
    </div>
  )
}
