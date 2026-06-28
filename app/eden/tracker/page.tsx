'use client'
import { useState, useEffect } from 'react'
import { createBrowserSupabaseClient } from '@/app/supabaseClient'

interface Dossier {
  id: string
  nom_projet: string
  promoteur: string
  zone: string
  secteur: string
  montant: number
  statut: string
  type_financement: string
  created_at: string
}

interface Pipeline {
  id: string
  nom: string
  partenaire: string
  zone: string
  montant: number
  statut: string
  created_at: string
}

const STATUTS_COLOR: Record<string, string> = {
  brouillon: '#6B7A8D', soumis: '#3B82F6', 'en_negociation': '#C9A84C',
  approuve: '#2ecc71', rejete: '#e74c3c', prospect: '#6B7A8D',
  contacte: '#3B82F6', actif: '#2ecc71'
}

export default function TrackerPage() {
  const [dossiers, setDossiers] = useState<Dossier[]>([])
  const [pipeline, setPipeline] = useState<Pipeline[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'kpi'|'dossiers'|'pipeline'|'pl'>('kpi')
  const [pl, setPl] = useState({ ca: '', charges: '', objectif: '' })

  const supabase = createBrowserSupabaseClient()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [d, p] = await Promise.all([
      supabase.from('dossiers_eden').select('*').order('created_at', { ascending: false }),
      supabase.from('pipeline_connector').select('*').order('created_at', { ascending: false }),
    ])
    setDossiers(d.data || [])
    setPipeline(p.data || [])
    setLoading(false)
  }

  const totalMontant = dossiers.reduce((s, d) => s + (d.montant || 0), 0)
  const approuves = dossiers.filter(d => d.statut === 'approuve')
  const totalApprouve = approuves.reduce((s, d) => s + (d.montant || 0), 0)
  const tauxConversion = dossiers.length ? Math.round((approuves.length / dossiers.length) * 100) : 0
  const actifsPipeline = pipeline.filter(p => p.statut === 'actif').length
  const montantPipelineActif = pipeline.filter(p => p.statut === 'actif').reduce((s, p) => s + (p.montant || 0), 0)
  const dossiersFinancés = dossiers.filter(d => d.statut === 'financé').length

  function fmtM(n: number) {
    if (n >= 1000000000) return (n / 1000000000).toFixed(1) + ' Mrd'
    if (n >= 1000000) return (n / 1000000).toFixed(0) + ' M'
    return n?.toLocaleString('fr-FR')
  }

  function fmtDate(s: string) {
    return new Date(s).toLocaleDateString('fr-FR')
  }

  const byZone = dossiers.reduce((acc, d) => {
    acc[d.zone] = (acc[d.zone] || 0) + 1; return acc
  }, {} as Record<string, number>)

  const byStatut = dossiers.reduce((acc, d) => {
    acc[d.statut] = (acc[d.statut] || 0) + 1; return acc
  }, {} as Record<string, number>)

  const caNum = parseFloat(pl.ca) || 0
  const chargesNum = parseFloat(pl.charges) || 0
  const objectifNum = parseFloat(pl.objectif) || 0
  const ebe = caNum - chargesNum
  const margeEbe = caNum ? Math.round((ebe / caNum) * 100) : 0
  const tauxObjectif = objectifNum ? Math.round((caNum / objectifNum) * 100) : 0

  const S = {
    page: { color: '#E8E8E8', fontFamily: 'system-ui,sans-serif' } as React.CSSProperties,
    card: { background: '#162030', border: '1px solid rgba(201,168,76,.15)', borderRadius: '12px', padding: '20px' } as React.CSSProperties,
    kpi: { background: '#162030', border: '1px solid rgba(201,168,76,.15)', borderRadius: '12px', padding: '20px', textAlign: 'center' as const },
    input: { width: '100%', background: '#0F1923', border: '1px solid rgba(201,168,76,.2)', borderRadius: '8px', padding: '8px 12px', color: '#E8E8E8', fontSize: '13px', boxSizing: 'border-box' as const },
    tab: (a: boolean) => ({ padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: a ? 600 : 400, cursor: 'pointer', border: '1px solid', background: a ? 'rgba(201,168,76,.15)' : 'transparent', color: a ? '#C9A84C' : '#6B7A8D', borderColor: a ? 'rgba(201,168,76,.3)' : 'transparent' }) as React.CSSProperties,
  }

  return (
    <div style={S.page}>
      <div style={{ fontSize: '20px', fontWeight: 700, color: '#C9A84C', marginBottom: '4px' }}>🟣 TRACKER — Reporting & Performance</div>
      <div style={{ fontSize: '13px', color: '#6B7A8D', marginBottom: '20px' }}>Suivi en temps réel — dossiers, pipeline, P&L Cabinet DOUKE</div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {[['kpi','📊 KPIs'],['dossiers','📁 Dossiers'],['pipeline','🔗 Pipeline'],['pl','💰 P&L Cabinet']].map(([k,l]) => (
          <button key={k} style={S.tab(activeTab === k)} onClick={() => setActiveTab(k as typeof activeTab)}>{l}</button>
        ))}
        <button onClick={load} style={{ ...S.tab(false), marginLeft: 'auto' }}>🔄 Actualiser</button>
      </div>

      {loading ? <div style={{ color: '#6B7A8D', fontSize: '13px' }}>Chargement…</div> : (
        <>
          {activeTab === 'kpi' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                {[
                  ['📁', 'Dossiers total', dossiers.length, ''],
                  ['✅', 'Dossiers approuvés', approuves.length, ''],
                  ['📈', 'Taux de conversion', tauxConversion + '%', ''],
                  ['🔗', 'Pipeline actif (montant)', fmtM(montantPipelineActif) + ' FCFA', ''],
                  ['🏅', 'Dossiers financés', dossiersFinancés, ''],
                  ['💰', 'Volume total', fmtM(totalMontant) + ' FCFA', ''],
                  ['🏆', 'Volume approuvé', fmtM(totalApprouve) + ' FCFA', ''],
                  ['🔗', 'Pipeline actifs', actifsPipeline, ''],
                ].map(([icon, label, val]) => (
                  <div key={label as string} style={S.kpi}>
                    <div style={{ fontSize: '28px', marginBottom: '8px' }}>{icon}</div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#C9A84C', marginBottom: '4px' }}>{val}</div>
                    <div style={{ fontSize: '11px', color: '#6B7A8D' }}>{label}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={S.card}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#C9A84C', marginBottom: '14px' }}>Dossiers par statut</div>
                  {Object.entries(byStatut).map(([s, n]) => (
                    <div key={s} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: STATUTS_COLOR[s] || '#6B7A8D' }} />
                        <span style={{ fontSize: '12px', color: '#A8B4C0', textTransform: 'capitalize' }}>{s}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: `${Math.round((n / dossiers.length) * 80)}px`, height: '4px', borderRadius: '2px', background: STATUTS_COLOR[s] || '#6B7A8D' }} />
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#E8E8E8' }}>{n}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={S.card}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#C9A84C', marginBottom: '14px' }}>Dossiers par zone</div>
                  {Object.entries(byZone).map(([z, n]) => (
                    <div key={z} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <span style={{ fontSize: '12px', color: '#A8B4C0' }}>{z || 'Non défini'}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: `${Math.round((n / dossiers.length) * 80)}px`, height: '4px', borderRadius: '2px', background: '#C9A84C' }} />
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#E8E8E8' }}>{n}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'dossiers' && (
            <div style={S.card}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr>
                    {['Projet', 'Promoteur', 'Zone', 'Secteur', 'Montant', 'Type', 'Statut', 'Date'].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', color: '#6B7A8D', fontWeight: 600, textTransform: 'uppercase', borderBottom: '1px solid rgba(201,168,76,.12)', background: '#1E2D3D' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dossiers.length === 0 ? (
                    <tr><td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: '#6B7A8D', fontSize: '13px' }}>Aucun dossier — créez-en un depuis ARCHITECT</td></tr>
                  ) : dossiers.map(d => (
                    <tr key={d.id}>
                      <td style={{ padding: '10px 12px', color: '#E8E8E8', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,.04)' }}>{d.nom_projet}</td>
                      <td style={{ padding: '10px 12px', color: '#A8B4C0', borderBottom: '1px solid rgba(255,255,255,.04)' }}>{d.promoteur}</td>
                      <td style={{ padding: '10px 12px', color: '#A8B4C0', borderBottom: '1px solid rgba(255,255,255,.04)' }}>{d.zone}</td>
                      <td style={{ padding: '10px 12px', color: '#A8B4C0', borderBottom: '1px solid rgba(255,255,255,.04)' }}>{d.secteur}</td>
                      <td style={{ padding: '10px 12px', color: '#C9A84C', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,.04)' }}>{fmtM(d.montant)} FCFA</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,.04)' }}><a href='/eden/architect/coffre' style={{ color: '#6B7A8D', fontSize: '11px', textDecoration: 'none' }}>Voir →</a></td>
                      <td style={{ padding: '10px 12px', color: '#A8B4C0', borderBottom: '1px solid rgba(255,255,255,.04)' }}>{d.type_financement}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: `${STATUTS_COLOR[d.statut]}20`, color: STATUTS_COLOR[d.statut] || '#6B7A8D', border: `1px solid ${STATUTS_COLOR[d.statut]}40` }}>{d.statut}</span>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#6B7A8D', borderBottom: '1px solid rgba(255,255,255,.04)' }}>{fmtDate(d.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'pipeline' && (
            <div style={S.card}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr>
                    {['Nom', 'Partenaire', 'Zone', 'Montant', 'Statut', 'Date'].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', color: '#6B7A8D', fontWeight: 600, textTransform: 'uppercase', borderBottom: '1px solid rgba(201,168,76,.12)', background: '#1E2D3D' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pipeline.length === 0 ? (
                    <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#6B7A8D', fontSize: '13px' }}>Aucune entrée pipeline — créez-en depuis CONNECTOR</td></tr>
                  ) : pipeline.map(p => (
                    <tr key={p.id}>
                      <td style={{ padding: '10px 12px', color: '#E8E8E8', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,.04)' }}>{p.nom}</td>
                      <td style={{ padding: '10px 12px', color: '#A8B4C0', borderBottom: '1px solid rgba(255,255,255,.04)' }}>{p.partenaire}</td>
                      <td style={{ padding: '10px 12px', color: '#A8B4C0', borderBottom: '1px solid rgba(255,255,255,.04)' }}>{p.zone}</td>
                      <td style={{ padding: '10px 12px', color: '#C9A84C', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,.04)' }}>{fmtM(p.montant)} FCFA</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,.04)' }}><a href='/eden/connector' style={{ color: '#6B7A8D', fontSize: '11px', textDecoration: 'none' }}>Voir →</a></td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: `${STATUTS_COLOR[p.statut]}20`, color: STATUTS_COLOR[p.statut] || '#6B7A8D', border: `1px solid ${STATUTS_COLOR[p.statut]}40` }}>{p.statut}</span>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#6B7A8D', borderBottom: '1px solid rgba(255,255,255,.04)' }}>{fmtDate(p.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'pl' && (
            <div>
              <div style={{ ...S.card, marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#C9A84C', marginBottom: '16px' }}>Saisie P&L — Exercice en cours</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
                  {[['ca', 'Chiffre d\'affaires (FCFA)'], ['charges', 'Charges totales (FCFA)'], ['objectif', 'Objectif CA (FCFA)']].map(([k, l]) => (
                    <div key={k}>
                      <label style={{ fontSize: '11px', color: '#6B7A8D', display: 'block', marginBottom: '6px' }}>{l}</label>
                      <input style={S.input} type="number" value={pl[k as keyof typeof pl]} onChange={e => setPl(p => ({ ...p, [k]: e.target.value }))} />
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                {[
                  ['💰', 'Chiffre d\'affaires', fmtM(caNum) + ' FCFA', caNum > 0 ? '#2ecc71' : '#6B7A8D'],
                  ['📉', 'Charges totales', fmtM(chargesNum) + ' FCFA', '#e74c3c'],
                  ['📊', 'EBE', fmtM(ebe) + ' FCFA', ebe >= 0 ? '#2ecc71' : '#e74c3c'],
                  ['%', 'Marge EBE', margeEbe + '%', margeEbe >= 20 ? '#2ecc71' : '#C9A84C'],
                  ['🎯', 'Taux vs objectif', tauxObjectif + '%', tauxObjectif >= 100 ? '#2ecc71' : '#C9A84C'],
                ].map(([icon, label, val, color]) => (
                  <div key={label as string} style={{ ...S.kpi, borderColor: `${color}30` }}>
                    <div style={{ fontSize: '24px', marginBottom: '8px' }}>{icon}</div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: color as string, marginBottom: '4px' }}>{val}</div>
                    <div style={{ fontSize: '11px', color: '#6B7A8D' }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
