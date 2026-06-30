'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createBrowserSupabaseClient } from '@/app/supabaseClient'

interface ServiceLigne { libelle: string; unite: string; montant: number }
interface EtapeLigne { titre: string; date: string; livrable: string }

function NouveauDocumentInner() {
  const params = useSearchParams()
  const router = useRouter()
  const editId = params.get('edit')
  const typeInit = params.get('type') || 'offre'
  const sb = createBrowserSupabaseClient()

  const [session, setSession] = useState<Record<string,string>|null>(null)
  const [typeDoc, setTypeDoc] = useState(typeInit)
  const [structure, setStructure] = useState('DOUKE')
  const [numero, setNumero] = useState('')
  const [clientNom, setClientNom] = useState('')
  const [clientContact, setClientContact] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientAdresse, setClientAdresse] = useState('')
  const [objet, setObjet] = useState('')
  const [montant, setMontant] = useState(0)
  const [duree, setDuree] = useState('')
  const [dateDebut, setDateDebut] = useState('')
  const [dateFin, setDateFin] = useState('')
  const [validite, setValidite] = useState('2 mois')
  const [description, setDescription] = useState('')
  const [conditions, setConditions] = useState('')
  const [clauses, setClauses] = useState('')
  const [modalitesPaiement, setModalitesPaiement] = useState('')
  const [services, setServices] = useState<ServiceLigne[]>([{ libelle:'', unite:'Forfait (FCFA)', montant:0 }])
  const [etapes, setEtapes] = useState<EtapeLigne[]>([{ titre:'', date:'', livrable:'' }])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const raw = localStorage.getItem('eden_current_user')
    if (raw) { try { setSession(JSON.parse(raw)) } catch {} }
    if (editId) {
      sb.from('documents_offres_contrats').select('*').eq('id', editId).single().then(({ data }) => {
        if (!data) return
        setTypeDoc(data.type_doc); setStructure(data.structure); setNumero(data.numero||'')
        setClientNom(data.client_nom||''); setClientContact(data.client_contact||''); setClientEmail(data.client_email||'')
        setClientAdresse(data.client_adresse||''); setObjet(data.objet||''); setMontant(data.montant||0)
        setDuree(data.duree||''); setDateDebut(data.date_debut||''); setDateFin(data.date_fin||'')
        setValidite(data.validite||'2 mois'); setDescription(data.description||''); setConditions(data.conditions||'')
        setClauses(data.clauses||''); setModalitesPaiement(data.modalites_paiement||'')
        if (data.services && data.services.length > 0) setServices(data.services)
        if (data.etapes && data.etapes.length > 0) setEtapes(data.etapes)
      })
    }
  }, [editId])

  function addServiceLigne() { setServices(s => [...s, { libelle:'', unite:'Forfait (FCFA)', montant:0 }]) }
  function removeServiceLigne(i: number) { setServices(s => s.filter((_,idx) => idx !== i)) }
  function updateServiceLigne(i: number, field: keyof ServiceLigne, val: string|number) {
    setServices(s => s.map((row,idx) => idx===i ? {...row,[field]:val} : row))
  }
  function addEtape() { setEtapes(e => [...e, { titre:'', date:'', livrable:'' }]) }
  function removeEtape(i: number) { setEtapes(e => e.filter((_,idx) => idx !== i)) }
  function updateEtape(i: number, field: keyof EtapeLigne, val: string) {
    setEtapes(e => e.map((row,idx) => idx===i ? {...row,[field]:val} : row))
  }

  const montantTotal = typeDoc === 'offre' ? services.reduce((s,r) => s + (r.montant||0), 0) : montant

  async function save() {
    if (!clientNom.trim() || !objet.trim()) { alert('Client et objet sont obligatoires'); return }
    setSaving(true)
    const payload = {
      type_doc: typeDoc, structure, numero, client_nom: clientNom, client_contact: clientContact,
      client_email: clientEmail, client_adresse: clientAdresse, objet,
      montant: montantTotal, duree, date_debut: dateDebut || null, date_fin: dateFin || null,
      validite, description, conditions, clauses, modalites_paiement: modalitesPaiement,
      services: typeDoc === 'offre' ? services : [],
      etapes: typeDoc === 'calendrier' ? etapes : [],
      statut: 'brouillon',
      created_by: session?.id || null,
    }
    if (editId) {
      await sb.from('documents_offres_contrats').update(payload).eq('id', editId)
    } else {
      await sb.from('documents_offres_contrats').insert(payload)
    }
    setSaving(false)
    router.push('/offres-contrats')
  }

  const S = {
    input: { width:'100%', padding:'9px 12px', background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.1)', borderRadius:'8px', color:'#E8E8E8', fontSize:'12px', boxSizing:'border-box' as const },
    label: { fontSize:'11px', color:'#6B7A8D', marginBottom:'4px', display:'block', fontWeight:600 },
    section: { background:'#0F1923', border:'1px solid rgba(201,168,76,.12)', borderRadius:'10px', padding:'18px', marginBottom:'16px' },
    btn: (gold=false) => ({ padding:'9px 18px', borderRadius:'8px', border:`1px solid ${gold?'rgba(201,168,76,.4)':'rgba(255,255,255,.1)'}`, background:gold?'rgba(201,168,76,.1)':'rgba(255,255,255,.04)', color:gold?'#C9A84C':'#A8B4C0', fontSize:'13px', cursor:'pointer', fontWeight:gold?600:400 } as React.CSSProperties)
  }

  return (
    <div style={{ maxWidth:'800px' }}>
      <h1 style={{ fontSize:'18px', fontWeight:800, color:'#E8E8E8', marginBottom:'20px' }}>
        {editId ? 'Modifier le document' : 'Nouveau document'}
      </h1>

      <div style={S.section}>
        <div style={{ fontSize:'13px', fontWeight:700, color:'#C9A84C', marginBottom:'14px' }}>Type & Structure</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
          <div>
            <label style={S.label}>Type de document *</label>
            <select value={typeDoc} onChange={e => setTypeDoc(e.target.value)} style={S.input}>
              <option value="offre">📋 Offre de services</option>
              <option value="contrat">📝 Contrat de services</option>
              <option value="calendrier">📅 Calendrier d&apos;exécution</option>
            </select>
          </div>
          <div>
            <label style={S.label}>Structure *</label>
            <select value={structure} onChange={e => setStructure(e.target.value)} style={S.input}>
              <option value="DOUKE">Cabinet DOUKE</option>
              <option value="CONACCE">CONACCE</option>
            </select>
          </div>
        </div>
      </div>

      <div style={S.section}>
        <div style={{ fontSize:'13px', fontWeight:700, color:'#C9A84C', marginBottom:'14px' }}>Informations générales</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'12px' }}>
          <div>
            <label style={S.label}>N° du document</label>
            <input value={numero} onChange={e => setNumero(e.target.value)} placeholder="Ex: 00001/0051/2025" style={S.input} />
          </div>
          <div>
            <label style={S.label}>Client / Destinataire *</label>
            <input value={clientNom} onChange={e => setClientNom(e.target.value)} placeholder="Nom entreprise ou personne" style={S.input} />
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'12px' }}>
          <div>
            <label style={S.label}>Contact (téléphone)</label>
            <input value={clientContact} onChange={e => setClientContact(e.target.value)} placeholder="+229 ..." style={S.input} />
          </div>
          <div>
            <label style={S.label}>Email</label>
            <input value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="client@email.com" style={S.input} />
          </div>
        </div>
        {typeDoc === 'contrat' && (
          <div style={{ marginBottom:'12px' }}>
            <label style={S.label}>Adresse du client</label>
            <input value={clientAdresse} onChange={e => setClientAdresse(e.target.value)} placeholder="Adresse complète" style={S.input} />
          </div>
        )}
        <div>
          <label style={S.label}>Objet *</label>
          <input value={objet} onChange={e => setObjet(e.target.value)} placeholder="Ex: Édition et certification des états financiers 2025" style={S.input} />
        </div>
      </div>

      {typeDoc === 'offre' && (
        <div style={S.section}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'14px' }}>
            <div style={{ fontSize:'13px', fontWeight:700, color:'#C9A84C' }}>Services offerts</div>
            <button onClick={addServiceLigne} style={{ ...S.btn(), fontSize:'11px', padding:'5px 10px' }}>+ Ligne</button>
          </div>
          {services.map((row, i) => (
            <div key={i} style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr auto', gap:'8px', marginBottom:'8px', alignItems:'flex-end' }}>
              <div>
                <label style={S.label}>Description prestations</label>
                <textarea value={row.libelle} onChange={e => updateServiceLigne(i,'libelle',e.target.value)} rows={2} style={{...S.input, resize:'vertical'}} placeholder="Description du service (une ligne par point)" />
              </div>
              <div>
                <label style={S.label}>Unité</label>
                <input value={row.unite} onChange={e => updateServiceLigne(i,'unite',e.target.value)} style={S.input} placeholder="Forfait (FCFA)" />
              </div>
              <div>
                <label style={S.label}>Montant HT</label>
                <input type="number" value={row.montant} onChange={e => updateServiceLigne(i,'montant',parseFloat(e.target.value)||0)} style={S.input} />
              </div>
              <button onClick={() => removeServiceLigne(i)} style={{ ...S.btn(), padding:'9px', color:'#e74c3c' }}>🗑️</button>
            </div>
          ))}
          <div style={{ marginTop:'12px' }}>
            <label style={S.label}>Conditions de validité de l&apos;offre</label>
            <input value={validite} onChange={e => setValidite(e.target.value)} placeholder="Ex: 2 mois à compter de sa signature" style={S.input} />
          </div>
          <div style={{ marginTop:'10px', textAlign:'right', fontSize:'14px', fontWeight:700, color:'#C9A84C' }}>
            Total : {montantTotal.toLocaleString('fr-FR')} FCFA
          </div>
        </div>
      )}

      {typeDoc === 'contrat' && (
        <div style={S.section}>
          <div style={{ fontSize:'13px', fontWeight:700, color:'#C9A84C', marginBottom:'14px' }}>Détails du contrat</div>
          <div style={{ marginBottom:'12px' }}>
            <label style={S.label}>Description de la mission</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{...S.input, resize:'vertical'}} placeholder="Détail de la mission confiée au cabinet" />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'12px', marginBottom:'12px' }}>
            <div>
              <label style={S.label}>Montant honoraires (FCFA) *</label>
              <input type="number" value={montant} onChange={e => setMontant(parseFloat(e.target.value)||0)} style={S.input} />
            </div>
            <div>
              <label style={S.label}>Durée du contrat</label>
              <input value={duree} onChange={e => setDuree(e.target.value)} placeholder="Ex: 3 mois" style={S.input} />
            </div>
            <div>
              <label style={S.label}>Date de signature</label>
              <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} style={S.input} />
            </div>
          </div>
          <div style={{ marginBottom:'12px' }}>
            <label style={S.label}>Modalités de paiement</label>
            <textarea value={modalitesPaiement} onChange={e => setModalitesPaiement(e.target.value)} rows={2} style={{...S.input, resize:'vertical'}} placeholder="Ex: 100.000 au démarrage, le solde au dépôt du dossier" />
          </div>
          <div>
            <label style={S.label}>Clauses particulières (optionnel)</label>
            <textarea value={clauses} onChange={e => setClauses(e.target.value)} rows={3} style={{...S.input, resize:'vertical'}} placeholder="Clauses additionnelles spécifiques à ce contrat" />
          </div>
        </div>
      )}

      {typeDoc === 'calendrier' && (
        <div style={S.section}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'14px' }}>
            <div style={{ fontSize:'13px', fontWeight:700, color:'#C9A84C' }}>Étapes du calendrier</div>
            <button onClick={addEtape} style={{ ...S.btn(), fontSize:'11px', padding:'5px 10px' }}>+ Étape</button>
          </div>
          {etapes.map((row, i) => (
            <div key={i} style={{ display:'grid', gridTemplateColumns:'2fr 1fr 2fr auto', gap:'8px', marginBottom:'8px', alignItems:'flex-end' }}>
              <div>
                <label style={S.label}>Titre de l&apos;étape</label>
                <input value={row.titre} onChange={e => updateEtape(i,'titre',e.target.value)} style={S.input} placeholder="Ex: Collecte des informations" />
              </div>
              <div>
                <label style={S.label}>Date prévue</label>
                <input type="date" value={row.date} onChange={e => updateEtape(i,'date',e.target.value)} style={S.input} />
              </div>
              <div>
                <label style={S.label}>Livrable attendu</label>
                <input value={row.livrable} onChange={e => updateEtape(i,'livrable',e.target.value)} style={S.input} placeholder="Ex: Rapport intermédiaire" />
              </div>
              <button onClick={() => removeEtape(i)} style={{ ...S.btn(), padding:'9px', color:'#e74c3c' }}>🗑️</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display:'flex', gap:'10px' }}>
        <button onClick={save} disabled={saving} style={S.btn(true)}>{saving ? '…' : '💾 Enregistrer le brouillon'}</button>
        <a href="/offres-contrats" style={{ ...S.btn(), textDecoration:'none', display:'inline-block' }}>Annuler</a>
      </div>
    </div>
  )
}

export default function NouveauDocumentPage() {
  return (
    <Suspense fallback={<div style={{color:'#6B7A8D'}}>Chargement…</div>}>
      <NouveauDocumentInner />
    </Suspense>
  )
}
