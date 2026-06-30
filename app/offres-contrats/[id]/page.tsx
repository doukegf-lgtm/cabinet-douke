'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createBrowserSupabaseClient } from '@/app/supabaseClient'

interface ServiceLigne { libelle: string; unite: string; montant: number }
interface EtapeLigne { titre: string; date: string; livrable: string }
interface DocFull {
  id: string; type_doc: string; structure: string; numero: string
  client_nom: string; client_contact: string; client_email: string; client_adresse: string
  objet: string; montant: number; duree: string; date_debut: string; date_fin: string
  validite: string; description: string; conditions: string; clauses: string
  modalites_paiement: string; services: ServiceLigne[]; etapes: EtapeLigne[]
  statut: string; created_at: string; created_by: string; validated_by: string; validated_at: string
}

const STATUT_LABEL: Record<string,string> = { brouillon: 'Brouillon', soumis: 'En attente de validation', valide: 'Validé', rejete: 'Rejeté' }
const STATUT_COLOR: Record<string,string> = { brouillon: '#6B7A8D', soumis: '#C9A84C', valide: '#2ecc71', rejete: '#e74c3c' }

function fmt(n: number) { return (n||0).toLocaleString('fr-FR') }
function fmtDate(d: string) { return d ? new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' }) : '' }

export default function DetailDocumentPage() {
  const params = useParams()
  const id = params.id as string
  const [doc, setDoc] = useState<DocFull|null>(null)
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Record<string,string>|null>(null)
  const [comptes, setComptes] = useState<Record<string,string>>({})
  const [generating, setGenerating] = useState(false)
  const sb = createBrowserSupabaseClient()

  useEffect(() => {
    const raw = localStorage.getItem('eden_current_user')
    if (raw) { try { setSession(JSON.parse(raw)) } catch {} }
    load()
  }, [id])

  async function load() {
    setLoading(true)
    const [d, c] = await Promise.all([
      sb.from('documents_offres_contrats').select('*').eq('id', id).single(),
      sb.from('auth_accounts').select('id,name'),
    ])
    setDoc(d.data)
    const map: Record<string,string> = {}
    ;(c.data || []).forEach((u: {id:string,name:string}) => { map[u.id] = u.name })
    setComptes(map)
    setLoading(false)
  }

  async function genererPDF() {
    if (!doc) return
    setGenerating(true)
    const printWindow = window.open('', '_blank')
    if (!printWindow) { setGenerating(false); return }

    const headerImg = doc.structure === 'CONACCE'
      ? '' // placeholder CONACCE en attente du bandeau officiel
      : '/assets/header-douke.png'

    let bodyHtml = ''

    if (doc.type_doc === 'offre') {
      bodyHtml = `
        <h1 style="text-align:center;font-size:20px;font-weight:800;text-decoration:underline;margin:30px 0 20px;">OFFRE DE SERVICES</h1>
        <div style="margin-bottom:20px;font-size:13px;line-height:1.8;">
          <div><u>Date</u> : ${fmtDate(doc.created_at)}</div>
          ${doc.numero ? `<div><u>N°</u> : ${doc.numero}</div>` : ''}
          <div><u>Client</u> : ${doc.client_nom}</div>
          ${doc.client_contact ? `<div><u>Contact</u> : ${doc.client_contact}</div>` : ''}
          ${doc.client_email ? `<div style="margin-left:60px;">${doc.client_email}</div>` : ''}
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px;">
          <thead>
            <tr style="background:#f2f2f2;">
              <th style="border:1px solid #999;padding:8px;width:5%;">N°</th>
              <th style="border:1px solid #999;padding:8px;text-align:left;">Services Offerts</th>
              <th style="border:1px solid #999;padding:8px;width:15%;">Unité</th>
              <th style="border:1px solid #999;padding:8px;width:15%;">Montant HT</th>
            </tr>
          </thead>
          <tbody>
            ${doc.services.map((s, i) => `
              <tr>
                <td style="border:1px solid #999;padding:8px;text-align:center;">${i+1}</td>
                <td style="border:1px solid #999;padding:8px;white-space:pre-line;">${s.libelle}</td>
                <td style="border:1px solid #999;padding:8px;text-align:center;">${s.unite}</td>
                <td style="border:1px solid #999;padding:8px;text-align:right;">${fmt(s.montant)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div style="font-size:11px;color:#3a6ea5;margin-bottom:30px;">${doc.validite ? `Cette offre est valable pour une période de ${doc.validite}.` : ''}</div>
        <div style="text-align:right;font-size:13px;margin-top:40px;">
          <div>Irina VIEYRA HONVOU</div>
          <div>00229 95334747</div>
          <div>virina@doukegf.bj</div>
        </div>
      `
    } else if (doc.type_doc === 'contrat') {
      bodyHtml = `
        <h1 style="text-align:center;font-size:18px;font-weight:800;margin:30px 0 4px;">CONTRAT DE SERVICES</h1>
        <div style="text-align:center;font-size:12px;margin-bottom:4px;">N° ${doc.numero || '_____________'}</div>
        <div style="text-align:right;font-size:12px;margin-bottom:24px;">DATE : ${fmtDate(doc.date_debut || doc.created_at)}</div>

        <p style="font-size:13px;text-align:center;font-weight:700;margin:20px 0 10px;">PARTIES AU PRESENT ACTE :</p>
        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;">
          <tr><td style="border:1px solid #999;padding:12px;">
            <b>L\'entreprise</b> : <b>${doc.client_nom}</b><br/>
            ${doc.client_adresse ? `<b>Adresse</b> : ${doc.client_adresse}<br/>` : ''}
            ${doc.client_contact ? `<b>Tel</b> : ${doc.client_contact}<br/>` : ''}
            ${doc.client_email ? `<b>Email</b> : ${doc.client_email}<br/>` : ''}
          </td></tr>
        </table>
        <p style="font-size:12px;">Ci-après dénommé « le client »</p>
        <p style="font-size:12px;margin-bottom:20px;">Et le cabinet <b>DOUKE GROWTH AND FUNDING</b> dont le siège est situé à Gbégamey 1, Parcelle A, Maison Cosme HOUETO, Immeuble de la pharmacie LA PAIX, immatriculé au Registre de Commerce et de Crédit Mobilier sous le numéro RB/COT/20 B 26456, et au numéro IFU 3202011324552 représenté par <b>Madame Irina VIEYRA HONVOU.</b></p>
        <p style="font-size:12px;margin-bottom:16px;">Il a été convenu et arrêté ce qui suit :</p>

        <p style="font-size:13px;font-weight:700;margin-top:18px;">ARTICLE 1 : OBJET</p>
        <p style="font-size:12px;">Le présent contrat a pour objet, ${doc.objet} par le cabinet <b>DOUKE Growth and Funding</b>.</p>

        ${doc.description ? `
        <p style="font-size:13px;font-weight:700;margin-top:18px;">ARTICLE 2 : DESCRIPTION</p>
        <p style="font-size:12px;">Par le présent contrat, le Cabinet <b>DOUKE Growth and Funding</b> s\'engage à effectuer sa mission avec laquelle il s\'est identifié auprès de son client conformément à son offre de services, et aux lois et règlements en vigueur au Bénin.</p>
        <p style="font-size:12px;">Cette mission se décline comme suit :</p>
        <p style="font-size:12px;white-space:pre-line;">${doc.description}</p>
        ` : ''}

        <p style="font-size:13px;font-weight:700;margin-top:18px;">ARTICLE 3 : CONDITIONS DU CABINET</p>
        <p style="font-size:12px;">Par la présente, le cabinet s\'engage :</p>
        <ul style="font-size:12px;">
          <li>Au traitement correct et dans les règles de l\'art des informations échangées avec le client en vue de fournir dans le délai convenu et mentionnés dans ce contrat les informations qui reflètent la réalité actuelle de l\'entreprise du client, ses indicateurs de performance à moyens termes et la rentabilité de ses investissements ;</li>
          <li>Au respect strict de la confidentialité au sujet de l\'information échangée avec le client lors de la collaboration ;</li>
          <li>A la non-divulgation d\'informations pouvant causer du tort au client ;</li>
          <li>A la non-concurrence sur les activités du client ;</li>
          <li>A la collecte correcte des informations auprès du client.</li>
        </ul>

        <p style="font-size:13px;font-weight:700;margin-top:18px;">ARTICLE 4 : OBLIGATION DU CLIENT</p>
        <p style="font-size:12px;">Grace à ce contrat, le client s\'engage :</p>
        <ul style="font-size:12px;">
          <li>A fournir dans de brefs délais les informations nécessaires ;</li>
          <li>A payer les honoraires convenus avec le cabinet ;</li>
          <li>A respecter les clauses du contrat.</li>
        </ul>

        <p style="font-size:13px;font-weight:700;margin-top:18px;">ARTICLE 5 : DUREE</p>
        <p style="font-size:12px;">Le présent contrat est établi pour une durée ${doc.duree ? `de ${doc.duree}` : 'maximale de 3 mois'}, mais orienté résultat.</p>
        <p style="font-size:12px;">Mais pour un accompagnement plus efficace, un nouveau contrat d\'assistance sera proposé au client si nécessaire.</p>

        <p style="font-size:13px;font-weight:700;margin-top:18px;">ARTICLE 6 : CAS D\'ANNULATION OU D\'ABANDON DU PROCESSUS</p>
        <p style="font-size:12px;">Le client a exactement 72h après son premier paiement pour pourvoir annuler sa commande sans frais. Dans les deux semaines après son paiement, il sera redevable de 20% du montant des honoraires retenus. Passées les deux semaines, il ne sera plus possible de rembourser les paiements effectués.</p>
        <p style="font-size:12px;">Le cabinet se réserve tout droit de refuser ou d\'annuler l\'exécution de ce contrat pour des raisons propres à lui. Et devra rembourser intégralement les honoraires payés par le client. Il sera aussi tenu d\'adresser un courrier notifiant sa décision d\'abandon dans un maximum de deux semaines après le paiement effectué par le client.</p>

        <p style="font-size:13px;font-weight:700;margin-top:18px;">ARTICLE 7 : FRAIS</p>
        <p style="font-size:12px;">L\'entreprise « <b>${doc.client_nom}</b> » a accepté le montant des honoraires proposé par le Cabinet DOUKE Growth and Funding, fixé à ${fmt(doc.montant)} FCFA toutes taxes comprises${doc.modalites_paiement ? `, payables selon les modalités suivantes : ${doc.modalites_paiement}` : ''}.</p>
        <p style="font-size:12px;">Les modes de paiement autorisés sont :</p>
        <ul style="font-size:12px;">
          <li>Les virements bancaires sur le compte du cabinet ;</li>
          <li>Les paiements en espèces exclusivement au siège du cabinet ;</li>
          <li>Les paiements électroniques sur le seul numéro du cabinet dédié à cet effet.</li>
        </ul>

        <p style="font-size:13px;font-weight:700;margin-top:18px;">ARTICLE 8 : UTILISATION DES INFORMATIONS</p>
        <p style="font-size:12px;">Le cabinet s\'engage à n\'utiliser les informations reçues du client et des partenaires que pour les besoins objet de ce contrat, sous peine de poursuite par le donneur d\'ordre. Également se conserve le droit de ne partager avec le client que des informations nécessaires à la bonne exécution de ce contrat.</p>

        <p style="font-size:13px;font-weight:700;margin-top:18px;">ARTICLE 9 : LITIGES</p>
        <p style="font-size:12px;">En cas de litiges entre les deux parties, le règlement à l\'amiable est celui recommandé. Le cas échéant, le Tribunal de Commerce de la localité du cabinet sera donc la juridiction compétente en la matière.</p>

        ${doc.clauses ? `
        <p style="font-size:13px;font-weight:700;margin-top:18px;">CLAUSES PARTICULIÈRES</p>
        <p style="font-size:12px;white-space:pre-line;">${doc.clauses}</p>
        ` : ''}

        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:40px;">
          <tr><td style="border:1px solid #999;padding:16px;text-align:center;">
            Fait en deux exemplaires à Cotonou le ${fmtDate(doc.date_debut || doc.created_at)}<br/><br/>
            Signature :<br/><br/>
            <table style="width:100%;"><tr>
              <td style="width:50%;text-align:center;">Pour le client<br/><br/><br/>${doc.client_nom}</td>
              <td style="width:50%;text-align:center;">Pour le cabinet<br/><br/><br/>Irina VIEYRA HONVOU</td>
            </tr></table>
          </td></tr>
        </table>
      `
    } else if (doc.type_doc === 'calendrier') {
      bodyHtml = `
        <h1 style="text-align:center;font-size:20px;font-weight:800;text-decoration:underline;margin:30px 0 20px;">CALENDRIER D\'EXÉCUTION</h1>
        <div style="margin-bottom:20px;font-size:13px;line-height:1.8;">
          <div><u>Date</u> : ${fmtDate(doc.created_at)}</div>
          ${doc.numero ? `<div><u>N°</u> : ${doc.numero}</div>` : ''}
          <div><u>Client</u> : ${doc.client_nom}</div>
          <div><u>Objet</u> : ${doc.objet}</div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="background:#f2f2f2;">
              <th style="border:1px solid #999;padding:8px;width:5%;">N°</th>
              <th style="border:1px solid #999;padding:8px;text-align:left;">Étape</th>
              <th style="border:1px solid #999;padding:8px;width:18%;">Date prévue</th>
              <th style="border:1px solid #999;padding:8px;text-align:left;">Livrable</th>
            </tr>
          </thead>
          <tbody>
            ${doc.etapes.map((e, i) => `
              <tr>
                <td style="border:1px solid #999;padding:8px;text-align:center;">${i+1}</td>
                <td style="border:1px solid #999;padding:8px;">${e.titre}</td>
                <td style="border:1px solid #999;padding:8px;text-align:center;">${fmtDate(e.date)}</td>
                <td style="border:1px solid #999;padding:8px;">${e.livrable}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div style="text-align:right;font-size:13px;margin-top:40px;">
          <div>Irina VIEYRA HONVOU</div>
          <div>00229 95334747</div>
          <div>virina@doukegf.bj</div>
        </div>
      `
    }

    const fullHtml = `
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"/>
      <title>${doc.type_doc}-${doc.client_nom}</title>
      <style>
        body { font-family: Arial, sans-serif; color:#1a1a1a; max-width:800px; margin:0 auto; padding:0 30px 40px; }
        @media print { body { padding:0 20px; } }
        .footer-line { text-align:center; font-size:10px; color:#3a6ea5; border-top:1px solid #999; padding-top:8px; margin-top:50px; }
      </style>
      </head><body>
        ${headerImg ? `<img src="${headerImg}" style="width:100%;display:block;margin-bottom:10px;" />` : `<div style="text-align:center;font-size:16px;font-weight:800;padding:20px 0;border-bottom:2px solid #333;margin-bottom:20px;">CONACCE</div>`}
        ${bodyHtml}
        <div class="footer-line">WE BUILD THE GROWTH OF YOUR BUSINESS</div>
      </body></html>
    `
    printWindow.document.write(fullHtml)
    printWindow.document.close()
    setTimeout(() => {
      printWindow.print()
      setGenerating(false)
    }, 500)
  }

  if (loading) return <div style={{ color:'#6B7A8D' }}>Chargement…</div>
  if (!doc) return <div style={{ color:'#e74c3c' }}>Document introuvable</div>

  const isAdmin = session?.role === 'Super-Admin'
  const canDownload = doc.statut === 'valide'

  const S = {
    btn: (gold=false) => ({ padding:'9px 18px', borderRadius:'8px', border:`1px solid ${gold?'rgba(201,168,76,.4)':'rgba(255,255,255,.1)'}`, background:gold?'rgba(201,168,76,.1)':'rgba(255,255,255,.04)', color:gold?'#C9A84C':'#A8B4C0', fontSize:'13px', cursor:'pointer', fontWeight:gold?600:400 } as React.CSSProperties)
  }

  return (
    <div style={{ maxWidth:'800px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
        <div>
          <h1 style={{ fontSize:'18px', fontWeight:800, color:'#E8E8E8', margin:0 }}>{doc.client_nom} — {doc.objet}</h1>
          <div style={{ display:'flex', gap:'8px', alignItems:'center', marginTop:'6px' }}>
            <span style={{ fontSize:'10px', padding:'2px 8px', borderRadius:'10px', background:`${STATUT_COLOR[doc.statut]}22`, color:STATUT_COLOR[doc.statut], border:`1px solid ${STATUT_COLOR[doc.statut]}44` }}>{STATUT_LABEL[doc.statut]}</span>
            <span style={{ fontSize:'11px', color:'#6B7A8D' }}>{doc.structure} · créé par {comptes[doc.created_by] || '?'}</span>
            {doc.validated_by && <span style={{ fontSize:'11px', color:'#2ecc71' }}>· validé par {comptes[doc.validated_by]}</span>}
          </div>
        </div>
        <div style={{ display:'flex', gap:'8px' }}>
          <a href="/offres-contrats" style={{ ...S.btn(), textDecoration:'none' }}>← Liste</a>
          {canDownload ? (
            <button onClick={genererPDF} disabled={generating} style={S.btn(true)}>{generating ? '…' : '📥 Télécharger PDF'}</button>
          ) : (
            <button onClick={genererPDF} disabled={generating} style={{...S.btn(), opacity:0.6}} title="Aperçu uniquement — validation Admin requise pour télécharger">{generating ? '…' : '👁️ Aperçu (non téléchargeable)'}</button>
          )}
        </div>
      </div>

      {!canDownload && (
        <div style={{ background:'rgba(201,168,76,.08)', border:'1px solid rgba(201,168,76,.25)', borderRadius:'10px', padding:'12px 16px', marginBottom:'16px', fontSize:'12px', color:'#C9A84C' }}>
          ⚠️ Ce document doit être validé par un administrateur avant de pouvoir être téléchargé en PDF définitif.
        </div>
      )}

      <div style={{ background:'#fff', borderRadius:'10px', padding:'30px', color:'#1a1a1a', fontSize:'13px' }}>
        <img src="/assets/header-douke.png" style={{ width:'100%', marginBottom:'16px' }} alt="DOUKE" />
        <div style={{ textAlign:'center', fontWeight:800, fontSize:'16px', textDecoration:'underline', margin:'20px 0' }}>
          {doc.type_doc === 'offre' ? 'OFFRE DE SERVICES' : doc.type_doc === 'contrat' ? 'CONTRAT DE SERVICES' : 'CALENDRIER D\'EXÉCUTION'}
        </div>
        <div style={{ marginBottom:'16px', lineHeight:1.8 }}>
          <div><u>Date</u> : {fmtDate(doc.created_at)}</div>
          {doc.numero && <div><u>N°</u> : {doc.numero}</div>}
          <div><u>Client</u> : {doc.client_nom}</div>
          {doc.client_contact && <div><u>Contact</u> : {doc.client_contact}</div>}
        </div>
        <div style={{ color:'#666', fontStyle:'italic', fontSize:'12px' }}>Aperçu simplifié — le document complet sera généré au téléchargement PDF avec mise en forme professionnelle.</div>
      </div>
    </div>
  )
}
