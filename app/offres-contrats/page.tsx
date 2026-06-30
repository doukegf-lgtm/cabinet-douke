'use client'
import { useState, useEffect } from 'react'
import { createBrowserSupabaseClient } from '@/app/supabaseClient'

interface DocItem {
  id: string
  type_doc: string
  structure: string
  numero: string
  client_nom: string
  objet: string
  montant: number
  statut: string
  created_at: string
  created_by: string
}

const TYPE_LABEL: Record<string,string> = { offre: '📋 Offre de services', contrat: '📝 Contrat', calendrier: '📅 Calendrier' }
const STATUT_COLOR: Record<string,string> = { brouillon: '#6B7A8D', soumis: '#C9A84C', valide: '#2ecc71', rejete: '#e74c3c' }
const STATUT_LABEL: Record<string,string> = { brouillon: 'Brouillon', soumis: 'En attente validation', valide: 'Validé', rejete: 'Rejeté' }

function fmt(n: number) { if(!n) return '—'; return n.toLocaleString('fr-FR') + ' FCFA' }

export default function OffresContratsPage() {
  const [docs, setDocs] = useState<DocItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filtreType, setFiltreType] = useState('tous')
  const [filtreStatut, setFiltreStatut] = useState('tous')
  const [session, setSession] = useState<Record<string,string>|null>(null)
  const [comptes, setComptes] = useState<Record<string,string>>({})
  const sb = createBrowserSupabaseClient()

  useEffect(() => {
    const raw = localStorage.getItem('eden_current_user')
    if (raw) { try { setSession(JSON.parse(raw)) } catch {} }
    load()
  }, [])

  async function load() {
    setLoading(true)
    const [d, c] = await Promise.all([
      sb.from('documents_offres_contrats').select('*').order('created_at', { ascending:false }),
      sb.from('auth_accounts').select('id,name'),
    ])
    setDocs(d.data || [])
    const map: Record<string,string> = {}
    ;(c.data || []).forEach((u: {id:string,name:string}) => { map[u.id] = u.name })
    setComptes(map)
    setLoading(false)
  }

  const isAdmin = session?.role === 'Super-Admin'

  async function valider(id: string) {
    if (!session) return
    await sb.from('documents_offres_contrats').update({ statut: 'valide', validated_by: session.id, validated_at: new Date().toISOString() }).eq('id', id)
    await load()
  }

  async function rejeter(id: string) {
    await sb.from('documents_offres_contrats').update({ statut: 'rejete' }).eq('id', id)
    await load()
  }

  async function soumettre(id: string) {
    await sb.from('documents_offres_contrats').update({ statut: 'soumis' }).eq('id', id)
    await load()
  }

  async function supprimer(id: string) {
    if (!confirm('Supprimer ce document ?')) return
    await sb.from('documents_offres_contrats').delete().eq('id', id)
    await load()
  }

  const filtered = docs.filter(d => {
    if (filtreType !== 'tous' && d.type_doc !== filtreType) return false
    if (filtreStatut !== 'tous' && d.statut !== filtreStatut) return false
    return true
  })

  const S = {
    btn: (gold=false) => ({ padding:'8px 14px', borderRadius:'8px', border:`1px solid ${gold?'rgba(201,168,76,.4)':'rgba(255,255,255,.1)'}`, background:gold?'rgba(201,168,76,.1)':'rgba(255,255,255,.04)', color:gold?'#C9A84C':'#A8B4C0', fontSize:'12px', cursor:'pointer', fontWeight:gold?600:400 } as React.CSSProperties),
    card: { background:'#0F1923', border:'1px solid rgba(201,168,76,.12)', borderRadius:'10px', padding:'14px', marginBottom:'8px' } as React.CSSProperties,
  }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
        <div>
          <h1 style={{ fontSize:'20px', fontWeight:800, color:'#E8E8E8', margin:0 }}>📄 Offres & Contrats</h1>
          <p style={{ color:'#6B7A8D', fontSize:'12px', marginTop:'4px' }}>{docs.length} document{docs.length>1?'s':''} · {docs.filter(d=>d.statut==='valide').length} validé{docs.filter(d=>d.statut==='valide').length>1?'s':''}</p>
        </div>
        <div style={{ display:'flex', gap:'8px' }}>
          <a href="/offres-contrats/nouveau?type=offre" style={{ ...S.btn(true), textDecoration:'none', display:'inline-block' }}>+ Offre</a>
          <a href="/offres-contrats/nouveau?type=contrat" style={{ ...S.btn(true), textDecoration:'none', display:'inline-block' }}>+ Contrat</a>
          <a href="/offres-contrats/nouveau?type=calendrier" style={{ ...S.btn(true), textDecoration:'none', display:'inline-block' }}>+ Calendrier</a>
        </div>
      </div>

      <div style={{ display:'flex', gap:'6px', marginBottom:'8px', flexWrap:'wrap' }}>
        {['tous','offre','contrat','calendrier'].map(t => (
          <button key={t} onClick={() => setFiltreType(t)} style={{ ...S.btn(filtreType===t), fontSize:'11px', padding:'4px 10px' }}>{t==='tous'?'Tous types':TYPE_LABEL[t]}</button>
        ))}
      </div>
      <div style={{ display:'flex', gap:'6px', marginBottom:'16px', flexWrap:'wrap' }}>
        {['tous','brouillon','soumis','valide','rejete'].map(s => (
          <button key={s} onClick={() => setFiltreStatut(s)} style={{ ...S.btn(filtreStatut===s), fontSize:'11px', padding:'4px 10px' }}>{s==='tous'?'Tous statuts':STATUT_LABEL[s]}</button>
        ))}
      </div>

      {loading ? <div style={{ color:'#6B7A8D', fontSize:'13px' }}>Chargement…</div> : filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:'40px', color:'#6B7A8D', fontSize:'13px' }}>Aucun document — créez votre première offre ou contrat</div>
      ) : filtered.map(d => (
        <div key={d.id} style={S.card}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div style={{ flex:1 }}>
              <div style={{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'4px' }}>
                <span style={{ fontSize:'13px', fontWeight:600, color:'#E8E8E8' }}>{TYPE_LABEL[d.type_doc]}</span>
                <span style={{ fontSize:'10px', padding:'2px 8px', borderRadius:'10px', background:`${STATUT_COLOR[d.statut]}22`, color:STATUT_COLOR[d.statut], border:`1px solid ${STATUT_COLOR[d.statut]}44` }}>{STATUT_LABEL[d.statut]}</span>
                <span style={{ fontSize:'10px', color:'#6B7A8D' }}>{d.structure}</span>
              </div>
              <div style={{ fontSize:'12px', color:'#A8B4C0' }}>{d.client_nom} — {d.objet}</div>
              <div style={{ fontSize:'11px', color:'#6B7A8D', marginTop:'2px' }}>
                {d.numero && `N° ${d.numero} · `}{fmt(d.montant)} · {comptes[d.created_by] || '?'} · {new Date(d.created_at).toLocaleDateString('fr-FR')}
              </div>
            </div>
            <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', justifyContent:'flex-end' }}>
              <a href={`/offres-contrats/${d.id}`} style={{ ...S.btn(), textDecoration:'none', fontSize:'11px', padding:'5px 10px' }}>👁️ Voir</a>
              {d.statut === 'brouillon' && (
                <>
                  <a href={`/offres-contrats/nouveau?edit=${d.id}`} style={{ ...S.btn(), textDecoration:'none', fontSize:'11px', padding:'5px 10px' }}>✏️ Modifier</a>
                  <button onClick={() => soumettre(d.id)} style={{ ...S.btn(true), fontSize:'11px', padding:'5px 10px' }}>📤 Soumettre</button>
                </>
              )}
              {d.statut === 'soumis' && isAdmin && (
                <>
                  <button onClick={() => valider(d.id)} style={{ ...S.btn(true), fontSize:'11px', padding:'5px 10px', color:'#2ecc71', borderColor:'rgba(46,204,113,.4)' }}>✓ Valider</button>
                  <button onClick={() => rejeter(d.id)} style={{ ...S.btn(), fontSize:'11px', padding:'5px 10px', color:'#e74c3c', borderColor:'rgba(231,76,60,.3)' }}>✕ Rejeter</button>
                </>
              )}
              {(isAdmin || d.statut === 'brouillon') && (
                <button onClick={() => supprimer(d.id)} style={{ ...S.btn(), fontSize:'11px', padding:'5px 10px', color:'#e74c3c', borderColor:'rgba(231,76,60,.3)' }}>🗑️</button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
