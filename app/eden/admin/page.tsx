'use client'
import { useState, useEffect } from 'react'
import { createBrowserSupabaseClient } from '@/app/supabaseClient'

interface Structure {
  id: string
  nom: string
  code: string
  org_id: string
  description: string
  actif: boolean
}

interface ProfileRow {
  id: string
  username: string
  name: string
  role: string
  eden_access: boolean
  scout_access: boolean
}
interface Service { id: string; nom: string; description: string; actif: boolean }

export default function EdenAdminPage() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const [tab, setTab] = useState<'acces'|'services'|'structures'>('acces')
  const [newService, setNewService] = useState({ nom: '', description: '' })
  const [addingService, setAddingService] = useState(false)
  const [structures, setStructures] = useState<{id:string,nom:string,code:string,org_id:string,description:string}[]>([])
  const [newStruct, setNewStruct] = useState({ nom:'', code:'', description:'' })
  const [addingStruct, setAddingStruct] = useState(false)
  const sb = createBrowserSupabaseClient()

  useEffect(() => {
    const raw = localStorage.getItem('eden_current_user')
    if (raw) { try { const u = JSON.parse(raw); setCurrentUserId(u.id || '') } catch {} }
    load()
  }, [])

  async function load() {
    setLoading(true)
    const [acc, svc] = await Promise.all([
      sb.from('auth_accounts').select('id, username, name, role, eden_access, scout_access').order('name'),
      sb.from('scout_services_douke').select('*').order('nom')
    ])
    setProfiles(acc.data || [])
    setServices(svc.data || [])
    setLoading(false)
  }

  async function toggleAccess(p: ProfileRow, field: 'eden_access' | 'scout_access') {
    setSaving(p.id + field)
    const newVal = !p[field]
    const { error } = await sb.from('auth_accounts').update({ [field]: newVal }).eq('id', p.id)
    if (error) { setMsg({ text: 'Erreur : ' + error.message, ok: false }) }
    else {
      setProfiles(prev => prev.map(x => x.id === p.id ? { ...x, [field]: newVal } : x))
      setMsg({ text: `Acces ${field==='eden_access'?'EDEN':'SCOUT'} ${newVal?'active':'desactive'} pour ${p.name}`, ok: true })
      setTimeout(() => setMsg(null), 3000)
    }
    setSaving(null)
  }

  async function toggleService(svc: Service) {
    await sb.from('scout_services_douke').update({ actif: !svc.actif }).eq('id', svc.id)
    setServices(prev => prev.map(s => s.id === svc.id ? { ...s, actif: !svc.actif } : s))
  }

  async function deleteService(id: string) {
    if (!confirm('Supprimer ce service ?')) return
    await sb.from('scout_services_douke').delete().eq('id', id)
    setServices(prev => prev.filter(s => s.id !== id))
  }

  async function addService() {
    if (!newService.nom.trim()) return
    setAddingService(true)
    const { data } = await sb.from('scout_services_douke').insert({ nom: newService.nom.trim(), description: newService.description.trim(), actif: true }).select().single()
    if (data) setServices(prev => [...prev, data])
    setNewService({ nom: '', description: '' })
    setAddingService(false)
    setMsg({ text: 'Service ajoute', ok: true })
    setTimeout(() => setMsg(null), 2000)
  }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: '8px', color: '#E8E8E8', fontSize: '12px', boxSizing: 'border-box' }
  const STRUCT_NATIVES = [
    { id:'douke', nom:'Cabinet DOUKE', code:'DOUKE', org_id:'org_douke_01', description:'Structure principale — finances, conseil, PPP' },
    { id:'conacce', nom:'CONACCE', code:'CONACCE', org_id:'c1111111-1111-1111-1111-111111111111', description:'ONG humanitaire partenaire' },
    ...structures,
  ]

  async function addStructure() {
    if (!newStruct.nom.trim() || !newStruct.code.trim()) return
    setAddingStruct(true)
    const org_id = 'org_' + newStruct.code.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_01'
    const entry = { id: org_id, nom: newStruct.nom.trim(), code: newStruct.code.trim().toUpperCase(), org_id, description: newStruct.description.trim() }
    const existing = JSON.parse(localStorage.getItem('douke_structures') || '[]')
    existing.push(entry)
    localStorage.setItem('douke_structures', JSON.stringify(existing))
    setStructures(existing)
    setNewStruct({ nom:'', code:'', description:'' })
    setMsg({ text: 'Structure "' + entry.nom + '" ajoutee (org_id: ' + org_id + ')', ok: true })
    setAddingStruct(false)
  }

  const TH: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: '#6B7A8D', textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: '1px solid rgba(201,168,76,.12)', background: '#1E2D3D' }
  const TD: React.CSSProperties = { padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,.04)', fontSize: '13px', color: '#E8E8E8' }

  return (
    <div style={{ maxWidth: '900px' }}>
      <div style={{ fontSize: '20px', fontWeight: 700, color: '#C9A84C', marginBottom: '4px' }}>Administration EDEN</div>
      <div style={{ fontSize: '13px', color: '#6B7A8D', marginBottom: '20px' }}>Acces utilisateurs et services DOUKE</div>
      {msg && <div style={{ padding: '10px 16px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px', border: '1px solid', background: msg.ok ? 'rgba(46,204,113,.08)' : 'rgba(231,76,60,.08)', borderColor: msg.ok ? 'rgba(46,204,113,.3)' : 'rgba(231,76,60,.3)', color: msg.ok ? '#2ecc71' : '#e74c3c' }}>{msg.ok ? 'OK' : 'ERREUR'} {msg.text}</div>}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,.08)', marginBottom: '20px' }}>
        {([['acces','Acces utilisateurs'],['services','Services DOUKE'],['structures','Structures']] as const).map(([t,l]) => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '9px 20px', background: 'none', border: 'none', borderBottom: `2px solid ${tab===t?'#C9A84C':'transparent'}`, color: tab===t?'#C9A84C':'#6B7A8D', fontWeight: tab===t?600:400, fontSize: '13px', cursor: 'pointer' }}>{l}</button>
        ))}
      </div>

      {tab === 'acces' && (
        <div style={{ background: '#162030', border: '1px solid rgba(201,168,76,.15)', borderRadius: '12px', overflow: 'hidden' }}>
          {loading ? <div style={{ padding: '20px', color: '#6B7A8D', fontSize: '13px' }}>Chargement...</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Membre','Username','Role','EDEN','SCOUT'].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
              <tbody>
                {profiles.map(p => (
                  <tr key={p.id}>
                    <td style={{ ...TD, fontWeight: 500 }}>{p.name}</td>
                    <td style={{ ...TD, fontSize: '12px', color: '#6B7A8D', fontFamily: 'monospace' }}>@{p.username}</td>
                    <td style={TD}><span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: p.role.includes('Admin')?'rgba(201,168,76,.15)':'rgba(255,255,255,.06)', color: p.role.includes('Admin')?'#C9A84C':'#6B7A8D' }}>{p.role}</span></td>
                    <td style={TD}>
                      {p.id !== currentUserId ? (
                        <button onClick={() => toggleAccess(p,'eden_access')} disabled={saving===p.id+'eden_access'} style={{ padding:'4px 12px', borderRadius:'6px', fontSize:'11px', fontWeight:500, cursor:'pointer', border:'1px solid', background:p.eden_access?'rgba(46,204,113,.1)':'rgba(231,76,60,.08)', color:p.eden_access?'#2ecc71':'#e74c3c', borderColor:p.eden_access?'rgba(46,204,113,.3)':'rgba(231,76,60,.2)' }}>
                          {saving===p.id+'eden_access'?'...':p.eden_access?'Actif':'Inactif'}
                        </button>
                      ) : <span style={{ fontSize:'11px', color:'#2ecc71' }}>Vous</span>}
                    </td>
                    <td style={TD}>
                      {p.id !== currentUserId ? (
                        <button onClick={() => toggleAccess(p,'scout_access')} disabled={saving===p.id+'scout_access'} style={{ padding:'4px 12px', borderRadius:'6px', fontSize:'11px', fontWeight:500, cursor:'pointer', border:'1px solid', background:p.scout_access?'rgba(52,152,219,.1)':'rgba(231,76,60,.08)', color:p.scout_access?'#3498db':'#e74c3c', borderColor:p.scout_access?'rgba(52,152,219,.3)':'rgba(231,76,60,.2)' }}>
                          {saving===p.id+'scout_access'?'...':p.scout_access?'Actif':'Inactif'}
                        </button>
                      ) : <span style={{ fontSize:'11px', color:'#3498db' }}>Vous</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'services' && (
        <div>
          <div style={{ background:'#162030', border:'1px solid rgba(201,168,76,.15)', borderRadius:'12px', overflow:'hidden', marginBottom:'16px' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr>{['Service','Description','Statut','Actions'].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
              <tbody>
                {services.map(svc => (
                  <tr key={svc.id}>
                    <td style={{ ...TD, fontWeight:500 }}>{svc.nom}</td>
                    <td style={{ ...TD, fontSize:'12px', color:'#6B7A8D' }}>{svc.description}</td>
                    <td style={TD}><span style={{ fontSize:'11px', padding:'2px 8px', borderRadius:'10px', background:svc.actif?'rgba(46,204,113,.1)':'rgba(231,76,60,.08)', color:svc.actif?'#2ecc71':'#e74c3c', border:`1px solid ${svc.actif?'rgba(46,204,113,.25)':'rgba(231,76,60,.2)'}` }}>{svc.actif?'Actif':'Inactif'}</span></td>
                    <td style={TD}>
                      <div style={{ display:'flex', gap:'6px' }}>
                        <button onClick={() => toggleService(svc)} style={{ padding:'4px 10px', borderRadius:'6px', fontSize:'11px', cursor:'pointer', border:'1px solid rgba(201,168,76,.3)', background:'rgba(201,168,76,.08)', color:'#C9A84C' }}>{svc.actif?'Desactiver':'Activer'}</button>
                        <button onClick={() => deleteService(svc.id)} style={{ padding:'4px 10px', borderRadius:'6px', fontSize:'11px', cursor:'pointer', border:'1px solid rgba(231,76,60,.3)', background:'rgba(231,76,60,.08)', color:'#e74c3c' }}>Supprimer</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ background:'#162030', border:'1px solid rgba(201,168,76,.15)', borderRadius:'12px', padding:'16px' }}>
            <div style={{ fontSize:'13px', fontWeight:600, color:'#E8E8E8', marginBottom:'12px' }}>Ajouter un service DOUKE</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:'10px', marginBottom:'10px' }}>
              <div>
                <div style={{ fontSize:'11px', color:'#6B7A8D', marginBottom:'4px' }}>Nom *</div>
                <input value={newService.nom} onChange={e => setNewService(s => ({...s,nom:e.target.value}))} placeholder="Ex: Audit fiscal" style={inp} />
              </div>
              <div>
                <div style={{ fontSize:'11px', color:'#6B7A8D', marginBottom:'4px' }}>Description</div>
                <input value={newService.description} onChange={e => setNewService(s => ({...s,description:e.target.value}))} placeholder="Description courte..." style={inp} />
              </div>
            </div>
            <button onClick={addService} disabled={addingService || !newService.nom.trim()} style={{ padding:'8px 18px', borderRadius:'8px', border:'1px solid rgba(201,168,76,.4)', background:'rgba(201,168,76,.1)', color:'#C9A84C', fontSize:'12px', fontWeight:600, cursor:'pointer' }}>
              {addingService?'...':'Ajouter le service'}
            </button>
          </div>
        </div>
      )}
      {tab === 'structures' && (
        <div>
          <div style={{ background:'#162030', border:'1px solid rgba(201,168,76,.15)', borderRadius:'12px', overflow:'hidden', marginBottom:'16px' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr>{['Structure','Code','Org ID','Description'].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
              <tbody>
                {STRUCT_NATIVES.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding:'20px', textAlign:'center', color:'#6B7A8D', fontSize:'13px' }}>Aucune structure — seules DOUKE et CONACCE sont intégrées nativement</td></tr>
                ) : STRUCT_NATIVES.map((st) => (
                  <tr key={st.id}>
                    <td style={{ ...TD, fontWeight:500 }}>{st.nom}</td>
                    <td style={{ ...TD, fontFamily:'monospace', fontSize:'12px', color:'#C9A84C' }}>{st.code}</td>
                    <td style={{ ...TD, fontFamily:'monospace', fontSize:'11px', color:'#6B7A8D' }}>{st.org_id}</td>
                    <td style={{ ...TD, fontSize:'12px', color:'#6B7A8D' }}>{st.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ background:'#162030', border:'1px solid rgba(201,168,76,.15)', borderRadius:'12px', padding:'16px' }}>
            <div style={{ fontSize:'13px', fontWeight:600, color:'#E8E8E8', marginBottom:'4px' }}>Ajouter une nouvelle structure</div>
            <div style={{ fontSize:'11px', color:'#6B7A8D', marginBottom:'12px' }}>Une nouvelle structure crée un espace séparé dans l'application (objectifs, prospects, services distincts)</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'10px' }}>
              <div>
                <div style={{ fontSize:'11px', color:'#6B7A8D', marginBottom:'4px' }}>Nom de la structure *</div>
                <input value={newStruct.nom} onChange={e => setNewStruct(s => ({...s, nom:e.target.value}))} placeholder="Ex: DOUKE Sénégal" style={inp} />
              </div>
              <div>
                <div style={{ fontSize:'11px', color:'#6B7A8D', marginBottom:'4px' }}>Code court * (ex: DOUKE_SN)</div>
                <input value={newStruct.code} onChange={e => setNewStruct(s => ({...s, code:e.target.value.toUpperCase()}))} placeholder="DOUKE_SN" style={inp} />
              </div>
            </div>
            <div style={{ marginBottom:'10px' }}>
              <div style={{ fontSize:'11px', color:'#6B7A8D', marginBottom:'4px' }}>Description</div>
              <input value={newStruct.description} onChange={e => setNewStruct(s => ({...s, description:e.target.value}))} placeholder="Description de la structure..." style={inp} />
            </div>
            <button onClick={addStructure} disabled={addingStruct || !newStruct.nom.trim() || !newStruct.code.trim()}
              style={{ padding:'8px 18px', borderRadius:'8px', border:'1px solid rgba(201,168,76,.4)', background:'rgba(201,168,76,.1)', color:'#C9A84C', fontSize:'12px', fontWeight:600, cursor:'pointer' }}>
              {addingStruct ? '...' : 'Créer la structure'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
