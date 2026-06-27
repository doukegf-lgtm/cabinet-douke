'use client'
import { useState } from 'react'
import { createBrowserSupabaseClient } from '@/app/supabaseClient'

const MODELES_COMMERCIAUX = [
  { id: 'agro', label: 'Agrobusiness & Transformation agricole', secteur: 'Agriculture' },
  { id: 'btp', label: 'BTP & Matériaux de construction', secteur: 'BTP' },
  { id: 'sante', label: 'Clinique & Services de santé', secteur: 'Santé' },
  { id: 'fintech', label: 'Fintech & Services financiers digitaux', secteur: 'Finance' },
  { id: 'energie', label: 'Énergie solaire & Efficacité énergétique', secteur: 'Énergie' },
  { id: 'immo', label: 'Immobilier & Promotion immobilière', secteur: 'Immobilier' },
  { id: 'transport', label: 'Transport & Logistique', secteur: 'Transport' },
  { id: 'education', label: 'École privée & Formation professionnelle', secteur: 'Éducation' },
  { id: 'restauration', label: 'Restauration & Hôtellerie', secteur: 'Tourisme' },
  { id: 'commerce', label: 'Commerce général & Distribution', secteur: 'Commerce' },
  { id: 'numerique', label: 'Services numériques & Développement web', secteur: 'Numérique' },
  { id: 'elevage', label: 'Élevage & Aquaculture', secteur: 'Agriculture' },
  { id: 'industrie', label: 'Industrie manufacturière & Artisanat', secteur: 'Industrie' },
  { id: 'pharma', label: 'Pharmacie & Parapharmacie', secteur: 'Santé' },
  { id: 'media', label: 'Médias & Communication', secteur: 'Médias' },
]

const MODELES_SOCIAUX = [
  { id: 'microfinance', label: 'Institution de Microfinance (IMF)', secteur: 'Finance solidaire' },
  { id: 'inclusion_femmes', label: 'Inclusion économique des femmes', secteur: 'Genre & Développement' },
  { id: 'eau', label: 'Accès à l\'eau potable & Assainissement', secteur: 'WASH' },
  { id: 'environnement', label: 'Environnement & Gestion des déchets', secteur: 'Environnement' },
  { id: 'sante_communautaire', label: 'Santé communautaire & Nutrition', secteur: 'Santé' },
  { id: 'education_rurale', label: 'Éducation rurale & Alphabétisation', secteur: 'Éducation' },
  { id: 'agriculture_familiale', label: 'Agriculture familiale & Sécurité alimentaire', secteur: 'Agriculture' },
  { id: 'jeunesse', label: 'Insertion professionnelle des jeunes', secteur: 'Emploi' },
  { id: 'handicap', label: 'Inclusion des personnes handicapées', secteur: 'Social' },
  { id: 'habitat', label: 'Habitat social & Logement abordable', secteur: 'Habitat' },
  { id: 'culture', label: 'Culture & Industries créatives', secteur: 'Culture' },
  { id: 'numerique_rural', label: 'Numérique rural & E-agriculture', secteur: 'Numérique' },
]

const ZONES = ['Bénin', 'Togo', 'Côte d\'Ivoire', 'Sénégal', 'UEMOA', 'OHADA']
const JURIDIQUES = ['SARL', 'SA', 'SAS', 'GIE', 'Coopérative', 'Association', 'ONG', 'Fondation']
const FINANCEMENTS = ['Crédit bancaire', 'Capital-investissement', 'Subvention', 'Microcrédit', 'Obligation', 'PPP', 'Garantie + Crédit']
const GARANTIES_LIST = ['Hypothèque immobilière', 'Nantissement matériel', 'Caution personnelle', 'Fonds de garantie (GARI)', 'Warrant agricole', 'Assurance-crédit']
const PARTENAIRES = ['BOAD', 'AFD / Proparco', 'Oikocredit', 'Cofina', 'Ecobank', 'BNDE Bénin', 'GARI Fund', 'UNCDF', 'Advans', 'BOA', 'SIB', 'Autre']

type Step = 'modele' | 'formulaire' | 'plan' | 'resultat'
type PlanType = '3ans' | '5ans' | '5ans_expert'

interface Formulaire {
  nom_projet: string
  promoteur: string
  zone: string
  juridique: string
  capital: string
  montant: string
  type_financement: string
  objet: string
  emplois: string
  garanties: string[]
  partenaire: string
}

interface PlanHypo {
  ca_annee1: string
  croissance: string
  charges_fixes: string
  charges_variables: string
  taux_impot: string
}

export default function ArchitectPage() {
  const [step, setStep] = useState<Step>('modele')
  const [typeModele, setTypeModele] = useState<'commercial' | 'social'>('commercial')
  const [modeleChoisi, setModeleChoisi] = useState<{ id: string; label: string; secteur: string } | null>(null)
  const [form, setForm] = useState<Formulaire>({ nom_projet:'', promoteur:'', zone:'Bénin', juridique:'SARL', capital:'', montant:'', type_financement:'Crédit bancaire', objet:'', emplois:'', garanties:[], partenaire:'' })
  const [planType, setPlanType] = useState<PlanType>('3ans')
  const [hypo, setHypo] = useState<PlanHypo>({ ca_annee1:'', croissance:'10', charges_fixes:'', charges_variables:'', taux_impot:'25' })
  const [generating, setGenerating] = useState(false)
  const [bp, setBp] = useState('')
  const [ns, setNs] = useState('')
  const [planData, setPlanData] = useState<Record<string, number>[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activeDoc, setActiveDoc] = useState<'bp' | 'ns' | 'plan'>('bp')

  function toggleGarantie(g: string) {
    setForm(f => ({ ...f, garanties: f.garanties.includes(g) ? f.garanties.filter(x => x !== g) : [...f.garanties, g] }))
  }

  function buildPlanFinancier() {
    const ca1 = parseFloat(hypo.ca_annee1) || 0
    const tx = (parseFloat(hypo.croissance) || 10) / 100
    const cf = parseFloat(hypo.charges_fixes) || 0
    const cv_pct = (parseFloat(hypo.charges_variables) || 40) / 100
    const impot = (parseFloat(hypo.taux_impot) || 25) / 100
    const years = planType === '3ans' ? 3 : 5
    return Array.from({ length: years }, (_, i) => {
      const ca = ca1 * Math.pow(1 + tx, i)
      const cv = ca * cv_pct
      const charges = cf + cv
      const ebe = ca - charges
      const amort = (parseFloat(form.capital) || 0) * 0.1
      const res_avant = ebe - amort
      const impots = res_avant > 0 ? res_avant * impot : 0
      const res_net = res_avant - impots
      return { annee: i + 1, ca: Math.round(ca), charges: Math.round(charges), ebe: Math.round(ebe), amort: Math.round(amort), res_avant: Math.round(res_avant), impots: Math.round(impots), res_net: Math.round(res_net) }
    })
  }

  function injecter(texte: string, f: typeof form, m: typeof modeleChoisi): string {
    return texte
      .replace(/\{\{nom_projet\}\}/g, f.nom_projet)
      .replace(/\{\{promoteur\}\}/g, f.promoteur || 'Le promoteur')
      .replace(/\{\{zone\}\}/g, f.zone)
      .replace(/\{\{juridique\}\}/g, f.juridique)
      .replace(/\{\{capital\}\}/g, f.capital ? Number(f.capital).toLocaleString('fr-FR') : '—')
      .replace(/\{\{montant\}\}/g, f.montant ? Number(f.montant).toLocaleString('fr-FR') : '—')
      .replace(/\{\{type_financement\}\}/g, f.type_financement)
      .replace(/\{\{objet\}\}/g, f.objet || 'Voir détails du projet')
      .replace(/\{\{emplois\}\}/g, f.emplois || '—')
      .replace(/\{\{garanties\}\}/g, f.garanties.join(', ') || '—')
      .replace(/\{\{partenaire\}\}/g, f.partenaire || '—')
      .replace(/\{\{modele\}\}/g, m?.label || '')
      .replace(/\{\{secteur\}\}/g, m?.secteur || '')
  }

  async function generer() {
    if (!modeleChoisi || !form.nom_projet || !form.montant) return
    setGenerating(true)
    const plan = buildPlanFinancier()
    setPlanData(plan)

    // NIVEAU 1 : Squelette depuis templates_bp
    const supabase = createBrowserSupabaseClient()
    const { data: tplRows } = await supabase
      .from('templates_bp')
      .select('squelette_bp, squelette_ns')
      .eq('modele_id', modeleChoisi.id)
      .limit(1)
    const tplData = tplRows && tplRows.length > 0 ? tplRows[0] : null

    // Si squelette disponible : injection directe sans IA
    if (tplData?.squelette_bp) {
      setBp(injecter(tplData.squelette_bp, form, modeleChoisi))
      setNs(injecter(tplData.squelette_ns || '', form, modeleChoisi))
      setGenerating(false)
      setStep('resultat')
      return
    }

    // Sinon : génération IA (modèles sans squelette)
    try {
      const isSocial = typeModele === 'social'
      const prompt = `Tu es un expert senior en ingénierie financière OHADA/UEMOA.

Génère un business plan COMPLET, DÉTAILLÉ et BANCABLE en français pour :
Projet : ${form.nom_projet}
Promoteur : ${form.promoteur}
Modèle : ${modeleChoisi.label} (${modeleChoisi.secteur})
Zone : ${form.zone}
Forme juridique : ${form.juridique}
Capital : ${form.capital} FCFA
Montant recherché : ${form.montant} FCFA
Type de financement : ${form.type_financement}
Objet du financement : ${form.objet}
Emplois créés : ${form.emplois}
Garanties : ${form.garanties.join(', ')}
Partenaire visé : ${form.partenaire}

Rédige un business plan complet avec : 1) Résumé exécutif 2) Présentation du promoteur 3) Description du projet 4) Analyse du marché OHADA 5) Stratégie commerciale 6) Organisation et ressources humaines 7) Plan de financement 8) Analyse des risques et mitigations. Sois précis, professionnel, adapté au contexte africain OHADA.`

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 4000, messages: [{ role: 'user', content: prompt }] })
      })
      const d = await res.json()
      const txt = d.content?.map((x: {type:string;text?:string}) => x.text || '').join('') || ''
      setBp(txt)

      const prompt2 = `Rédige une note de synthèse concise (400 mots max) pour comité de crédit concernant le projet "${form.nom_projet}" — ${modeleChoisi.label} — ${form.zone}. Montant : ${form.montant} FCFA. Type : ${form.type_financement}. Garanties : ${form.garanties.join(', ')}. Conclusion avec recommandation claire.`
      const res2 = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2000, messages: [{ role: 'user', content: prompt2 }] })
      })
      const d2 = await res2.json()
      setNs(d2.content?.map((x: {type:string;text?:string}) => x.text || '').join('') || '')
    } catch (e) {
      setBp('Erreur de génération. Vérifiez votre connexion.')
    }
    setGenerating(false)
    setStep('resultat')
  }

  async function sauvegarder() {
    setSaving(true)
    const supabase = createBrowserSupabaseClient()
    const { error } = await supabase.from('dossiers_eden').insert({
      nom_projet: form.nom_projet, promoteur: form.promoteur, zone: form.zone,
      modele: modeleChoisi?.label, secteur: modeleChoisi?.secteur,
      juridique: form.juridique, capital: parseFloat(form.capital) || 0,
      montant: parseFloat(form.montant) || 0, type_financement: form.type_financement,
      objet: form.objet, emplois: parseInt(form.emplois) || 0,
      garanties: form.garanties.join(', '), partenaire: form.partenaire,
      plan_type: planType, business_plan: bp, note_synthese: ns,
      plan_financier: planData, statut: 'brouillon'
    })
    setSaving(false)
    if (!error) setSaved(true)
  }

  function exportTxt(content: string, name: string) {
    const blob = new Blob([content], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
  }

  const S = {
    page: { color: '#E8E8E8', fontFamily: 'system-ui,sans-serif' } as React.CSSProperties,
    title: { fontSize: '20px', fontWeight: 700, color: '#C9A84C', marginBottom: '4px' } as React.CSSProperties,
    sub: { fontSize: '13px', color: '#6B7A8D', marginBottom: '24px' } as React.CSSProperties,
    card: { background: '#162030', border: '1px solid rgba(201,168,76,.15)', borderRadius: '12px', padding: '20px', marginBottom: '16px' } as React.CSSProperties,
    label: { fontSize: '12px', color: '#6B7A8D', marginBottom: '6px', display: 'block' } as React.CSSProperties,
    input: { width: '100%', background: '#0F1923', border: '1px solid rgba(201,168,76,.2)', borderRadius: '8px', padding: '9px 12px', color: '#E8E8E8', fontSize: '13px', boxSizing: 'border-box' } as React.CSSProperties,
    btn: { padding: '10px 20px', borderRadius: '8px', fontWeight: 600, fontSize: '13px', cursor: 'pointer', border: 'none' } as React.CSSProperties,
    btnGold: { background: 'linear-gradient(135deg,#C9A84C,#8a6d2f)', color: '#0F1923' } as React.CSSProperties,
    btnGhost: { background: 'rgba(201,168,76,.1)', color: '#C9A84C', border: '1px solid rgba(201,168,76,.3)' } as React.CSSProperties,
    tab: (active: boolean) => ({ padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: active ? 600 : 400, cursor: 'pointer', border: '1px solid', background: active ? 'rgba(201,168,76,.15)' : 'transparent', color: active ? '#C9A84C' : '#6B7A8D', borderColor: active ? 'rgba(201,168,76,.3)' : 'transparent' }) as React.CSSProperties,
  }

  return (
    <div style={S.page}>
      <div style={S.title}>🟡 ARCHITECT — Dossiers de financement</div>
      <div style={S.sub}>Génération automatique de Business Plan, Plan Financier et Note de Synthèse</div>

      {/* ÉTAPES */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {[['modele','1. Modèle'],['formulaire','2. Informations'],['plan','3. Plan financier'],['resultat','4. Documents']].map(([k,l]) => (
          <div key={k} style={{ padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: step === k ? 600 : 400, background: step === k ? 'rgba(201,168,76,.15)' : 'rgba(255,255,255,.04)', color: step === k ? '#C9A84C' : '#6B7A8D', border: `1px solid ${step === k ? 'rgba(201,168,76,.3)' : 'transparent'}` }}>{l}</div>
        ))}
      </div>

      {/* ÉTAPE 1 — MODÈLE */}
      {step === 'modele' && (
        <div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            <button style={{ ...S.btn, ...(typeModele === 'commercial' ? S.btnGold : S.btnGhost) }} onClick={() => setTypeModele('commercial')}>💼 Activités commerciales</button>
            <button style={{ ...S.btn, ...(typeModele === 'social' ? S.btnGold : S.btnGhost) }} onClick={() => setTypeModele('social')}>🤝 Projets sociaux</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
            {(typeModele === 'commercial' ? MODELES_COMMERCIAUX : MODELES_SOCIAUX).map(m => (
              <div key={m.id} onClick={() => { setModeleChoisi(m); setStep('formulaire') }} style={{ ...S.card, cursor: 'pointer', borderColor: modeleChoisi?.id === m.id ? 'rgba(201,168,76,.5)' : 'rgba(201,168,76,.12)', marginBottom: 0 }}>
                <div style={{ fontSize: '12px', color: '#C9A84C', marginBottom: '4px' }}>{m.secteur}</div>
                <div style={{ fontSize: '13px', fontWeight: 500, color: '#E8E8E8' }}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ÉTAPE 2 — FORMULAIRE */}
      {step === 'formulaire' && modeleChoisi && (
        <div>
          <div style={{ ...S.card, borderColor: 'rgba(201,168,76,.3)', marginBottom: '20px' }}>
            <div style={{ fontSize: '12px', color: '#C9A84C' }}>{modeleChoisi.secteur}</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#E8E8E8' }}>{modeleChoisi.label}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            {[['nom_projet','Nom du projet *'],['promoteur','Promoteur / Porteur de projet'],['capital','Capital social (FCFA)'],['montant','Montant recherché (FCFA) *'],['objet','Objet du financement'],['emplois','Emplois créés']].map(([k, l]) => (
              <div key={k}>
                <label style={S.label}>{l}</label>
                <input style={S.input} value={form[k as keyof Formulaire] as string} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
              </div>
            ))}
            {[['zone','Zone géographique',ZONES],['juridique','Forme juridique',JURIDIQUES],['type_financement','Type de financement',FINANCEMENTS],['partenaire','Partenaire visé',PARTENAIRES]].map(([k,l,opts]) => (
              <div key={k as string}>
                <label style={S.label}>{l as string}</label>
                <select style={S.input} value={form[k as keyof Formulaire] as string} onChange={e => setForm(f => ({ ...f, [k as string]: e.target.value }))}>
                  {(opts as string[]).map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '16px' }}>
            <label style={S.label}>Garanties proposées</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {GARANTIES_LIST.map(g => (
                <div key={g} onClick={() => toggleGarantie(g)} style={{ padding: '6px 12px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer', background: form.garanties.includes(g) ? 'rgba(201,168,76,.15)' : 'rgba(255,255,255,.04)', color: form.garanties.includes(g) ? '#C9A84C' : '#6B7A8D', border: `1px solid ${form.garanties.includes(g) ? 'rgba(201,168,76,.3)' : 'transparent'}` }}>{g}</div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button style={{ ...S.btn, ...S.btnGhost }} onClick={() => setStep('modele')}>← Retour</button>
            <button style={{ ...S.btn, ...S.btnGold }} onClick={() => setStep('plan')} disabled={!form.nom_projet || !form.montant}>Continuer →</button>
          </div>
        </div>
      )}

      {/* ÉTAPE 3 — PLAN FINANCIER */}
      {step === 'plan' && (
        <div>
          <div style={S.card}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#C9A84C', marginBottom: '16px' }}>Choisir le niveau du plan financier</div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
              {[['3ans','📊 3 ans essentiel'],['5ans','📈 5 ans complet'],['5ans_expert','🎯 5 ans expert (SIG + seuil)']].map(([k,l]) => (
                <button key={k} style={{ ...S.btn, ...(planType === k ? S.btnGold : S.btnGhost) }} onClick={() => setPlanType(k as PlanType)}>{l}</button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              {[['ca_annee1','CA Année 1 (FCFA)'],['croissance','Taux de croissance annuel (%)'],['charges_fixes','Charges fixes annuelles (FCFA)'],['charges_variables','Charges variables (% du CA)'],['taux_impot','Taux d\'imposition (%)']].map(([k,l]) => (
                <div key={k}>
                  <label style={S.label}>{l}</label>
                  <input style={S.input} type="number" value={hypo[k as keyof PlanHypo]} onChange={e => setHypo(h => ({ ...h, [k]: e.target.value }))} />
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button style={{ ...S.btn, ...S.btnGhost }} onClick={() => setStep('formulaire')}>← Retour</button>
            <a href='/eden/architect/coffre' style={{ ...S.btn, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', color: '#A8B4C0', textDecoration: 'none', display: 'inline-block' }}>🗄️ Coffre des dossiers</a>
            <button style={{ ...S.btn, ...S.btnGold }} onClick={generer} disabled={generating}>
              {generating ? '⏳ Génération en cours…' : '✨ Générer les documents'}
            </button>
            {typeModele === 'commercial' && (
              <button style={{ ...S.btn, background: 'rgba(99,102,241,.15)', border: '1px solid rgba(99,102,241,.4)', color: '#818CF8' }}
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    sessionStorage.setItem('architect_context', JSON.stringify({
                      nomProjet: form.nom_projet,
                      promoteur: form.promoteur,
                      secteur: modeleChoisi?.secteur ?? '',
                      modele: modeleChoisi?.label ?? '',
                      zone: form.zone,
                      juridique: form.juridique,
                      tauxCroissance: parseFloat(hypo.croissance) || 10,
                    }))
                    window.location.href = '/eden/architect/moteur'
                  }
                }}>
                🔢 Moteur financier avancé →
              </button>
            )}
            {typeModele === 'social' && (
              <button style={{ ...S.btn, background: 'rgba(147,51,234,.15)', border: '1px solid rgba(147,51,234,.4)', color: '#A855F7' }}
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    sessionStorage.setItem('architect_context', JSON.stringify({
                      nomProjet: form.nom_projet,
                      promoteur: form.promoteur,
                      secteur: modeleChoisi?.secteur ?? '',
                      modele: modeleChoisi?.label ?? '',
                      zone: form.zone,
                      juridique: form.juridique,
                    }))
                    window.location.href = '/eden/architect/moteur-social'
                  }
                }}>
                🤝 Moteur budgétaire social →
              </button>
            )}
          </div>
        </div>
      )}

      {/* ÉTAPE 4 — RÉSULTATS */}
      {step === 'resultat' && (
        <div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
            {[['bp','📄 Business Plan'],['ns','📋 Note de Synthèse'],['plan','📊 Plan Financier']].map(([k,l]) => (
              <button key={k} style={S.tab(activeDoc === k)} onClick={() => setActiveDoc(k as 'bp'|'ns'|'plan')}>{l}</button>
            ))}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
              {!saved ? (
                <button style={{ ...S.btn, ...S.btnGold }} onClick={sauvegarder} disabled={saving}>{saving ? '…' : '💾 Sauvegarder'}</button>
              ) : <span style={{ fontSize: '12px', color: '#2ecc71' }}>✅ Sauvegardé</span>}
              <button style={{ ...S.btn, ...S.btnGhost }} onClick={() => exportTxt(activeDoc === 'bp' ? bp : ns, `${form.nom_projet}_${activeDoc}.txt`)}>⬇️ Export .txt</button>
              <button style={{ ...S.btn, ...S.btnGhost }} onClick={() => { setBp(''); setNs(''); setPlanData([]); setStep('modele'); setSaved(false) }}>+ Nouveau</button>
            </div>
          </div>

          {(activeDoc === 'bp' || activeDoc === 'ns') && (
            <div style={S.card}>
              <textarea style={{ width: '100%', minHeight: '420px', background: 'transparent', border: 'none', color: '#E8E8E8', fontSize: '13px', lineHeight: '1.7', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
                value={activeDoc === 'bp' ? bp : ns}
                onChange={e => activeDoc === 'bp' ? setBp(e.target.value) : setNs(e.target.value)}
              />
            </div>
          )}

          {activeDoc === 'plan' && planData.length > 0 && (
            <div style={S.card}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#C9A84C', marginBottom: '14px' }}>Plan financier — {planType === '3ans' ? '3 ans' : '5 ans'}</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr>
                      {['Indicateur', ...planData.map(r => `Année ${r.annee}`)].map(h => (
                        <th key={h} style={{ padding: '8px 12px', background: '#1E2D3D', color: '#6B7A8D', textAlign: h === 'Indicateur' ? 'left' : 'right', borderBottom: '1px solid rgba(201,168,76,.15)', fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[['ca','Chiffre d\'affaires'],['charges','Charges totales'],['ebe','EBE'],['amort','Amortissements'],['res_avant','Résultat avant IS'],['impots','Impôts (IS)'],['res_net','Résultat net']].map(([k,l]) => (
                      <tr key={k}>
                        <td style={{ padding: '8px 12px', color: '#A8B4C0', fontWeight: k === 'res_net' ? 700 : 400, borderBottom: '1px solid rgba(255,255,255,.04)' }}>{l}</td>
                        {planData.map(r => (
                          <td key={r.annee} style={{ padding: '8px 12px', textAlign: 'right', color: k === 'res_net' ? (r[k] >= 0 ? '#2ecc71' : '#e74c3c') : '#E8E8E8', fontWeight: k === 'res_net' ? 700 : 400, borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                            <input style={{ background: 'transparent', border: 'none', color: 'inherit', textAlign: 'right', width: '100%', fontWeight: 'inherit', outline: 'none', fontSize: '12px' }}
                              value={r[k].toLocaleString('fr-FR')}
                              onChange={e => setPlanData(prev => prev.map(row => row.annee === r.annee ? { ...row, [k]: parseInt(e.target.value.replace(/\s/g,'')) || 0 } : row))}
                            />
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
    </div>
  )
}
