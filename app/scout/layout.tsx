'use client'
import { useState, useEffect } from 'react'
import { createBrowserSupabaseClient } from '@/app/supabaseClient'

export default function ScoutLayout({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'loading'|'ok'|'denied'>('loading')
  const [session, setSession] = useState<{name:string,role:string,scout_access:boolean}|null>(null)

  useEffect(() => {
    const raw = localStorage.getItem('eden_current_user')
    if (!raw) { setStatus('denied'); return }
    try {
      const u = JSON.parse(raw)
      const sb = createBrowserSupabaseClient()
      sb.from('auth_accounts').select('id,name,role,scout_access').eq('id', u.id).single().then(({ data }) => {
        if (!data || !data.scout_access) { setStatus('denied'); return }
        setSession(data)
        setStatus('ok')
      })
    } catch { setStatus('denied') }
  }, [])

  if (status === 'loading') return (
    <div style={{ minHeight:'100vh', background:'#0A1628', display:'flex', alignItems:'center', justifyContent:'center', color:'#6B7A8D', fontFamily:'Inter,sans-serif' }}>
      Chargement SCOUT…
    </div>
  )

  if (status === 'denied') return (
    <div style={{ minHeight:'100vh', background:'#0A1628', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Inter,sans-serif' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:'32px', marginBottom:'12px' }}>🔒</div>
        <div style={{ color:'#E8E8E8', fontWeight:700, fontSize:'16px', marginBottom:'8px' }}>Accès SCOUT non autorisé</div>
        <div style={{ color:'#6B7A8D', fontSize:'13px', marginBottom:'20px' }}>Contactez votre administrateur pour obtenir l'accès</div>
        <a href="/" style={{ color:'#C9A84C', fontSize:'13px' }}>← Retour accueil</a>
      </div>
    </div>
  )

  const NAV = [
    { href:'/scout', label:'🏠 Accueil' },
    { href:'/scout/opportunites', label:'🎯 Opportunités' },
    { href:'/scout/prospection', label:'🔍 Prospection' },
    { href:'/scout/partenaires', label:'🤝 Partenaires' },
    { href:'/', label:'← App DOUKE' },
  ]

  return (
    <div style={{ minHeight:'100vh', background:'#0A1628', fontFamily:'Inter,sans-serif' }}>
      <div style={{ background:'#0F1923', borderBottom:'1px solid rgba(201,168,76,.15)', padding:'0 24px', display:'flex', alignItems:'center', justifyContent:'space-between', height:'52px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
          <span style={{ fontSize:'16px', fontWeight:800, color:'#C9A84C', letterSpacing:'2px' }}>SCOUT</span>
          <span style={{ fontSize:'10px', color:'#6B7A8D', marginLeft:'4px' }}>by DOUKE</span>
        </div>
        <div style={{ display:'flex', gap:'4px' }}>
          {NAV.map(n => (
            <a key={n.href} href={n.href} style={{ padding:'6px 12px', borderRadius:'6px', fontSize:'12px', color:'#A8B4C0', textDecoration:'none', background:'rgba(255,255,255,.03)' }}>{n.label}</a>
          ))}
        </div>
        <div style={{ fontSize:'11px', color:'#6B7A8D' }}>{session?.name} · {session?.role}</div>
      </div>
      <div style={{ maxWidth:'1200px', margin:'0 auto', padding:'28px 24px' }}>{children}</div>
    </div>
  )
}
