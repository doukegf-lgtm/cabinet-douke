'use client'
import { useState, useEffect, ReactNode } from 'react'
import { createBrowserSupabaseClient } from '@/app/supabaseClient'
import type { EdenSession } from '@/lib/eden-auth'

interface Props {
  children: ReactNode
  requireAdmin?: boolean
  userId: string
}

export default function EdenGuard({ children, requireAdmin = false, userId }: Props) {
  const [status, setStatus] = useState<'loading' | 'ok' | 'denied' | 'not-admin'>('loading')

  useEffect(() => {
    async function check() {
      if (!userId) { setStatus('denied'); return }
      const supabase = createBrowserSupabaseClient()
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, name, role, eden_access')
        .eq('id', userId)
        .single()
      if (error || !data || !data.eden_access) { setStatus('denied'); return }
      if (requireAdmin && data.role !== 'admin') { setStatus('not-admin'); return }
      setStatus('ok')
    }
    check()
  }, [userId, requireAdmin])

  if (status === 'loading') return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'300px', color:'#6B7A8D', fontSize:'13px', gap:'10px' }}>
      <div style={{ width:'18px', height:'18px', border:'2px solid rgba(201,168,76,.3)', borderTop:'2px solid #C9A84C', borderRadius:'50%', animation:'spin 1s linear infinite' }} />
      Vérification des accès EDEN…
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (status === 'denied') return (
    <div style={{ textAlign:'center', padding:'60px 20px', background:'#162030', borderRadius:'16px', border:'1px solid rgba(201,168,76,.15)' }}>
      <div style={{ fontSize:'40px', marginBottom:'16px' }}>🔒</div>
      <div style={{ fontSize:'16px', fontWeight:600, color:'#C9A84C', marginBottom:'8px' }}>Accès EDEN restreint</div>
      <div style={{ fontSize:'13px', color:'#6B7A8D' }}>Contactez l'administrateur pour obtenir un accès.</div>
    </div>
  )

  if (status === 'not-admin') return (
    <div style={{ textAlign:'center', padding:'60px 20px', background:'#162030', borderRadius:'16px', border:'1px solid rgba(201,168,76,.15)' }}>
      <div style={{ fontSize:'40px', marginBottom:'16px' }}>⚠️</div>
      <div style={{ fontSize:'16px', fontWeight:600, color:'#C9A84C', marginBottom:'8px' }}>Réservé aux administrateurs</div>
    </div>
  )

  return <>{children}</>
}
