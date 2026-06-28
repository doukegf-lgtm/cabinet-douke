'use client'
import { useState, useEffect } from 'react'
import { createBrowserSupabaseClient } from '@/app/supabaseClient'

interface Dossier {
  id: string
  created_at: string
  nom_projet: string
  promoteur: string
  zone: string
  modele: string
  secteur: string
  juridique: string
  montant: number
  type_financement: string
  statut: string
  business_plan: string
  note_synthese: string
  plan_financier: Record<string, number>[]
  objet: string
  emplois: number
  partenaire: string
}

const STATUTS = ['brouillon', 'en cours', 'finalisé', 'soumis', 'financé', 'rejeté']
const STATUT_COLORS: Record<string, string> = {
  brouillon: 'bg-gray-100 text-gray-600 border-gray-200',
  'en cours': 'bg-amber-50 text-amber-700 border-amber-200',
  finalisé: 'bg-blue-50 text-blue-700 border-blue-200',
  soumis: 'bg-purple-50 text-purple-700 border-purple-200',
  financé: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejeté: 'bg-red-50 text-red-600 border-red-200',
}

export default function CoffrePage() {
  const [dossiers, setDossiers] = useState<Dossier[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filtreStatut, setFiltreStatut] = useState('tous')
  const [selected, setSelected] = useState<Dossier | null>(null)
  const [activeDoc, setActiveDoc] = useState<'bp' | 'ns' | 'info'>('info')
  const [editBp, setEditBp] = useState('')
  const [editNs, setEditNs] = useState('')
  const [editStatut, setEditStatut] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [showNewModel, setShowNewModel] = useState(false)
  const [newModel, setNewModel] = useState({ label: '', secteur: '', type: 'commercial' as 'commercial'|'social', sections_conditionnelles: '' })
  const [savingModel, setSavingModel] = useState(false)

  async function creerNouveauModele() {
    const sb = createBrowserSupabaseClient()
    if (!newModel.label.trim() || !newModel.secteur.trim()) return
    setSavingModel(true)
    const modele_id = newModel.label.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    const id = 'tpl_' + modele_id
    const { error } = await sb.from('templates_bp').insert({
      id, modele_id, type: newModel.type,
      label: newModel.label.trim(),
      secteur: newModel.secteur.trim(),
      sections_conditionnelles: newModel.sections_conditionnelles.trim(),
      squelette_bp: '', squelette_ns: ''
    })
    setSavingModel(false)
    if (error) {
      setMsg({ text: 'Erreur : ' + error.message, ok: false })
    } else {
      setMsg({ text: 'Modele cree avec succes', ok: true })
      setShowNewModel(false)
      setNewModel({ label: '', secteur: '', type: 'commercial', sections_conditionnelles: '' })
    }
  }

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const supabase = createBrowserSupabaseClient()
    const { data } = await supabase
      .from('dossiers_eden')
      .select('*')
      .order('created_at', { ascending: false })
    setDossiers(data || [])
    setLoading(false)
  }

  function openDossier(d: Dossier) {
    setSelected(d)
    setEditBp(d.business_plan || '')
    setEditNs(d.note_synthese || '')
    setEditStatut(d.statut || 'brouillon')
    setActiveDoc('info')
    setMsg(null)
  }

  async function continuerDossier(d: Dossier) {
    // Charge le dossier dans sessionStorage pour le moteur
    sessionStorage.setItem('architect_context', JSON.stringify({
      dossierId: d.id,
      nomProjet: d.nom_projet,
      modele: d.modele,
      zone: d.zone,
      promoteur: d.promoteur,
      montant: d.montant,
      typeFinancement: d.type_financement,
    }))
    if (d.plan_financier) {
      sessionStorage.setItem('architect_financial_data', JSON.stringify(d.plan_financier))
    }
    window.location.href = '/eden/architect/moteur'
  }

  async function dupliquerDossier(d: Dossier) {
    const supabase = createBrowserSupabaseClient()
    const { data } = await supabase.from('dossiers_eden').insert({
      nom_projet: d.nom_projet + ' (copie)',
      promoteur: d.promoteur,
      zone: d.zone,
      modele: d.modele,
      secteur: d.secteur,
      juridique: d.juridique,
      montant: d.montant,
      type_financement: d.type_financement,
      objet: d.objet,
      emplois: d.emplois,
      partenaire: d.partenaire,
      statut: 'brouillon'
    }).select().single()
    if (data) { await load() }
  }

  async function sauvegarder() {
    if (!selected) return
    setSaving(true)
    const supabase = createBrowserSupabaseClient()
    const { error } = await supabase
      .from('dossiers_eden')
      .update({ business_plan: editBp, note_synthese: editNs, statut: editStatut })
      .eq('id', selected.id)
    setSaving(false)
    if (!error) {
      setMsg({ text: '✅ Dossier mis à jour', ok: true })
      setDossiers(prev => prev.map(d => d.id === selected.id ? { ...d, business_plan: editBp, note_synthese: editNs, statut: editStatut } : d))
      setSelected(prev => prev ? { ...prev, business_plan: editBp, note_synthese: editNs, statut: editStatut } : null)
    } else {
      setMsg({ text: '❌ Erreur : ' + error.message, ok: false })
    }
    setTimeout(() => setMsg(null), 3000)
  }

  async function supprimer(id: string) {
    if (!confirm('Supprimer définitivement ce dossier ? Cette action est irréversible.')) return
    setDeleting(true)
    const supabase = createBrowserSupabaseClient()
    const { error } = await supabase.from('dossiers_eden').delete().eq('id', id)
    setDeleting(false)
    if (!error) {
      setDossiers(prev => prev.filter(d => d.id !== id))
      if (selected?.id === id) setSelected(null)
      setMsg({ text: '🗑️ Dossier supprimé', ok: true })
    } else {
      setMsg({ text: '❌ Erreur suppression', ok: false })
    }
    setTimeout(() => setMsg(null), 3000)
  }

  function exportTxt(content: string, name: string) {
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name + '.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  const filtered = dossiers.filter(d => {
    const matchSearch = d.nom_projet?.toLowerCase().includes(search.toLowerCase()) ||
      d.promoteur?.toLowerCase().includes(search.toLowerCase()) ||
      d.modele?.toLowerCase().includes(search.toLowerCase())
    const matchStatut = filtreStatut === 'tous' || d.statut === filtreStatut
    return matchSearch && matchStatut
  })

  const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR')

  return (
    <div style={{ minHeight: '100vh', background: '#0F1923', fontFamily: 'system-ui,sans-serif', color: '#E8E8E8' }}>
      {/* Header */}
      <div style={{ padding: '24px 32px', borderBottom: '1px solid rgba(201,168,76,.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <span style={{ fontSize: '20px' }}>🗄️</span>
            <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#C9A84C', margin: 0 }}>Coffre des dossiers ARCHITECT</h1>
          </div>
          <p style={{ fontSize: '12px', color: '#6B7A8D', margin: 0 }}>{dossiers.length} dossier{dossiers.length > 1 ? 's' : ''} enregistré{dossiers.length > 1 ? 's' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => setShowNewModel(true)} style={{ padding: '8px 16px', background: 'rgba(100,180,100,.1)', border: '1px solid rgba(100,180,100,.3)', borderRadius: '8px', color: '#6eb96e', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>+ Nouveau modèle BP</button>
          <a href="/eden/architect" style={{ padding: '8px 16px', background: 'rgba(201,168,76,.1)', border: '1px solid rgba(201,168,76,.3)', borderRadius: '8px', color: '#C9A84C', textDecoration: 'none', fontSize: '12px', fontWeight: 600 }}>+ Nouveau dossier</a>
          <a href="/eden" style={{ padding: '8px 16px', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: '8px', color: '#A8B4C0', textDecoration: 'none', fontSize: '12px' }}>← Accueil EDEN</a>
        </div>
      </div>

      {msg && (
        <div style={{ margin: '12px 32px', padding: '10px 16px', borderRadius: '8px', background: msg.ok ? 'rgba(46,204,113,.1)' : 'rgba(231,76,60,.1)', border: `1px solid ${msg.ok ? 'rgba(46,204,113,.3)' : 'rgba(231,76,60,.3)'}`, fontSize: '13px', color: msg.ok ? '#2ecc71' : '#e74c3c' }}>
          {msg.text}
        </div>
      )}

      {/* Statistiques par statut */}
      <div style={{ display: 'flex', gap: '10px', padding: '0 32px 16px', flexWrap: 'wrap' }}>
        {STATUTS.map(s => {
          const dossiersStatut = dossiers.filter(d => d.statut === s)
          const count = dossiersStatut.length
          const montantTotal = dossiersStatut.reduce((sum, d) => sum + (d.montant || 0), 0)
          const colorMap: Record<string, string> = {
            brouillon: '#6B7A8D', 'en cours': '#D9A441', finalisé: '#3B82F6', soumis: '#A855F7', financé: '#2ecc71', rejeté: '#e74c3c'
          }
          return (
            <div key={s}
              onClick={() => setFiltreStatut(filtreStatut === s ? 'tous' : s)}
              style={{ cursor: 'pointer', minWidth: '140px', flex: '1 1 140px', background: filtreStatut === s ? 'rgba(201,168,76,.08)' : 'rgba(255,255,255,.03)', border: `1px solid ${filtreStatut === s ? 'rgba(201,168,76,.35)' : 'rgba(255,255,255,.06)'}`, borderRadius: '10px', padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: colorMap[s] }} />
                <span style={{ fontSize: '11px', color: '#A8B4C0', fontWeight: 600, textTransform: 'capitalize' }}>{s}</span>
              </div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#E8E8E8' }}>{count}</div>
              <div style={{ fontSize: '10px', color: '#6B7A8D', marginTop: '2px' }}>{fmt(montantTotal)} FCFA</div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', height: 'calc(100vh - 100px)' }}>
        {/* Liste gauche */}
        <div style={{ width: '380px', minWidth: '320px', borderRight: '1px solid rgba(255,255,255,.06)', display: 'flex', flexDirection: 'column' }}>
          {/* Filtres */}
          <div style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Rechercher un dossier..."
              style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: '8px', color: '#E8E8E8', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
              {['tous', ...STATUTS].map(s => (
                <button key={s} onClick={() => setFiltreStatut(s)}
                  style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', border: '1px solid', background: filtreStatut === s ? 'rgba(201,168,76,.15)' : 'transparent', borderColor: filtreStatut === s ? 'rgba(201,168,76,.4)' : 'rgba(255,255,255,.1)', color: filtreStatut === s ? '#C9A84C' : '#6B7A8D' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Liste */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading && <div style={{ padding: '24px', textAlign: 'center', color: '#6B7A8D', fontSize: '13px' }}>Chargement...</div>}
            {!loading && filtered.length === 0 && (
              <div style={{ padding: '24px', textAlign: 'center', color: '#6B7A8D', fontSize: '13px' }}>Aucun dossier trouvé</div>
            )}
            {filtered.map(d => (
              <div key={d.id}
                onClick={() => openDossier(d)}
                style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,.04)', cursor: 'pointer', background: selected?.id === d.id ? 'rgba(201,168,76,.06)' : 'transparent', borderLeft: selected?.id === d.id ? '3px solid #C9A84C' : '3px solid transparent', transition: 'all .15s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#E8E8E8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.nom_projet || '—'}</div>
                    <div style={{ fontSize: '11px', color: '#6B7A8D', marginTop: '2px' }}>{d.promoteur || '—'} · {d.zone}</div>
                    <div style={{ fontSize: '11px', color: '#A8B4C0', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.modele}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', border: '1px solid rgba(201,168,76,.3)', background: 'rgba(201,168,76,.08)', color: '#C9A84C', whiteSpace: 'nowrap' }}>{d.statut}</span>
                    <span style={{ fontSize: '10px', color: '#3D4E5F' }}>{new Date(d.created_at).toLocaleDateString('fr-FR')}</span>
                  </div>
                </div>
                {d.montant > 0 && <div style={{ fontSize: '11px', color: '#C9A84C', fontWeight: 600, marginTop: '6px' }}>{fmt(d.montant)} FCFA</div>}
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => continuerDossier(d)} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(52,152,219,.4)', background: 'rgba(52,152,219,.1)', color: '#3498db', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}>▶ Continuer</button>
                  <button onClick={() => dupliquerDossier(d)} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(201,168,76,.3)', background: 'rgba(201,168,76,.06)', color: '#C9A84C', fontSize: '10px', cursor: 'pointer' }}>⧉ Dupliquer</button>
                  <button onClick={() => supprimer(d.id)} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(231,76,60,.3)', background: 'rgba(231,76,60,.06)', color: '#e74c3c', fontSize: '10px', cursor: 'pointer' }}>🗑</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Panneau droit */}
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3D4E5F' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🗄️</div>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>Sélectionnez un dossier</div>
              <div style={{ fontSize: '12px', marginTop: '4px' }}>pour consulter, modifier ou exporter</div>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Header dossier */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,.06)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#E8E8E8', margin: '0 0 4px 0' }}>{selected.nom_projet}</h2>
                <div style={{ fontSize: '12px', color: '#6B7A8D' }}>{selected.modele} · {selected.zone} · {selected.juridique}</div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <select value={editStatut} onChange={e => setEditStatut(e.target.value)}
                  style={{ padding: '6px 10px', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: '8px', color: '#E8E8E8', fontSize: '12px', cursor: 'pointer' }}>
                  {STATUTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <button onClick={() => continuerDossier(selected)} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid rgba(52,152,219,.4)', background: 'rgba(52,152,219,.1)', color: '#3498db', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  Continuer dans le moteur
                </button>
                <button onClick={() => dupliquerDossier(selected)} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid rgba(201,168,76,.3)', background: 'rgba(201,168,76,.06)', color: '#C9A84C', fontSize: '12px', cursor: 'pointer' }}>
                  Dupliquer
                </button>
                <button onClick={sauvegarder} disabled={saving}
                  style={{ padding: '6px 14px', background: 'rgba(201,168,76,.15)', border: '1px solid rgba(201,168,76,.3)', borderRadius: '8px', color: '#C9A84C', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                  {saving ? '...' : '💾 Sauvegarder'}
                </button>
                <button onClick={() => supprimer(selected.id)} disabled={deleting}
                  style={{ padding: '6px 14px', background: 'rgba(231,76,60,.1)', border: '1px solid rgba(231,76,60,.3)', borderRadius: '8px', color: '#e74c3c', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                  {deleting ? '...' : '🗑️ Supprimer'}
                </button>
              </div>
            </div>

            {/* Onglets */}
            <div style={{ display: 'flex', gap: '4px', padding: '12px 24px 0', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
              {[['info', '📋 Informations'], ['bp', '📄 Business Plan'], ['ns', '📝 Note de synthèse']].map(([k, l]) => (
                <button key={k} onClick={() => setActiveDoc(k as 'info' | 'bp' | 'ns')}
                  style={{ padding: '8px 14px', fontSize: '12px', fontWeight: activeDoc === k ? 700 : 400, background: 'transparent', border: 'none', borderBottom: activeDoc === k ? '2px solid #C9A84C' : '2px solid transparent', color: activeDoc === k ? '#C9A84C' : '#6B7A8D', cursor: 'pointer' }}>
                  {l}
                </button>
              ))}
            </div>

            {/* Contenu */}
            <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
              {activeDoc === 'info' && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                    {[
                      ['Promoteur', selected.promoteur],
                      ['Zone', selected.zone],
                      ['Forme juridique', selected.juridique],
                      ['Montant recherché', fmt(selected.montant) + ' FCFA'],
                      ['Type financement', selected.type_financement],
                      ['Partenaire visé', selected.partenaire],
                      ['Emplois créés', String(selected.emplois)],
                      ['Créé le', new Date(selected.created_at).toLocaleDateString('fr-FR')],
                    ].map(([k, v]) => (
                      <div key={k} style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: '8px', padding: '12px' }}>
                        <div style={{ fontSize: '10px', color: '#6B7A8D', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{k}</div>
                        <div style={{ fontSize: '13px', color: '#E8E8E8', fontWeight: 600 }}>{v || '—'}</div>
                      </div>
                    ))}
                  </div>
                  {selected.objet && (
                    <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: '8px', padding: '12px' }}>
                      <div style={{ fontSize: '10px', color: '#6B7A8D', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Objet du financement</div>
                      <div style={{ fontSize: '13px', color: '#E8E8E8', lineHeight: '1.6' }}>{selected.objet}</div>
                    </div>
                  )}
                  {selected.plan_financier?.length > 0 && (
                    <div style={{ marginTop: '12px', background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: '8px', padding: '12px' }}>
                      <div style={{ fontSize: '10px', color: '#6B7A8D', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>Plan financier</div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                          <thead>
                            <tr>{['Indicateur', ...selected.plan_financier.map(r => `Année ${r.annee}`)].map(h => (
                              <th key={h} style={{ padding: '6px 10px', background: 'rgba(255,255,255,.05)', color: '#6B7A8D', textAlign: h === 'Indicateur' ? 'left' : 'right', borderBottom: '1px solid rgba(255,255,255,.06)', fontWeight: 600 }}>{h}</th>
                            ))}</tr>
                          </thead>
                          <tbody>
                            {[['ca', "Chiffre d'affaires"], ['charges', 'Charges totales'], ['ebe', 'EBE'], ['res_net', 'Résultat net']].map(([k, l]) => (
                              <tr key={k}>
                                <td style={{ padding: '6px 10px', color: '#A8B4C0', borderBottom: '1px solid rgba(255,255,255,.04)', fontWeight: k === 'res_net' ? 700 : 400 }}>{l}</td>
                                {selected.plan_financier.map(r => (
                                  <td key={r.annee} style={{ padding: '6px 10px', textAlign: 'right', color: k === 'res_net' ? (r[k] >= 0 ? '#2ecc71' : '#e74c3c') : '#E8E8E8', borderBottom: '1px solid rgba(255,255,255,.04)', fontWeight: k === 'res_net' ? 700 : 400 }}>
                                    {fmt(r[k] || 0)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeDoc === 'bp' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
                    <button onClick={() => exportTxt(editBp, selected.nom_projet + '_BP')}
                      style={{ padding: '6px 12px', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: '8px', color: '#A8B4C0', fontSize: '12px', cursor: 'pointer' }}>
                      ⬇️ Exporter .txt
                    </button>
                  </div>
                  <textarea value={editBp} onChange={e => setEditBp(e.target.value)}
                    style={{ width: '100%', minHeight: '500px', background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)', borderRadius: '10px', color: '#E8E8E8', fontSize: '13px', lineHeight: '1.7', padding: '16px', resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
              )}

              {activeDoc === 'ns' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
                    <button onClick={() => exportTxt(editNs, selected.nom_projet + '_Note')}
                      style={{ padding: '6px 12px', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: '8px', color: '#A8B4C0', fontSize: '12px', cursor: 'pointer' }}>
                      ⬇️ Exporter .txt
                    </button>
                  </div>
                  <textarea value={editNs} onChange={e => setEditNs(e.target.value)}
                    style={{ width: '100%', minHeight: '500px', background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)', borderRadius: '10px', color: '#E8E8E8', fontSize: '13px', lineHeight: '1.7', padding: '16px', resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )

  const modalStyle = {
    overlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' },
    box: { background: '#111D2B', border: '1px solid rgba(201,168,76,.25)', borderRadius: '16px', padding: '28px', width: '480px', maxWidth: '90vw' },
    input: { width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: '8px', color: '#E8E8E8', fontSize: '13px', boxSizing: 'border-box' as const },
    btnGhost: { flex: 1, padding: '9px', borderRadius: '8px', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', color: '#6B7A8D', fontSize: '13px', cursor: 'pointer' },
  }

  return (
    <>
      {showNewModel && (
        <div style={modalStyle.overlay}>
          <div style={modalStyle.box}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#E8E8E8', marginBottom: '20px' }}>Créer un nouveau modèle de Business Plan</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '11px', color: '#6B7A8D', marginBottom: '4px' }}>Nom du modèle *</div>
                <input value={newModel.label} onChange={e => setNewModel(m => ({...m, label: e.target.value}))} placeholder="Ex : Pêche artisanale & valorisation" style={modalStyle.input} />
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#6B7A8D', marginBottom: '4px' }}>Secteur *</div>
                <input value={newModel.secteur} onChange={e => setNewModel(m => ({...m, secteur: e.target.value}))} placeholder="Ex : Pêche, Tourisme, Mining" style={modalStyle.input} />
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#6B7A8D', marginBottom: '4px' }}>Type</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['commercial','social'] as const).map(t => (
                    <button key={t} onClick={() => setNewModel(m => ({...m, type: t}))}
                      style={{ flex: 1, padding: '7px', borderRadius: '8px', cursor: 'pointer', fontWeight: newModel.type === t ? 600 : 400,
                        background: newModel.type === t ? 'rgba(201,168,76,.15)' : 'rgba(255,255,255,.04)',
                        border: newModel.type === t ? '1px solid rgba(201,168,76,.4)' : '1px solid rgba(255,255,255,.08)',
                        color: newModel.type === t ? '#C9A84C' : '#6B7A8D', fontSize: '12px' }}>
                      {t === 'commercial' ? 'Commercial' : 'Social'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#6B7A8D', marginBottom: '4px' }}>Sections spécifiques (optionnel)</div>
                <input value={newModel.sections_conditionnelles} onChange={e => setNewModel(m => ({...m, sections_conditionnelles: e.target.value}))} placeholder="Ex : Gestion licences, logistique portuaire" style={modalStyle.input} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button onClick={() => setShowNewModel(false)} style={modalStyle.btnGhost}>Annuler</button>
              <button onClick={creerNouveauModele} disabled={savingModel || !newModel.label.trim() || !newModel.secteur.trim()}
                style={{ flex: 2, padding: '9px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: savingModel ? 'wait' : 'pointer',
                  background: (newModel.label && newModel.secteur) ? 'rgba(201,168,76,.15)' : 'rgba(255,255,255,.04)',
                  border: (newModel.label && newModel.secteur) ? '1px solid rgba(201,168,76,.4)' : '1px solid rgba(255,255,255,.08)',
                  color: (newModel.label && newModel.secteur) ? '#C9A84C' : '#6B7A8D' }}>
                {savingModel ? 'Creation...' : 'Creer le modele'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}