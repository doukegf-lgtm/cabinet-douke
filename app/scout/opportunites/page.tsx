'use client'
import { useState, useEffect } from 'react'
import { createBrowserSupabaseClient } from '@/app/supabaseClient'

interface Opportunite {
  id: string
  titre: string
  source: string
  type: string
  montant_max: number
  deadline: string
  secteurs: string
  zone: string
  bailleur: string
  statut: string
  notes: string
  created_at: string
}

const TYPES = ['subvention','don','appel_projets','financement','autre']
const STATUTS = ['nouveau','en_cours','soumis','gagne','perdu']
const STATUT_COLOR: Record<string,string> = { nouveau:'#6B7A8D',en_cours:'#C9A84C',soumis:'#3B82F6',gagne:'#2ecc71',perdu:'#e74c3c' }

function fmt(n: number) { if(!n) return '—'; if(n>=1e9) return (n/1e9).toFixed(1)+' Mrd'; if(n>=1e6) return (n/1e6).toFixed(0)+' M'; return n.toLocaleString('fr-FR') }

export default function OpportunitesPage() {
  const [items, setItems] = useState<Opportunite[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState<Opportunite|null>(null)
  const [form, setForm] = useState<Partial<Opportunite>>({ statut:'nouveau', type:'subvention' })
  const [saving, setSaving] = useState(false)
  const [analysing, setAnalysing] = useState(false)
  const [sourceTexte, setSourceTexte] = useState('')
  const [showAnalyse, setShowAnalyse] = useState(false)
  const [filtreStatut, setFiltreStatut] = useState('tous')
  const sb = createBrowserSupabaseClient()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await sb.from('scout_opportunites').select('*').order('created_at', { ascending:false })
    setItems(data || [])
    setLoading(false)
  }

  async function analyserSource() {
    if (!sourceTexte.trim()) return
    setAnalysing(true)
    try {
      const res = await fetch('/api/scout/ia', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({
          system: `Tu es un expert en financement en Afrique de l'Ouest. Analyse le texte fourni et extrais les informations d'une opportunité de financement. Réponds UNIQUEMENT en JSON valide sans markdown avec ces champs: titre, bailleur, type (subvention/don/appel_projets/financement/autre), montant_max (nombre entier FCFA ou 0), deadline (YYYY-MM-DD ou null), secteurs, zone, notes (résumé en 2 phrases).`,
          prompt: sourceTexte
        })
      })
      const data = await res.json()
      if (!res.ok) { throw new Error(data?.error || 'Erreur analyse IA') }
      const text = data.text || '{}'
      const parsed = JSON.parse(text.replace(/```json|```/g,'').trim())
      setForm(f => ({ ...f, ...parsed, statut:'nouveau', source: sourceTexte.slice(0,200) }))
      setEditing(true)
      setShowAnalyse(false)
      setSourceTexte('')
    } catch(e) { alert('Erreur analyse IA: ' + (e instanceof Error ? e.message : JSON.stringify(e))) }
    setAnalysing(false)
  }

  async function save() {
    setSaving(true)
    if (form.id) {
      await sb.from('scout_opportunites').update(form).eq('id', form.id)
    } else {
      await sb.from('scout_opportunites').insert(form)
    }
    await load(); setEditing(false); setForm({ statut:'nouveau', type:'subvention' }); setSelected(null)
    setSaving(false)
  }

  async function remove(id: string) {
    if (!confirm('Supprimer ?')) return
    await sb.from('scout_opportunites').delete().eq('id', id)
    setSelected(null); await load()
  }

  const filtered = filtreStatut === 'tous' ? items : items.filter(i => i.statut === filtreStatut)

  const S = {
    card: { background:'#0F1923', border:'1px solid rgba(201,168,76,.12)', borderRadius:'10px', padding:'14px', marginBottom:'8px', cursor:'pointer' } as React.CSSProperties,
    input: { width:'100%', padding:'8px 10px', background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.1)', borderRadius:'8px', color:'#E8E8E8', fontSize:'12px', boxSizing:'border-box' as const },
    label: { fontSize:'11px', color:'#6B7A8D', marginBottom:'4px', display:'block' },
    btn: (gold=false) => ({ padding:'8px 14px', borderRadius:'8px', border:`1px solid ${gold ? 'rgba(201,168,76,.4)' : 'rgba(255,255,255,.1)'}`, background: gold ? 'rgba(201,168,76,.1)' : 'rgba(255,255,255,.04)', color: gold ? '#C9A84C' : '#A8B4C0', fontSize:'12px', cursor:'pointer', fontWeight: gold ? 600 : 400 } as React.CSSProperties)
  }

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 380px', gap:'20px' }}>
      <div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
          <h2 style={{ color:'#E8E8E8', fontSize:'16px', fontWeight:700, margin:0 }}>🎯 Opportunités de financement</h2>
          <div style={{ display:'flex', gap:'8px' }}>
            <button style={S.btn()} onClick={() => setShowAnalyse(!showAnalyse)}>✨ Analyser source IA</button>
            <button style={S.btn(true)} onClick={() => { setForm({ statut:'nouveau', type:'subvention' }); setEditing(true); setSelected(null) }}>+ Ajouter</button>
          </div>
        </div>

        {showAnalyse && (
          <div style={{ background:'#0F1923', border:'1px solid rgba(201,168,76,.2)', borderRadius:'10px', padding:'14px', marginBottom:'12px' }}>
            <div style={S.label}>Collez ici une URL, un texte, un appel à projets, une annonce de bailleur…</div>
            <textarea value={sourceTexte} onChange={e => setSourceTexte(e.target.value)} rows={5} style={{ ...S.input, resize:'vertical' }} placeholder="Ex: L'AFD lance un appel à projets pour les énergies renouvelables en Afrique de l'Ouest. Budget : 5 millions EUR. Deadline : 30 septembre 2026..." />
            <div style={{ display:'flex', gap:'8px', marginTop:'8px' }}>
              <button style={S.btn(true)} onClick={analyserSource} disabled={analysing}>{ analysing ? '⏳ Analyse en cours…' : '🤖 Analyser et extraire'}</button>
              <button style={S.btn()} onClick={() => setShowAnalyse(false)}>Annuler</button>
            </div>
          </div>
        )}

        <div style={{ display:'flex', gap:'6px', marginBottom:'12px', flexWrap:'wrap' }}>
          {['tous',...STATUTS].map(s => (
            <button key={s} onClick={() => setFiltreStatut(s)} style={{ ...S.btn(filtreStatut===s), fontSize:'11px', padding:'4px 10px' }}>{s}</button>
          ))}
        </div>

        {loading ? <div style={{ color:'#6B7A8D', fontSize:'13px' }}>Chargement…</div> : filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:'40px', color:'#6B7A8D', fontSize:'13px' }}>Aucune opportunité — utilisez "Analyser source IA" ou ajoutez manuellement</div>
        ) : filtered.map(item => (
          <div key={item.id} onClick={() => { setSelected(item); setEditing(false) }} style={{ ...S.card, borderColor: selected?.id===item.id ? 'rgba(201,168,76,.4)' : 'rgba(201,168,76,.12)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div style={{ fontSize:'13px', fontWeight:600, color:'#E8E8E8', marginBottom:'4px', flex:1 }}>{item.titre || 'Sans titre'}</div>
              <span style={{ fontSize:'10px', padding:'2px 8px', borderRadius:'10px', background:`${STATUT_COLOR[item.statut]}22`, color:STATUT_COLOR[item.statut], border:`1px solid ${STATUT_COLOR[item.statut]}44`, whiteSpace:'nowrap', marginLeft:'8px' }}>{item.statut}</span>
            </div>
            <div style={{ fontSize:'11px', color:'#6B7A8D' }}>{item.bailleur} · {item.type} · {item.zone}</div>
            <div style={{ display:'flex', gap:'12px', marginTop:'6px', fontSize:'11px' }}>
              {item.montant_max > 0 && <span style={{ color:'#C9A84C' }}>{fmt(item.montant_max)} FCFA</span>}
              {item.deadline && <span style={{ color:'#e74c3c' }}>⏱ {new Date(item.deadline).toLocaleDateString('fr-FR')}</span>}
              {item.secteurs && <span style={{ color:'#6B7A8D' }}>{item.secteurs}</span>}
            </div>
          </div>
        ))}
      </div>

      <div>
        {editing ? (
          <div style={{ background:'#0F1923', border:'1px solid rgba(201,168,76,.2)', borderRadius:'12px', padding:'16px', position:'sticky', top:'20px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'14px' }}>
              <div style={{ fontSize:'14px', fontWeight:700, color:'#C9A84C' }}>{form.id ? 'Modifier' : 'Nouvelle opportunité'}</div>
              <button onClick={() => { setEditing(false); setForm({ statut:'nouveau', type:'subvention' }) }} style={{ background:'none', border:'none', color:'#6B7A8D', cursor:'pointer', fontSize:'16px' }}>✕</button>
            </div>
            {[
              ['Titre *','titre','text'],
              ['Bailleur','bailleur','text'],
              ['Zone','zone','text'],
              ['Secteurs éligibles','secteurs','text'],
              ['Montant max (FCFA)','montant_max','number'],
              ['Deadline','deadline','date'],
            ].map(([l,k,t]) => (
              <div key={k as string} style={{ marginBottom:'10px' }}>
                <label style={S.label}>{l as string}</label>
                <input type={t as string} value={(form as Record<string,unknown>)[k as string] as string || ''} onChange={e => setForm(f => ({...f, [k as string]: t==='number' ? parseInt(e.target.value)||0 : e.target.value}))} style={S.input} />
              </div>
            ))}
            <div style={{ marginBottom:'10px' }}>
              <label style={S.label}>Type</label>
              <select value={form.type||'subvention'} onChange={e => setForm(f => ({...f, type:e.target.value}))} style={S.input}>
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ marginBottom:'10px' }}>
              <label style={S.label}>Statut</label>
              <select value={form.statut||'nouveau'} onChange={e => setForm(f => ({...f, statut:e.target.value}))} style={S.input}>
                {STATUTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ marginBottom:'14px' }}>
              <label style={S.label}>Notes</label>
              <textarea value={form.notes||''} onChange={e => setForm(f => ({...f, notes:e.target.value}))} rows={3} style={{ ...S.input, resize:'vertical' }} />
            </div>
            <div style={{ display:'flex', gap:'8px' }}>
              <button style={S.btn(true)} onClick={save} disabled={saving}>{saving ? '…' : '💾 Sauvegarder'}</button>
              <button style={S.btn()} onClick={() => { setEditing(false); setForm({ statut:'nouveau', type:'subvention' }) }}>Annuler</button>
            </div>
          </div>
        ) : selected ? (
          <div style={{ background:'#0F1923', border:'1px solid rgba(201,168,76,.2)', borderRadius:'12px', padding:'16px', position:'sticky', top:'20px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'14px' }}>
              <div style={{ fontSize:'14px', fontWeight:700, color:'#C9A84C' }}>{selected.titre}</div>
              <button onClick={() => setSelected(null)} style={{ background:'none', border:'none', color:'#6B7A8D', cursor:'pointer', fontSize:'16px' }}>✕</button>
            </div>
            {[['Bailleur',selected.bailleur],['Type',selected.type],['Zone',selected.zone],['Secteurs',selected.secteurs],['Montant max',fmt(selected.montant_max)+' FCFA'],['Deadline',selected.deadline ? new Date(selected.deadline).toLocaleDateString('fr-FR') : '—'],['Statut',selected.statut]].map(([l,v]) => v ? (
              <div key={l as string} style={{ marginBottom:'8px' }}>
                <div style={{ fontSize:'10px', color:'#6B7A8D' }}>{l as string}</div>
                <div style={{ fontSize:'12px', color:'#E8E8E8' }}>{v as string}</div>
              </div>
            ) : null)}
            {selected.notes && <div style={{ background:'rgba(255,255,255,.03)', borderRadius:'8px', padding:'10px', fontSize:'12px', color:'#A8B4C0', marginBottom:'12px' }}>{selected.notes}</div>}
            <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
              <button style={S.btn(true)} onClick={() => { setForm(selected); setEditing(true) }}>✏️ Modifier</button>
              <button style={{ ...S.btn(), color:'#e74c3c', borderColor:'rgba(231,76,60,.3)' }} onClick={() => remove(selected.id)}>🗑️</button>
            </div>
          </div>
        ) : (
          <div style={{ background:'#0F1923', border:'1px solid rgba(255,255,255,.06)', borderRadius:'12px', padding:'20px', textAlign:'center', color:'#6B7A8D', fontSize:'12px' }}>
            Sélectionnez une opportunité ou utilisez "Analyser source IA" pour en détecter automatiquement
          </div>
        )}
      </div>
    </div>
  )
}
