'use client'
import { useState, useEffect, ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createBrowserSupabaseClient } from '@/app/supabaseClient'
import type { EdenSession } from '@/lib/eden-auth'

const NAV = [
  { href: '/eden', label: 'Accueil EDEN', icon: '🏠', exact: true },
  { href: '/eden/partenaires', label: 'SCOUT — Partenaires', icon: '🔵', exact: false },
  { href: '/eden/architect', label: 'ARCHITECT — Dossiers', icon: '🟡', exact: false },
  { href: '/eden/architect/coffre', label: ' 🗄️ Coffre des dossiers', icon: '', exact: false },
  { href: '/eden/connector', label: 'CONNECTOR — Pipeline', icon: '🟢', exact: false },
  { href: '/eden/tracker', label: 'TRACKER — Reporting', icon: '🟣', exact: false },
]

export default function EdenLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [session, setSession] = useState<EdenSession | null>(null)
  const [status, setStatus] = useState<'loading' | 'ok' | 'denied'>('loading')

  useEffect(() => {
    async function checkAccess() {
      try {
        const raw = localStorage.getItem('eden_current_user')
        if (!raw) { setStatus('denied'); return }
        const account = JSON.parse(raw)
        if (!account?.id) { setStatus('denied'); return }
        const supabase = createBrowserSupabaseClient()
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, username, name, role, eden_access')
          .eq('id', account.id)
          .single()
        if (!profile || !profile.eden_access) { setStatus('denied'); return }
        setSession(profile as EdenSession)
        setStatus('ok')
      } catch { setStatus('denied') }
    }
    checkAccess()
  }, [])

  if (status === 'loading') return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#0F1923', gap:'10px', color:'#6B7A8D', fontSize:'13px' }}>
      <div style={{ width:'20px', height:'20px', border:'2px solid rgba(201,168,76,.3)', borderTop:'2px solid #C9A84C', borderRadius:'50%', animation:'spin 1s linear infinite' }} />
      Vérification des accès…
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (status === 'denied' || !session) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#0F1923', fontFamily:'system-ui,sans-serif' }}>
      <div style={{ textAlign:'center', maxWidth:'400px', padding:'40px 24px' }}>
        <div style={{ fontSize:'48px', marginBottom:'16px' }}>🔒</div>
        <div style={{ fontSize:'18px', fontWeight:700, color:'#C9A84C', marginBottom:'10px' }}>Accès EDEN restreint</div>
        <p style={{ fontSize:'13px', color:'#6B7A8D', lineHeight:'1.6', marginBottom:'24px' }}>Votre compte n'est pas autorisé à accéder au système EDEN. Contactez l'administrateur du Cabinet DOUKE.</p>
        <a href="/" style={{ display:'inline-block', padding:'10px 24px', background:'rgba(201,168,76,.12)', border:'1px solid rgba(201,168,76,.3)', borderRadius:'8px', color:'#C9A84C', textDecoration:'none', fontSize:'13px', fontWeight:500 }}>← Retour au dashboard</a>
      </div>
    </div>
  )

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'#0F1923' }}>
      <aside style={{ width:'240px', flexShrink:0, background:'#162030', borderRight:'1px solid rgba(201,168,76,.15)', display:'flex', flexDirection:'column', minHeight:'100vh' }}>
        <div style={{ padding:'18px 16px', borderBottom:'1px solid rgba(201,168,76,.15)', display:'flex', alignItems:'center', gap:'10px' }}>
          <div style={{ width:'34px', height:'34px', borderRadius:'8px', background:'linear-gradient(135deg,#C9A84C,#8a6d2f)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, color:'#0F1923', fontSize:'16px' }}>E</div>
          <div>
            <div style={{ fontSize:'13px', fontWeight:700, color:'#C9A84C' }}>Système EDEN</div>
            <div style={{ fontSize:'11px', color:'#6B7A8D' }}>Cabinet DOUKE</div>
          </div>
        </div>
        <nav style={{ flex:1, padding:'10px 8px' }}>
          {NAV.map(item => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
            return (
              <Link key={item.href} href={item.href} style={{ textDecoration:'none' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'9px 12px', borderRadius:'8px', marginBottom:'2px', background: active ? 'rgba(201,168,76,.12)' : 'transparent', border: active ? '1px solid rgba(201,168,76,.2)' : '1px solid transparent' }}>
                  <span style={{ fontSize:'14px' }}>{item.icon}</span>
                  <span style={{ fontSize:'12px', fontWeight: active ? 600 : 400, color: active ? '#C9A84C' : '#A8B4C0' }}>{item.label}</span>
                </div>
              </Link>
            )
          })}
          {session.role === 'admin' && (
            <Link href="/eden/admin" style={{ textDecoration:'none' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'9px 12px', borderRadius:'8px', marginTop:'12px', background:'rgba(201,168,76,.05)', border:'1px solid rgba(201,168,76,.2)' }}>
                <span style={{ fontSize:'14px' }}>⚙️</span>
                <span style={{ fontSize:'12px', color:'#C9A84C', fontWeight:600 }}>Gestion accès</span>
              </div>
            </Link>
          )}
        </nav>
        <div style={{ padding:'12px 16px', borderTop:'1px solid rgba(201,168,76,.15)' }}>
          <a href="/" style={{ display:'flex', alignItems:'center', gap:'8px', padding:'8px 10px', marginBottom:'10px', borderRadius:'8px', background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.08)', color:'#A8B4C0', textDecoration:'none', fontSize:'12px', fontWeight:500 }}>
            <span>←</span><span>Retour à l'accueil</span>
          </a>
          <div style={{ fontSize:'12px', fontWeight:600, color:'#A8B4C0' }}>{session.name}</div>
          <div style={{ fontSize:'11px', color:'#6B7A8D', marginTop:'2px' }}>{session.role === 'admin' ? '👑 Administrateur EDEN' : '✅ Accès EDEN actif'}</div>
          <div style={{ fontSize:'10px', color:'#3D4E5F', marginTop:'2px' }}>@{session.username}</div>
        </div>
      </aside>
      <main style={{ flex:1, padding:'24px', overflow:'auto', fontFamily:'system-ui,sans-serif' }}>
        {children}
      </main>
    </div>
  )
}
