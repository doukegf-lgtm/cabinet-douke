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
      <div style={{ marginBottom:'28px' }}>
        <h1 style={{ fontSize:'22px', fontWeight:800, color:'#E8E8E8', margin:0 }}>🔵 SCOUT — Intelligence Commerciale</h1>
        <p style={{ color:'#6B7A8D', fontSize:'13px', marginTop:'6px' }}>Détection d'opportunités · Prospection qualifiée · Réseau partenaires UEMOA</p>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'16px', marginBottom:'28px' }}>
        {CARDS.map(c => (
          <a key={c.href} href={c.href} style={{ textDecoration:'none', background:'#0F1923', border:`1px solid ${c.color}22`, borderRadius:'12px', padding:'20px', display:'block' }}>
            <div style={{ fontSize:'24px', marginBottom:'8px' }}>{c.icon}</div>
            <div style={{ fontSize:'15px', fontWeight:700, color:c.color, marginBottom:'4px' }}>{c.label}</div>
            <div style={{ fontSize:'12px', color:'#6B7A8D', marginBottom:'12px' }}>{c.sub}</div>
            <div style={{ fontSize:'22px', fontWeight:800, color:'#E8E8E8' }}>{c.count}</div>
          </a>
        ))}
      </div>
      <div style={{ background:'#0F1923', border:'1px solid rgba(255,255,255,.06)', borderRadius:'12px', padding:'16px 20px', fontSize:'12px', color:'#6B7A8D' }}>
        {stats.affectes} prospect{stats.affectes > 1 ? 's' : ''} affecté{stats.affectes > 1 ? 's' : ''} à des collaborateurs · <a href="/eden/connector" style={{ color:'#C9A84C' }}>Voir pipeline CONNECTOR →</a>
      </div>
    </div>
  )
}
