'use client'
import { useState, useEffect } from 'react'
import { createBrowserSupabaseClient } from '@/app/supabaseClient'

export default function EdenHomePage() {
  const [stats, setStats] = useState({ partenaires: 0, dossiers: 0, pipeline: 0 })

  useEffect(() => {
    async function load() {
      const supabase = createBrowserSupabaseClient()
      const [p, d, c] = await Promise.all([
        supabase.from('partenaires_eden').select('id', { count: 'exact', head: true }),
        supabase.from('dossiers_eden').select('id', { count: 'exact', head: true }),
        supabase.from('pipeline_connector').select('id', { count: 'exact', head: true }),
      ])
      setStats({ partenaires: p.count ?? 0, dossiers: d.count ?? 0, pipeline: c.count ?? 0 })
    }
    load()
  }, [])

  const cards = [
    { icon: '🔵', label: 'SCOUT', sub: 'Partenaires financiers', count: stats.partenaires, href: '/eden/partenaires', color: '#3B82F6' },
    { icon: '🟡', label: 'ARCHITECT', sub: 'Dossiers de financement', count: stats.dossiers, href: '/eden/architect', color: '#C9A84C' },
    { icon: '🟢', label: 'CONNECTOR', sub: 'Pipeline de mise en relation', count: stats.pipeline, href: '/eden/connector', color: '#2ecc71' },
    { icon: '🟣', label: 'TRACKER', sub: 'Reporting & Performance', count: null, href: '/eden/tracker', color: '#9B59B6' },
  ]

  return (
    <div>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#C9A84C', margin: 0 }}>Système EDEN</h1>
        <p style={{ fontSize: '13px', color: '#6B7A8D', marginTop: '6px' }}>
          Plateforme intégrée de mobilisation de financements — Cabinet DOUKE
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        {cards.map(c => (
          <a key={c.href} href={c.href} style={{ textDecoration: 'none' }}>
            <div style={{ background: '#162030', border: '1px solid rgba(201,168,76,.15)', borderRadius: '12px', padding: '20px', cursor: 'pointer', transition: 'border-color .2s' }}>
              <div style={{ fontSize: '28px', marginBottom: '10px' }}>{c.icon}</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: c.color }}>{c.label}</div>
              <div style={{ fontSize: '12px', color: '#6B7A8D', marginTop: '4px' }}>{c.sub}</div>
              {c.count !== null && (
                <div style={{ fontSize: '22px', fontWeight: 700, color: '#E8E8E8', marginTop: '12px' }}>{c.count}</div>
              )}
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
