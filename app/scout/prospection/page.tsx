'use client'
import { useState, useEffect } from 'react'
import { createBrowserSupabaseClient } from '@/app/supabaseClient'
import { scoutIa, extractJson } from '@/lib/scout/ia-client'
import type { ScoutSource } from '@/lib/scout/ia-client'

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
interface Service { id: string; nom: string; description: string; actif: boolean; structures?: string }

interface LookupPerson { nom: string; poste?: string; structure?: string; zone?: string; secteur?: string; email?: string; telephone?: string; confiance?: string; resume?: string; source?: string }
interface LookupStructure { nom?: string; secteur?: string; zone?: string; site?: string; description?: string }
interface LookupResult { structure: LookupStructure | null; personnes: LookupPerson[] }

const WEB_RULES = ` MODE RECHERCHE WEB : utilise la recherche Google. Ne retiens que des organisations et des contacts réellement trouvés dans les sources. N'invente JAMAIS d'email ni de téléphone : laisse une chaîne vide s'ils ne figurent pas dans les sources (cette consigne remplace les indications "plausible" ci-dessus). Réponds uniquement avec le tableau JSON, sans markdown ni texte autour.`

const LOOKUP_SYSTEM = `Tu es un analyste en intelligence commerciale en Afrique de l'Ouest. Utilise la recherche web pour répondre. Ne retiens QUE des informations professionnelles issues de sources publiques (sites officiels, registres d'entreprises, presse, pages professionnelles). Ne recherche et ne renvoie JAMAIS d'information privée (adresse personnelle, famille, santé, opinions, réseaux sociaux personnels). N'invente rien : email et téléphone uniquement s'ils figurent explicitement dans une source, sinon chaîne vide. Si le nom est ambigu (homonymes), renvoie plusieurs candidats avec une confiance faible ou moyenne. Réponds UNIQUEMENT avec un objet JSON, sans markdown ni texte autour : {"structure": {"nom":"","secteur":"","zone":"","site":"","description":""} ou null, "personnes": [{"nom":"","poste":"","structure":"","zone":"","secteur":"","email":"","telephone":"","confiance":"haute|moyenne|faible","resume":"","source":""}]}. Le tableau personnes est vide si rien de fiable n'est trouvé.`

const STRUCTURES = [
  { id: 'DOUKE', label: 'Cabinet DOUKE', org_id: 'd2222222-2222-2222-2222-222222222222', color: '#3B82F6' },
  { id: 'CONACCE', label: 'CONACCE', org_id: 'c1111111-1111-1111-1111-111111111111', color: '#2ecc71' },
]

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
  const [genForm, setGenForm] = useState({ secteur:'', zone:'', service_douke:'', nb:'5', profil:'', web:true })
  const [showGen, setShowGen] = useState(false)
  const [filtreStatut, setFiltreStatut] = useState('tous')
  const [filtreService, setFiltreService] = useState('tous')
  const [filtreStructure, setFiltreStructure] = useState('tous')
  const [session, setSession] = useState<Record<string,string>|null>(null)
  const [showServices, setShowServices] = useState(false)
  const [serviceForm, setServiceForm] = useState<Partial<Service>>({ nom:'', description:'', actif:true, structures:'DOUKE' })
  const [editingService, setEditingService] = useState<Service|null>(null)
  const [savingService, setSavingService] = useState(false)
  const sb = createBrowserSupabaseClient()
  const [showLookup, setShowLookup] = useState(false)
  const [lookupMode, setLookupMode] = useState('personne')
  const [lookupQuery, setLookupQuery] = useState('')
  const [lookupZone, setLookupZone] = useState('Bénin')
  const [lookingUp, setLookingUp] = useState(false)
  const [lookupError, setLookupError] = useState('')
  const [lookupRes, setLookupRes] = useState<LookupResult | null>(null)
  const [lookupSources, setLookupSources] = useState<ScoutSource[]>([])

  async function rechercherLookup() {
    const q = lookupQuery.trim()
    if (!q || lookingUp) return
    setLookingUp(true); setLookupError(''); setLookupRes(null); setLookupSources([])
    try {
      const zoneTxt = lookupZone.trim() || 'Bénin'
      const prompt = lookupMode === 'personne'
        ? `Recherche les informations professionnelles publiques sur la personne « ${q} » (zone : ${zoneTxt}) : fonctions actuelles, structure, coordonnées professionnelles si elles sont publiées.`
        : `Recherche la structure « ${q} » (zone : ${zoneTxt}) et liste les personnes qui lui sont rattachées (dirigeants, responsables, contacts clés) d'après des sources publiques. Maximum 10 personnes.`
      const r = await scoutIa({ grounded: true, system: LOOKUP_SYSTEM, prompt })
      let parsed: Partial<LookupResult>
      try { parsed = JSON.parse(extractJson(r.text)) } catch { throw new Error('Réponse IA illisible : précisez le nom ou la zone et réessayez') }
      const personnes = Array.isArray(parsed.personnes) ? parsed.personnes.filter(p => p && typeof p.nom === 'string' && p.nom.trim()) : []
      const st = parsed.structure && parsed.structure.nom ? parsed.structure : null
      setLookupRes({ structure: st, personnes })
      setLookupSources(r.sources)
    } catch (e) { setLookupError(e instanceof Error ? e.message : 'Erreur de recherche') }
    setLookingUp(false)
  }

  function ajouterDepuisLookup(p: LookupPerson) {
    setForm({
      nom: p.nom,
      structure: p.structure || lookupRes?.structure?.nom || '',
      contact: p.poste || '',
      email: p.email || '',
      telephone: p.telephone || '',
      zone: p.zone || lookupRes?.structure?.zone || lookupZone,
      secteur: p.secteur || lookupRes?.structure?.secteur || '',
      source: `Recherche web (${lookupMode}) - confiance ${p.confiance || 'n/a'}${p.source ? ' - ' + p.source : ''}`,
      notes: p.resume || '',
      statut: 'nouveau',
      scoring: 50,
    })
    setEditing(true); setSelected(null)
  }

  useEffect(() => {
    const raw = localStorage.getItem('eden_current_user')
    if (raw) {
      try {
        const u = JSON.parse(raw)
        setSession(u)
        // Filtre structure auto selon profil
        if (u.orgId && u.orgId !== 'Tous') {
          const struct = STRUCTURES.find(s => s.org_id === u.orgId)
          if (struct) setFiltreStructure(struct.id)
        }
      } catch {}
    }
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

  async function saveService() {
    if (!serviceForm.nom?.trim()) return
    setSavingService(true)
    let error = null
    if (editingService) {
      const r = await sb.from('scout_services_douke').update({ nom: serviceForm.nom, description: serviceForm.description, actif: serviceForm.actif, structures: serviceForm.structures }).eq('id', editingService.id)
      error = r.error
    } else {
      const r = await sb.from('scout_services_douke').insert({ nom: serviceForm.nom, description: serviceForm.description, actif: serviceForm.actif !== false, structures: serviceForm.structures || 'DOUKE' })
      error = r.error
    }
    setSavingService(false)
    if (error) {
      alert('Erreur lors de l\'enregistrement du service: ' + error.message)
      return
    }
    setEditingService(null)
    setServiceForm({ nom:'', description:'', actif:true, structures:'DOUKE' })
    await load()
  }

  async function deleteService(id: string) {
    if (!confirm('Supprimer ce service ?')) return
    await sb.from('scout_services_douke').delete().eq('id', id)
    await load()
  }

  async function genererProspects() {
    if (!genForm.secteur || !genForm.service_douke) return
    setGenerating(true)
    try {
      const res = await fetch('/api/scout/ia', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({
          grounded: genForm.web,
          system: `Tu es un expert commercial en Afrique de l'Ouest spécialisé dans l'identification de prospects qualifiés pour un cabinet de conseil (DOUKE). Génère une liste de prospects RÉALISTES et QUALIFIÉS. Réponds UNIQUEMENT en JSON valide: tableau de ${genForm.nb} objets avec les champs: nom (personne contact), structure (entreprise/organisation), contact (titre/poste), email (format valide plausible), telephone (format Bénin/UEMOA), zone, secteur, service_douke, scoring (0-100), source (comment identifier ce prospect), notes (pourquoi ce prospect est qualifié pour le service DOUKE indiqué).${genForm.web ? WEB_RULES : ''}`,
          prompt: `Génère ${genForm.nb} prospects qualifiés pour le service DOUKE "${genForm.service_douke}" dans le secteur "${genForm.secteur}" zone "${genForm.zone || 'Bénin'}". Ces prospects doivent avoir un besoin réel et identifiable pour ce service.${genForm.profil.trim() ? ` Profil recherché : ${genForm.profil.trim()}.` : ''}`
        })
      })
      const data = await res.json()
      if (!res.ok) { throw new Error(data?.error || 'Erreur generation IA') }
      const text = data.text || '[]'
      const parsed = JSON.parse(extractJson(text))
      const srcWeb = Array.isArray(data.sources) ? (data.sources as { uri?: string; title?: string }[]).slice(0, 3).map(s => s.title || s.uri || '').filter(Boolean).join(' ; ') : ''
      const toInsert = (Array.isArray(parsed) ? parsed : []).map((p: Record<string,unknown>) => {
        const sc = Number(p.scoring)
        const str = (k: string) => (typeof p[k] === 'string' ? (p[k] as string) : '')
        return {
          nom: str('nom'), structure: str('structure'), contact: str('contact'), email: str('email'), telephone: str('telephone'),
          zone: str('zone'), secteur: str('secteur'), scoring: Number.isFinite(sc) ? sc : 50,
          source: [str('source'), srcWeb ? 'Web : ' + srcWeb : ''].filter(Boolean).join(' | '),
          notes: str('notes'), statut: 'nouveau', service_douke: genForm.service_douke,
        }
      }).filter((p: { nom: string }) => p.nom.trim())
      if (toInsert.length === 0) throw new Error('Aucun prospect exploitable dans la réponse IA')
      const ins = await sb.from('scout_prospects').insert(toInsert)
      if (ins.error) throw new Error(ins.error.message)
      await load()
      setShowGen(false)
      setGenForm({ secteur:'', zone:'', service_douke:'', nb:'5', profil:'', web:true })
    } catch(e) { alert('Erreur génération IA : ' + (e instanceof Error ? e.message : 'inconnue')) }
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
  const servicesVisibles = filtreStructure === 'tous'
    ? services
    : services.filter((s: Service) => { const st = s.structures; return !st || st === filtreStructure || st === 'DOUKE+CONACCE' })
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
          <div style={{ display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap' }}>
            {/* Filtre structure — Admin voit tout avec sélecteur */}
            {(session?.role === 'Super-Admin' || !session?.org_id || session?.org_id === 'org_douke_01') ? (
              <div style={{ display:'flex', gap:'4px' }}>
                {['tous',...STRUCTURES.map(s=>s.id)].map(sid => {
                  const st = STRUCTURES.find(s=>s.id===sid)
                  return (
                    <button key={sid} onClick={() => setFiltreStructure(sid)}
                      style={{ ...S.btn(filtreStructure===sid), fontSize:'11px', padding:'4px 10px',
                        borderColor: st && filtreStructure===sid ? `${st.color}66` : undefined,
                        color: st && filtreStructure===sid ? st.color : undefined }}>
                      {sid === 'tous' ? 'Toutes structures' : st?.label}
                    </button>
                  )
                })}
              </div>
            ) : null}
            {isAdmin && <button style={{ ...S.btn(), fontSize:'11px' }} onClick={() => setShowServices(!showServices)}>⚙️ Gérer services</button>}
            <button style={S.btn()} onClick={() => setShowGen(!showGen)}>🤖 Générer prospects IA</button>
            <button style={S.btn()} onClick={() => setShowLookup(!showLookup)}>🕵️ Personne / structure</button>
            <button style={S.btn(true)} onClick={() => { setForm({ statut:'nouveau', scoring:50 }); setEditing(true); setSelected(null) }}>+ Ajouter</button>
          </div>
        </div>

        {showGen && (
          <div style={{ background:'#0F1923', border:'1px solid rgba(201,168,76,.2)', borderRadius:'10px', padding:'14px', marginBottom:'12px' }}>
            <div style={{ fontSize:'13px', fontWeight:600, color:'#C9A84C', marginBottom:'12px' }}>🤖 Génération IA de prospects qualifiés</div>
            <div style={{ marginBottom:'10px' }}>
              <label style={S.label}>Profil recherché (optionnel) : décrivez le prospect idéal</label>
              <textarea value={genForm.profil} onChange={e => setGenForm(f => ({...f, profil:e.target.value}))} rows={3} style={{ ...S.input, resize:'vertical' }} placeholder="Ex : PME agroalimentaire de 10 à 50 salariés, en croissance, qui cherche un financement bancaire ou une levée de fonds" />
              <label style={{ display:'flex', alignItems:'center', gap:'6px', marginTop:'6px', fontSize:'11px', color:'#A8B4C0', cursor:'pointer' }}>
                <input type="checkbox" checked={genForm.web} onChange={e => setGenForm(f => ({...f, web:e.target.checked}))} />
                Recherche web avec sources (recommandé : évite les fiches inventées)
              </label>
            </div>
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
                  {servicesVisibles.map(s => <option key={s.id} value={s.nom}>{s.nom}</option>)}
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

        {showLookup && (
          <div style={{ background:'#0F1923', border:'1px solid rgba(52,152,219,.25)', borderRadius:'10px', padding:'14px', marginBottom:'12px' }}>
            <div style={{ fontSize:'13px', fontWeight:600, color:'#3B82F6', marginBottom:'10px' }}>🕵️ Recherche par nom de personne ou de structure</div>
            <div style={{ display:'flex', gap:'6px', marginBottom:'10px' }}>
              {([['personne','👤 Une personne'],['structure','🏢 Une structure']] as [string,string][]).map(([m,l]) => (
                <button key={m} onClick={() => setLookupMode(m)} style={{ ...S.btn(lookupMode===m), fontSize:'11px', padding:'4px 10px' }}>{l}</button>
              ))}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:'10px', marginBottom:'10px' }}>
              <div>
                <label style={S.label}>{lookupMode==='personne' ? 'Nom de la personne *' : 'Nom de la structure *'}</label>
                <input value={lookupQuery} onChange={e => setLookupQuery(e.target.value)} onKeyDown={e => { if (e.key==='Enter') rechercherLookup() }} style={S.input} placeholder={lookupMode==='personne' ? "Ex : Prénom Nom" : "Ex : nom de l'entreprise ou de l'ONG"} />
              </div>
              <div>
                <label style={S.label}>Zone / pays</label>
                <input value={lookupZone} onChange={e => setLookupZone(e.target.value)} style={S.input} />
              </div>
            </div>
            <div style={{ fontSize:'10px', color:'#6B7A8D', marginBottom:'10px', lineHeight:'1.5' }}>{"Informations professionnelles issues de sources web publiques, à vérifier avant tout contact (risque d'homonymes). Aucune donnée privée n'est recherchée."}</div>
            <div style={{ display:'flex', gap:'8px' }}>
              <button style={S.btn(true)} onClick={rechercherLookup} disabled={lookingUp || !lookupQuery.trim()}>{lookingUp ? '⏳ Recherche…' : '🔎 Rechercher'}</button>
              <button style={S.btn()} onClick={() => setShowLookup(false)}>Fermer</button>
            </div>
            {lookupError && <div style={{ color:'#e74c3c', fontSize:'11px', marginTop:'8px' }}>{lookupError}</div>}
            {lookupRes && (
              <div style={{ marginTop:'12px' }}>
                {lookupRes.structure && (
                  <div style={{ background:'rgba(255,255,255,.03)', borderRadius:'8px', padding:'10px', marginBottom:'8px' }}>
                    <div style={{ fontSize:'12px', fontWeight:700, color:'#E8E8E8' }}>🏢 {lookupRes.structure.nom}</div>
                    <div style={{ fontSize:'11px', color:'#6B7A8D' }}>{[lookupRes.structure.secteur, lookupRes.structure.zone, lookupRes.structure.site].filter(Boolean).join(' · ')}</div>
                    {lookupRes.structure.description && <div style={{ fontSize:'11px', color:'#A8B4C0', marginTop:'4px' }}>{lookupRes.structure.description}</div>}
                  </div>
                )}
                {lookupRes.personnes.length === 0 ? (
                  <div style={{ fontSize:'12px', color:'#6B7A8D' }}>Aucune personne trouvée dans les sources publiques.</div>
                ) : lookupRes.personnes.map((p, i) => (
                  <div key={i} style={{ background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.06)', borderRadius:'8px', padding:'10px', marginBottom:'6px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', gap:'8px', alignItems:'flex-start' }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:'12px', fontWeight:600, color:'#E8E8E8' }}>{p.nom}</div>
                        <div style={{ fontSize:'11px', color:'#6B7A8D' }}>{[p.poste, p.structure].filter(Boolean).join(' · ')}</div>
                        {(p.email || p.telephone) && <div style={{ fontSize:'11px', color:'#A8B4C0', marginTop:'2px' }}>{[p.email, p.telephone].filter(Boolean).join(' · ')}</div>}
                        {p.resume && <div style={{ fontSize:'11px', color:'#A8B4C0', marginTop:'4px' }}>{p.resume}</div>}
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', gap:'6px', alignItems:'flex-end' }}>
                        <span style={{ fontSize:'10px', padding:'2px 8px', borderRadius:'10px', border:'1px solid rgba(255,255,255,.15)', color: p.confiance==='haute' ? '#2ecc71' : p.confiance==='moyenne' ? '#C9A84C' : '#e67e22' }}>{'confiance ' + (p.confiance || 'faible')}</span>
                        <button style={{ ...S.btn(true), padding:'4px 8px', fontSize:'11px' }} onClick={() => ajouterDepuisLookup(p)}>➕ Prospect</button>
                      </div>
                    </div>
                  </div>
                ))}
                {lookupSources.length > 0 && (
                  <div style={{ fontSize:'10px', color:'#6B7A8D', marginTop:'8px', lineHeight:'1.6' }}>
                    Sources : {lookupSources.slice(0, 8).map((s, i) => (
                      <a key={i} href={s.uri} target="_blank" rel="noreferrer" style={{ color:'#3B82F6', marginRight:'8px' }}>{s.title || s.uri}</a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {showServices && isAdmin && (
          <div style={{ background:'#0F1923', border:'1px solid rgba(201,168,76,.2)', borderRadius:'10px', padding:'14px', marginBottom:'12px' }}>
            <div style={{ fontSize:'13px', fontWeight:700, color:'#C9A84C', marginBottom:'12px' }}>⚙️ Services DOUKE — Gestion</div>
            <div style={{ display:'flex', flexDirection:'column', gap:'6px', marginBottom:'12px', maxHeight:'200px', overflowY:'auto' }}>
              {services.map(svc => (
                <div key={svc.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'rgba(255,255,255,.03)', borderRadius:'8px', padding:'8px 12px' }}>
                  <div>
                    <div style={{ fontSize:'12px', fontWeight:600, color: svc.actif ? '#E8E8E8' : '#6B7A8D' }}>{svc.nom}</div>
                    <div style={{ fontSize:'10px', color:'#6B7A8D' }}>{svc.structures || 'DOUKE'} · {svc.description?.slice(0,60)}…</div>
                  </div>
                  <div style={{ display:'flex', gap:'6px' }}>
                    <button onClick={() => { setEditingService(svc); setServiceForm(svc) }} style={{ ...S.btn(true), padding:'4px 8px', fontSize:'11px' }}>✏️</button>
                    <button onClick={() => deleteService(svc.id)} style={{ ...S.btn(), padding:'4px 8px', fontSize:'11px', color:'#e74c3c', borderColor:'rgba(231,76,60,.3)' }}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
            {/* Formulaire ajout/édition service */}
            <div style={{ background:'rgba(255,255,255,.03)', borderRadius:'8px', padding:'12px' }}>
              <div style={{ fontSize:'11px', fontWeight:600, color:'#C9A84C', marginBottom:'8px' }}>{editingService ? 'Modifier le service' : 'Ajouter un service'}</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom:'8px' }}>
                <div>
                  <label style={S.label}>Nom du service *</label>
                  <input value={serviceForm.nom||''} onChange={e => setServiceForm(f => ({...f, nom:e.target.value}))} style={S.input} placeholder="Ex : Conseil juridique OHADA" />
                </div>
                <div>
                  <label style={S.label}>Structure</label>
                  <select value={serviceForm.structures||'DOUKE'} onChange={e => setServiceForm(f => ({...f, structures:e.target.value}))} style={S.input}>
                    <option value="DOUKE">Cabinet DOUKE</option>
                    <option value="CONACCE">CONACCE</option>
                    <option value="DOUKE+CONACCE">Les deux</option>
                  </select>
                </div>
              </div>
              <div style={{ marginBottom:'8px' }}>
                <label style={S.label}>Description</label>
                <input value={serviceForm.description||''} onChange={e => setServiceForm(f => ({...f, description:e.target.value}))} style={S.input} placeholder="Description courte du service" />
              </div>
              <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
                <label style={{ display:'flex', alignItems:'center', gap:'6px', cursor:'pointer', fontSize:'12px', color:'#A8B4C0' }}>
                  <input type="checkbox" checked={serviceForm.actif !== false} onChange={e => setServiceForm(f => ({...f, actif:e.target.checked}))} />
                  Actif
                </label>
                <button style={S.btn(true)} onClick={saveService} disabled={savingService || !serviceForm.nom?.trim()}>{savingService ? '…' : editingService ? '💾 Modifier' : '➕ Ajouter'}</button>
                {editingService && <button style={S.btn()} onClick={() => { setEditingService(null); setServiceForm({ nom:'', description:'', actif:true, structures:'DOUKE' }) }}>Annuler</button>}
              </div>
            </div>
          </div>
        )}
        <div style={{ display:'flex', gap:'6px', marginBottom:'8px', flexWrap:'wrap' }}>
          {['tous',...STATUTS].map(s => <button key={s} onClick={() => setFiltreStatut(s)} style={{ ...S.btn(filtreStatut===s), fontSize:'11px', padding:'4px 10px' }}>{s}</button>)}
        </div>
        <div style={{ display:'flex', gap:'6px', marginBottom:'12px', flexWrap:'wrap' }}>
          {['tous',...servicesVisibles.map(s => s.nom)].map(s => <button key={s} onClick={() => setFiltreService(s)} style={{ ...S.btn(filtreService===s), fontSize:'11px', padding:'4px 10px' }}>{s}</button>)}
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
                {servicesVisibles.map(s => <option key={s.id} value={s.nom}>{s.nom}</option>)}
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
