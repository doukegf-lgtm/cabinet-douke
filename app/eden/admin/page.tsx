'use client'
import { useState, useEffect } from 'react'
import { createBrowserSupabaseClient } from '@/app/supabaseClient'

interface ProfileRow {
  id: string
  username: string
  name: string
  role: string
  eden_access: boolean
}

export default function EdenAdminPage() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string>('')

  useEffect(() => {
    async function load() {
      const supabase = createBrowserSupabaseClient()
      const { data: accounts } = await supabase.from('auth_accounts').select('id').limit(1)
      if (accounts?.[0]) setCurrentUserId(accounts[0].id)
      const { data } = await supabase
        .from('profiles')
        .select('id, username, name, role, eden_access')
        .order('role', { ascending: false })
      setProfiles(data || [])
      setLoading(false)
    }
    load()
  }, [])

  async function toggleAccess(p: ProfileRow) {
    setSaving(p.id)
    const supabase = createBrowserSupabaseClient()
    const { error } = await supabase
      .from('profiles')
      .update({ eden_access: !p.eden_access })
      .eq('id', p.id)
    if (error) {
      setMsg({ text: 'Erreur : ' + error.message, ok: false })
    } else {
      setProfiles(prev => prev.map(x => x.id === p.id ? { ...x, eden_access: !p.eden_access } : x))
      setMsg({ text: `Accès ${!p.eden_access ? 'activé' : 'désactivé'} pour ${p.name}`, ok: true })
      setTimeout(() => setMsg(null), 3000)
    }
    setSaving(null)
  }

  return (
    <div style={{ maxWidth:'780px' }}>
      <div style={{ fontSize:'20px', fontWeight:700, color:'#C9A84C', marginBottom:'4px' }}>⚙️ Gestion des accès EDEN</div>
      <div style={{ fontSize:'13px', color:'#6B7A8D', marginBottom:'24px', lineHeight:'1.6' }}>
        Activez ou désactivez l'accès au système EDEN pour chaque membre de l'équipe.
      </div>
      {msg && (
        <div style={{ padding:'10px 16px', borderRadius:'8px', marginBottom:'16px', fontSize:'13px', border:'1px solid', background: msg.ok ? 'rgba(46,204,113,.08)' : 'rgba(231,76,60,.08)', borderColor: msg.ok ? 'rgba(46,204,113,.3)' : 'rgba(231,76,60,.3)', color: msg.ok ? '#2ecc71' : '#e74c3c' }}>
          {msg.ok ? '✅' : '⚠️'} {msg.text}
        </div>
      )}
      {loading ? (
        <div style={{ color:'#6B7A8D', fontSize:'13px' }}>Chargement…</div>
      ) : (
        <div style={{ background:'#162030', border:'1px solid rgba(201,168,76,.15)', borderRadius:'12px', overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                {['Membre','Username','Rôle','Accès EDEN','Action'].map(h => (
                  <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:'11px', fontWeight:600, color:'#6B7A8D', textTransform:'uppercase', letterSpacing:'.06em', borderBottom:'1px solid rgba(201,168,76,.12)', background:'#1E2D3D' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {profiles.map(p => (
                <tr key={p.id}>
                  <td style={{ padding:'12px 14px', borderBottom:'1px solid rgba(255,255,255,.04)', fontSize:'13px', color:'#E8E8E8', fontWeight:500 }}>{p.name}</td>
                  <td style={{ padding:'12px 14px', borderBottom:'1px solid rgba(255,255,255,.04)', fontSize:'12px', color:'#6B7A8D', fontFamily:'monospace' }}>@{p.username}</td>
                  <td style={{ padding:'12px 14px', borderBottom:'1px solid rgba(255,255,255,.04)' }}>
                    <span style={{ fontSize:'11px', padding:'2px 8px', borderRadius:'10px', background: p.role === 'admin' ? 'rgba(201,168,76,.15)' : 'rgba(255,255,255,.06)', color: p.role === 'admin' ? '#C9A84C' : '#6B7A8D', border:`1px solid ${p.role === 'admin' ? 'rgba(201,168,76,.3)' : 'rgba(255,255,255,.1)'}` }}>
                      {p.role === 'admin' ? '👑 Admin' : 'Membre'}
                    </span>
                  </td>
                  <td style={{ padding:'12px 14px', borderBottom:'1px solid rgba(255,255,255,.04)' }}>
                    <span style={{ fontSize:'11px', padding:'2px 8px', borderRadius:'10px', background: p.eden_access ? 'rgba(46,204,113,.1)' : 'rgba(231,76,60,.08)', color: p.eden_access ? '#2ecc71' : '#e74c3c', border:`1px solid ${p.eden_access ? 'rgba(46,204,113,.25)' : 'rgba(231,76,60,.2)'}` }}>
                      {p.eden_access ? '✅ Actif' : '🔒 Inactif'}
                    </span>
                  </td>
                  <td style={{ padding:'12px 14px', borderBottom:'1px solid rgba(255,255,255,.04)' }}>
                    {p.id !== currentUserId ? (
                      <button onClick={() => toggleAccess(p)} disabled={saving === p.id} style={{ padding:'5px 14px', borderRadius:'6px', fontSize:'12px', fontWeight:500, cursor:'pointer', border:'1px solid', opacity: saving === p.id ? 0.5 : 1, background: p.eden_access ? 'rgba(231,76,60,.1)' : 'rgba(46,204,113,.1)', color: p.eden_access ? '#e74c3c' : '#2ecc71', borderColor: p.eden_access ? 'rgba(231,76,60,.3)' : 'rgba(46,204,113,.3)' }}>
                        {saving === p.id ? '…' : p.eden_access ? "Retirer l'accès" : "Donner l'accès"}
                      </button>
                    ) : (
                      <span style={{ fontSize:'11px', color:'#3D4E5F' }}>Vous</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
