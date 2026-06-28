'use client'
import { useEffect, useState } from 'react'
import { createBrowserSupabaseClient } from '@/app/supabaseClient'

export default function ScoutHome() {
  const [stats, setStats] = useState({ opportunites: 0, prospects: 0, partenaires: 0, affectes: 0 })

  useEffect(() => {
    const sb = createBrowserSupabaseClient()
    Promise.all([
      sb.from('scout_opportunites').select('id', { count:'exact', head:true }),
      sb.from('scout_prospects').select('id', { count:'exact', head:true }),
      sb.from('partenaires_eden').select('id', { count:'exact', head:true }),
      sb.from('scout_prospects').select('id', { count:'exact', head:true }).not('assigned_to', 'is', null),
    ]).then(([o, p, pa, a]) => setStats({ opportunites: o.count||0, prospects: p.count||0, partenaires: pa.count||0, affectes: a.count||0 }))
  }, [])

  const CARDS = [
    { href:'/scout/opportunites', icon:'🎯', label:'Opportunités', sub:'Appels à projets, subventions, financements ouverts', count: stats.opportunites, color:'#C9A84C' },
    { href:'/scout/prospection', icon:'🔍', label:'Prospection', sub:'Prospects qualifiés par service DOUKE', count: stats.prospects, color:'#3B82F6' },
    { href:'/scout/partenaires', icon:'🤝', label:'Partenaires', sub:'Réseau de partenaires financiers UEMOA', count: stats.partenaires, color:'#2ecc71' },
  ]

  return (
    <div>
      <div style={{ marginBottom:'24px', display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:'12px' }}>
        <div>
          <h1 style={{ fontSize:'22px', fontWeight:800, color:'#E8E8E8', margin:0 }}>SCOUT — Intelligence Commerciale</h1>
          <p style={{ color:'#6B7A8D', fontSize:'13px', marginTop:'6px' }}>Détection d'opportunités · Prospection qualifiée · Réseau partenaires UEMOA</p>
        </div>
        <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
          <a href="/scout/opportunites" style={{ padding:'9px 16px', borderRadius:'8px', background:'rgba(201,168,76,.12)', border:'1px solid rgba(201,168,76,.3)', color:'#C9A84C', fontSize:'12px', fontWeight:700, textDecoration:'none', display:'flex', alignItems:'center', gap:'6px' }}>
            + Nouvelle opportunité
          </a>
          <a href="/scout/prospection" style={{ padding:'9px 16px', borderRadius:'8px', background:'rgba(52,152,219,.1)', border:'1px solid rgba(52,152,219,.3)', color:'#3498db', fontSize:'12px', fontWeight:700, textDecoration:'none', display:'flex', alignItems:'center', gap:'6px' }}>
            + Générer prospects IA
          </a>
          <a href="/scout/partenaires" style={{ padding:'9px 16px', borderRadius:'8px', background:'rgba(46,204,113,.08)', border:'1px solid rgba(46,204,113,.25)', color:'#2ecc71', fontSize:'12px', fontWeight:700, textDecoration:'none', display:'flex', alignItems:'center', gap:'6px' }}>
            + Ajouter partenaire
          </a>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'14px', marginBottom:'20px' }}>
        {CARDS.map(c => (
          <a key={c.href} href={c.href} style={{ textDecoration:'none', background:'#0F1923', border:`1px solid ${c.color}33`, borderRadius:'14px', padding:'20px', display:'block', transition:'all .2s' }}>
            <div style={{ fontSize:'26px', marginBottom:'10px' }}>{c.icon}</div>
            <div style={{ fontSize:'15px', fontWeight:700, color:c.color, marginBottom:'4px' }}>{c.label}</div>
            <div style={{ fontSize:'11px', color:'#6B7A8D', marginBottom:'14px', lineHeight:'1.5' }}>{c.sub}</div>
            <div style={{ display:'flex', alignItems:'baseline', gap:'6px' }}>
              <span style={{ fontSize:'28px', fontWeight:800, color:'#E8E8E8' }}>{c.count}</span>
              <span style={{ fontSize:'11px', color:'#6B7A8D' }}>enregistré{c.count > 1 ? 's' : ''}</span>
            </div>
            <div style={{ marginTop:'14px', padding:'7px 12px', borderRadius:'6px', background:`${c.color}11`, border:`1px solid ${c.color}22`, fontSize:'11px', fontWeight:600, color:c.color, textAlign:'center' }}>
              Accéder →
            </div>
          </a>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px', marginBottom:'20px' }}>
        <div style={{ background:'#0F1923', border:'1px solid rgba(201,168,76,.12)', borderRadius:'12px', padding:'16px' }}>
          <div style={{ fontSize:'12px', fontWeight:600, color:'#C9A84C', marginBottom:'10px' }}>Actions rapides</div>
          <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
            <a href="/scout/opportunites" style={{ padding:'9px 14px', borderRadius:'8px', background:'rgba(201,168,76,.08)', border:'1px solid rgba(201,168,76,.2)', color:'#E8E8E8', fontSize:'12px', textDecoration:'none', display:'flex', alignItems:'center', gap:'8px' }}>
              <span>🎯</span> Analyser une source (URL, texte, annonce)
            </a>
            <a href="/scout/prospection" style={{ padding:'9px 14px', borderRadius:'8px', background:'rgba(52,152,219,.06)', border:'1px solid rgba(52,152,219,.15)', color:'#E8E8E8', fontSize:'12px', textDecoration:'none', display:'flex', alignItems:'center', gap:'8px' }}>
              <span>🤖</span> Générer des prospects qualifiés par IA
            </a>
            <a href="/scout/partenaires" style={{ padding:'9px 14px', borderRadius:'8px', background:'rgba(46,204,113,.06)', border:'1px solid rgba(46,204,113,.15)', color:'#E8E8E8', fontSize:'12px', textDecoration:'none', display:'flex', alignItems:'center', gap:'8px' }}>
              <span>🤝</span> Consulter les partenaires financiers UEMOA
            </a>
            <a href="/eden/connector" style={{ padding:'9px 14px', borderRadius:'8px', background:'rgba(155,89,182,.06)', border:'1px solid rgba(155,89,182,.15)', color:'#E8E8E8', fontSize:'12px', textDecoration:'none', display:'flex', alignItems:'center', gap:'8px' }}>
              <span>🔗</span> Voir le pipeline CONNECTOR
            </a>
          </div>
        </div>
        <div style={{ background:'#0F1923', border:'1px solid rgba(255,255,255,.06)', borderRadius:'12px', padding:'16px' }}>
          <div style={{ fontSize:'12px', fontWeight:600, color:'#E8E8E8', marginBottom:'10px' }}>Tableau de bord</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
            {[
              { label:'Opportunités', val:stats.opportunites, color:'#C9A84C' },
              { label:'Prospects', val:stats.prospects, color:'#3498db' },
              { label:'Partenaires', val:stats.partenaires, color:'#2ecc71' },
              { label:'Affectés', val:stats.affectes, color:'#9b59b6' },
            ].map(k => (
              <div key={k.label} style={{ background:'rgba(255,255,255,.03)', borderRadius:'8px', padding:'12px', textAlign:'center' }}>
                <div style={{ fontSize:'22px', fontWeight:800, color:k.color }}>{k.val}</div>
                <div style={{ fontSize:'11px', color:'#6B7A8D', marginTop:'2px' }}>{k.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
