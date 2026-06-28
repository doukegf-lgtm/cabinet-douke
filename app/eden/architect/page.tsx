'use client'
import { useState, useEffect } from 'react'
import { createBrowserSupabaseClient } from '@/app/supabaseClient'
import Questionnaire, { type ReponsesQuestionnaire } from './questionnaire/Questionnaire'

// Fallback statique (si Supabase indisponible)
const MODELES_FALLBACK_COMMERCIAL = [
  { id: 'commerce', label: 'Commerce général & Distribution', secteur: 'Commerce', sections: 'Analyse concurrentielle, gestion stocks, stratégie multicanal' },
  { id: 'agro', label: 'Agrobusiness & Transformation agricole', secteur: 'Agriculture', sections: 'Plan de production, chaîne de valeur, certifications qualité' },
  { id: 'energie', label: 'Énergie solaire & Efficacité énergétique', secteur: 'Énergie', sections: 'Ressource solaire, modèle revenus, réglementation CRSE' },
]
const MODELES_FALLBACK_SOCIAL = [
  { id: 'microfinance', label: 'Institution de Microfinance (IMF)', secteur: 'Finance solidaire', sections: 'Politique crédit, indicateurs performance sociale, conformité PARMEC/BCEAO' },
  { id: 'eau', label: 'Accès à l\'eau potable & Assainissement', secteur: 'WASH', sections: 'Modèle CPE, étude impact environnemental, conformité normes JMP/OMS' },
]

const ZONES = ['Bénin', 'Togo', 'Côte d\'Ivoire', 'Sénégal', 'UEMOA', 'OHADA']
const JURIDIQUES = ['SARL', 'SA', 'SAS', 'GIE', 'Coopérative', 'Association', 'ONG', 'Fondation']
const FINANCEMENTS = ['Crédit bancaire', 'Capital-investissement', 'Subvention', 'Microcrédit', 'Obligation', 'PPP', 'Garantie + Crédit']
const GARANTIES_LIST = ['Hypothèque immobilière', 'Nantissement matériel', 'Caution personnelle', 'Fonds de garantie (GARI)', 'Warrant agricole', 'Assurance-crédit']
const PARTENAIRES = ['BOAD', 'AFD / Proparco', 'Oikocredit', 'Cofina', 'Ecobank', 'BNDE Bénin', 'GARI Fund', 'UNCDF', 'Advans', 'BOA', 'SIB', 'Autre']

type Step = 'modele' | 'formulaire' | 'questionnaire' | 'plan' | 'resultat'
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
  const [modelesCommercial, setModelesCommercial] = useState<{id:string,label:string,secteur:string,sections:string}[]>(MODELES_FALLBACK_COMMERCIAL)
  const [modelesSocial, setModelesSocial] = useState<{id:string,label:string,secteur:string,sections:string}[]>(MODELES_FALLBACK_SOCIAL)

  useEffect(() => {
    const sb = createBrowserSupabaseClient()
    sb.from('templates_bp').select('modele_id, type, label, secteur, sections_conditionnelles').order('type').then(({ data }) => {
      if (!data || data.length === 0) return
      const comm = data.filter(r => r.type === 'commercial').map(r => ({ id: r.modele_id, label: r.label, secteur: r.secteur, sections: r.sections_conditionnelles || '' }))
      const soc = data.filter(r => r.type === 'social').map(r => ({ id: r.modele_id, label: r.label, secteur: r.secteur, sections: r.sections_conditionnelles || '' }))
      if (comm.length > 0) setModelesCommercial(comm)
      if (soc.length > 0) setModelesSocial(soc)
    })
  }, [])
  const [typeModele, setTypeModele] = useState<'commercial' | 'social'>('commercial')
  const [modeleChoisi, setModeleChoisi] = useState<{ id: string; label: string; secteur: string } | null>(null)
  const [form, setForm] = useState<Formulaire>({ nom_projet:'', promoteur:'', zone:'Bénin', juridique:'SARL', capital:'', montant:'', type_financement:'Crédit bancaire', objet:'', emplois:'', garanties:[], partenaire:'' })
  const [planType, setPlanType] = useState<PlanType>('3ans')
  const [reponses, setReponses] = useState<ReponsesQuestionnaire | null>(null)
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
    // Lire les données financières du moteur (sync auto depuis sessionStorage)
    let fin: Record<string, number> = {};
    try {
      const raw = typeof window !== 'undefined' ? sessionStorage.getItem('architect_financial_data') : null;
      if (raw) fin = JSON.parse(raw);
    } catch { /* ignore */ }

    const fmt = (n: number) => n > 0 ? Math.round(n).toLocaleString('fr-FR') : 'à compléter';

    return texte
      .replace(/\{\{nom_projet\}\}/g, f.nom_projet)
      .replace(/\{\{promoteur\}\}/g, f.promoteur || 'Le promoteur')
      .replace(/\{\{zone\}\}/g, f.zone)
      .replace(/\{\{juridique\}\}/g, f.juridique)
      .replace(/\{\{capital\}\}/g, f.capital ? Number(f.capital).toLocaleString('fr-FR') : '—')
      .replace(/\{\{montant\}\}/g, f.montant ? Number(f.montant).toLocaleString('fr-FR') : '—')
      .replace(/\{\{type_financement\}\}/g, f.type_financement)
      .replace(/\{\{objet\}\}/g, f.objet || 'Voir détails du projet')
      .replace(/\{\{emplois\}\}/g, fin.nb_emplois ? String(fin.nb_emplois) : (f.emplois || '—'))
      .replace(/\{\{garanties\}\}/g, f.garanties.join(', ') || '—')
      .replace(/\{\{partenaire\}\}/g, f.partenaire || '—')
      .replace(/\{\{modele\}\}/g, m?.label || '')
      .replace(/\{\{secteur\}\}/g, m?.secteur || '')
      // Données financières du moteur
      .replace(/\{\{ca_an1\}\}/g, fmt(fin.ca_an1 || 0))
      .replace(/\{\{ca_an2\}\}/g, fmt(fin.ca_an2 || 0))
      .replace(/\{\{ca_an3\}\}/g, fmt(fin.ca_an3 || 0))
      .replace(/\{\{taux_marge_brute\}\}/g, fin.taux_marge_brute ? fin.taux_marge_brute + '%' : 'à compléter')
      .replace(/\{\{charges_fixes_annuelles\}\}/g, fmt(fin.charges_fixes_annuelles || 0))
      .replace(/\{\{amortissements_annuels\}\}/g, fmt(fin.amortissements_annuels || 0))
      .replace(/\{\{total_immobilisations\}\}/g, fmt(fin.total_immobilisations || 0))
      .replace(/\{\{bfr\}\}/g, fmt(fin.bfr || 0))
      .replace(/\{\{total_projet\}\}/g, fmt(fin.total_projet || 0))
      .replace(/\{\{apport_personnel\}\}/g, fmt(fin.apport_personnel || 0))
      .replace(/\{\{emprunt_total\}\}/g, fmt(fin.emprunt_total || 0))
      .replace(/\{\{pct_apport\}\}/g, fin.pct_apport ? fin.pct_apport + '%' : 'à compléter')
      // Réponses questionnaire
      .replace(/\{\{probleme_adresse\}\}/g, reponses?.probleme_adresse || 'à compléter')
      .replace(/\{\{valeur_ajoutee\}\}/g, reponses?.valeur_ajoutee || 'à compléter')
      .replace(/\{\{parcours_professionnel\}\}/g, reponses?.parcours_professionnel || 'à compléter')
      .replace(/\{\{experience_similaire\}\}/g, reponses?.experience_similaire || 'à compléter')
      .replace(/\{\{pourquoi_vous\}\}/g, reponses?.pourquoi_vous || 'à compléter')
      .replace(/\{\{profil_clients\}\}/g, reponses?.profil_clients || 'à compléter')
      .replace(/\{\{taille_marche\}\}/g, reponses?.taille_marche || 'à compléter')
      .replace(/\{\{concurrents\}\}/g, reponses?.concurrents || 'à compléter')
      .replace(/\{\{politique_prix\}\}/g, reponses?.politique_prix || 'à compléter')
      .replace(/\{\{test_marche\}\}/g, reponses?.test_marche || 'à compléter')
      .replace(/\{\{acquisition_premiers_clients\}\}/g, reponses?.acquisition_premiers_clients || 'à compléter')
      .replace(/\{\{processus_production\}\}/g, reponses?.processus_production || 'à compléter')
      .replace(/\{\{equipements_cles\}\}/g, reponses?.equipements_cles || 'à compléter')
      .replace(/\{\{fournisseurs_principaux\}\}/g, reponses?.fournisseurs_principaux || 'à compléter')
      .replace(/\{\{capacite_production\}\}/g, reponses?.capacite_production || 'à compléter')
      .replace(/\{\{goulots_etranglement\}\}/g, reponses?.goulots_etranglement || 'à compléter')
      .replace(/\{\{accords_signes\}\}/g, reponses?.accords_signes || 'à compléter')
      .replace(/\{\{equipe_cles\}\}/g, reponses?.equipe_cles || 'à compléter')
      .replace(/\{\{postes_prioritaires\}\}/g, reponses?.postes_prioritaires || 'à compléter')
      .replace(/\{\{fidelisation_personnel\}\}/g, reponses?.fidelisation_personnel || 'à compléter')
      .replace(/\{\{risques_principaux\}\}/g, reponses?.risques_principaux || 'à compléter')
      .replace(/\{\{mitigations\}\}/g, reponses?.mitigations || 'à compléter')
      .replace(/\{\{plan_b_financier\}\}/g, reponses?.plan_b_financier || 'à compléter')
      .replace(/\{\{risques_reglementaires\}\}/g, reponses?.risques_reglementaires || 'à compléter')
      // Réponses sectorielles
      .replace(/\{\{superficie_statut\}\}/g, reponses?.sectoriel?.superficie_statut || 'à compléter')
      .replace(/\{\{cultures_rendements\}\}/g, reponses?.sectoriel?.cultures_rendements || 'à compléter')
      .replace(/\{\{contre_saison\}\}/g, reponses?.sectoriel?.contre_saison || 'à compléter')
      .replace(/\{\{debouches\}\}/g, reponses?.sectoriel?.debouches || 'à compléter')
      .replace(/\{\{certifications\}\}/g, reponses?.sectoriel?.certifications || 'à compléter')
      .replace(/\{\{cout_production\}\}/g, reponses?.sectoriel?.cout_production || 'à compléter')
      .replace(/\{\{pertes_recolte\}\}/g, reponses?.sectoriel?.pertes_recolte || 'à compléter')
      .replace(/\{\{precommandes\}\}/g, reponses?.sectoriel?.precommandes || 'à compléter')
      .replace(/\{\{puissance_systemes\}\}/g, reponses?.sectoriel?.puissance_systemes || 'à compléter')
      .replace(/\{\{modele_commercial\}\}/g, reponses?.sectoriel?.modele_commercial || 'à compléter')
      .replace(/\{\{partenaires_telecom\}\}/g, reponses?.sectoriel?.partenaires_telecom || 'à compléter')
      .replace(/\{\{certifications_equip\}\}/g, reponses?.sectoriel?.certifications_equip || 'à compléter')
      .replace(/\{\{agrement\}\}/g, reponses?.sectoriel?.agrement || 'à compléter')
      .replace(/\{\{cout_installation\}\}/g, reponses?.sectoriel?.cout_installation || 'à compléter')
      .replace(/\{\{gestion_impayes\}\}/g, reponses?.sectoriel?.gestion_impayes || 'à compléter')
      .replace(/\{\{cartographie_zones\}\}/g, reponses?.sectoriel?.cartographie_zones || 'à compléter')
      .replace(/\{\{references_marges\}\}/g, reponses?.sectoriel?.references_marges || 'à compléter')
      .replace(/\{\{rotation_stock\}\}/g, reponses?.sectoriel?.rotation_stock || 'à compléter')
      .replace(/\{\{conditions_achat\}\}/g, reponses?.sectoriel?.conditions_achat || 'à compléter')
      .replace(/\{\{logiciel_gestion\}\}/g, reponses?.sectoriel?.logiciel_gestion || 'à compléter')
      .replace(/\{\{gestion_ruptures\}\}/g, reponses?.sectoriel?.gestion_ruptures || 'à compléter')
      .replace(/\{\{bfr_reel\}\}/g, reponses?.sectoriel?.bfr_reel || 'à compléter')
      .replace(/\{\{echecs_similaires\}\}/g, reponses?.sectoriel?.echecs_similaires || 'à compléter')
      .replace(/\{\{differenciation\}\}/g, reponses?.sectoriel?.differenciation || 'à compléter')
      .replace(/\{\{methodologie_credit\}\}/g, reponses?.sectoriel?.methodologie_credit || 'à compléter')
      .replace(/\{\{par30_cible\}\}/g, reponses?.sectoriel?.par30_cible || 'à compléter')
      .replace(/\{\{agrement_bceao\}\}/g, reponses?.sectoriel?.agrement_bceao || 'à compléter')
      .replace(/\{\{teg_conformite\}\}/g, reponses?.sectoriel?.teg_conformite || 'à compléter')
      .replace(/\{\{logiciel_portefeuille\}\}/g, reponses?.sectoriel?.logiciel_portefeuille || 'à compléter')
      .replace(/\{\{viabilite_osr\}\}/g, reponses?.sectoriel?.viabilite_osr || 'à compléter')
      .replace(/\{\{prevention_fraude\}\}/g, reponses?.sectoriel?.prevention_fraude || 'à compléter')
      .replace(/\{\{saturation_marche\}\}/g, reponses?.sectoriel?.saturation_marche || 'à compléter')
      .replace(/\{\{ciblage_vulnerables\}\}/g, reponses?.sectoriel?.ciblage_vulnerables || 'à compléter')
      .replace(/\{\{activites_agr\}\}/g, reponses?.sectoriel?.activites_agr || 'à compléter')
      .replace(/\{\{partenariat_imf\}\}/g, reponses?.sectoriel?.partenariat_imf || 'à compléter')
      .replace(/\{\{mesure_autonomisation\}\}/g, reponses?.sectoriel?.mesure_autonomisation || 'à compléter')
      .replace(/\{\{protection_vbg\}\}/g, reponses?.sectoriel?.protection_vbg || 'à compléter')
      .replace(/\{\{perennite_groupements\}\}/g, reponses?.sectoriel?.perennite_groupements || 'à compléter')
      .replace(/\{\{implication_conjoints\}\}/g, reponses?.sectoriel?.implication_conjoints || 'à compléter')
      .replace(/\{\{baseline_donnees\}\}/g, reponses?.sectoriel?.baseline_donnees || 'à compléter')
      .replace(/\{\{nb_asc_villages\}\}/g, reponses?.sectoriel?.nb_asc_villages || 'à compléter')
      .replace(/\{\{curriculum_formation\}\}/g, reponses?.sectoriel?.curriculum_formation || 'à compléter')
      .replace(/\{\{chaine_froid\}\}/g, reponses?.sectoriel?.chaine_froid || 'à compléter')
      .replace(/\{\{protocole_reference\}\}/g, reponses?.sectoriel?.protocole_reference || 'à compléter')
      .replace(/\{\{convention_sante\}\}/g, reponses?.sectoriel?.convention_sante || 'à compléter')
      .replace(/\{\{indicateurs_baseline\}\}/g, reponses?.sectoriel?.indicateurs_baseline || 'à compléter')
      .replace(/\{\{retention_asc\}\}/g, reponses?.sectoriel?.retention_asc || 'à compléter')
      .replace(/\{\{integration_snigs\}\}/g, reponses?.sectoriel?.integration_snigs || 'à compléter')
      .replace(/\{\{filieres_base\}\}/g, reponses?.sectoriel?.filieres_base || 'à compléter')
      .replace(/\{\{entreprises_signees\}\}/g, reponses?.sectoriel?.entreprises_signees || 'à compléter')
      .replace(/\{\{referentiel_cqp\}\}/g, reponses?.sectoriel?.referentiel_cqp || 'à compléter')
      .replace(/\{\{suivi_diplomes\}\}/g, reponses?.sectoriel?.suivi_diplomes || 'à compléter')
      .replace(/\{\{taux_insertion_cible\}\}/g, reponses?.sectoriel?.taux_insertion_cible || 'à compléter')
      .replace(/\{\{pedagogie_non_lecteurs\}\}/g, reponses?.sectoriel?.pedagogie_non_lecteurs || 'à compléter')
      .replace(/\{\{sans_emploi_salarie\}\}/g, reponses?.sectoriel?.sans_emploi_salarie || 'à compléter')
      .replace(/\{\{partenariats_3ans\}\}/g, reponses?.sectoriel?.partenariats_3ans || 'à compléter')
      .replace(/\{\{nb_forages\}\}/g, reponses?.sectoriel?.nb_forages || 'à compléter')
      .replace(/\{\{etude_hydrogeologique\}\}/g, reponses?.sectoriel?.etude_hydrogeologique || 'à compléter')
      .replace(/\{\{modele_pompe\}\}/g, reponses?.sectoriel?.modele_pompe || 'à compléter')
      .replace(/\{\{constitution_cpe\}\}/g, reponses?.sectoriel?.constitution_cpe || 'à compléter')
      .replace(/\{\{tarification_communautaire\}\}/g, reponses?.sectoriel?.tarification_communautaire || 'à compléter')
      .replace(/\{\{gestion_boues\}\}/g, reponses?.sectoriel?.gestion_boues || 'à compléter')
      .replace(/\{\{maintenance_5ans\}\}/g, reponses?.sectoriel?.maintenance_5ans || 'à compléter')
      .replace(/\{\{mesure_maladies\}\}/g, reponses?.sectoriel?.mesure_maladies || 'à compléter')
      .replace(/\{\{types_travaux\}\}/g, reponses?.sectoriel?.types_travaux || 'à compléter')
      .replace(/\{\{statut_agrement\}\}/g, reponses?.sectoriel?.statut_agrement || 'à compléter')
      .replace(/\{\{capacite_chantiers\}\}/g, reponses?.sectoriel?.capacite_chantiers || 'à compléter')
      .replace(/\{\{equipements_materiel\}\}/g, reponses?.sectoriel?.equipements_materiel || 'à compléter')
      .replace(/\{\{sourcing_materiaux\}\}/g, reponses?.sectoriel?.sourcing_materiaux || 'à compléter')
      .replace(/\{\{gestion_sous_traitance\}\}/g, reponses?.sectoriel?.gestion_sous_traitance || 'à compléter')
      .replace(/\{\{gestion_retenues\}\}/g, reponses?.sectoriel?.gestion_retenues || 'à compléter')
      .replace(/\{\{sinistres_assurances\}\}/g, reponses?.sectoriel?.sinistres_assurances || 'à compléter')
      .replace(/\{\{plateau_technique\}\}/g, reponses?.sectoriel?.plateau_technique || 'à compléter')
      .replace(/\{\{statut_autorisation\}\}/g, reponses?.sectoriel?.statut_autorisation || 'à compléter')
      .replace(/\{\{personnel_medical\}\}/g, reponses?.sectoriel?.personnel_medical || 'à compléter')
      .replace(/\{\{modele_tarification\}\}/g, reponses?.sectoriel?.modele_tarification || 'à compléter')
      .replace(/\{\{gestion_medicaments\}\}/g, reponses?.sectoriel?.gestion_medicaments || 'à compléter')
      .replace(/\{\{taux_occupation\}\}/g, reponses?.sectoriel?.taux_occupation || 'à compléter')
      .replace(/\{\{gestion_impayes_sante\}\}/g, reponses?.sectoriel?.gestion_impayes_sante || 'à compléter')
      .replace(/\{\{normes_qualite\}\}/g, reponses?.sectoriel?.normes_qualite || 'à compléter')
      .replace(/\{\{service_core\}\}/g, reponses?.sectoriel?.service_core || 'à compléter')
      .replace(/\{\{agrement_regulatoire\}\}/g, reponses?.sectoriel?.agrement_regulatoire || 'à compléter')
      .replace(/\{\{stack_technique\}\}/g, reponses?.sectoriel?.stack_technique || 'à compléter')
      .replace(/\{\{modele_revenus\}\}/g, reponses?.sectoriel?.modele_revenus || 'à compléter')
      .replace(/\{\{acquisition_utilisateurs\}\}/g, reponses?.sectoriel?.acquisition_utilisateurs || 'à compléter')
      .replace(/\{\{securite_fraude\}\}/g, reponses?.sectoriel?.securite_fraude || 'à compléter')
      .replace(/\{\{interoperabilite\}\}/g, reponses?.sectoriel?.interoperabilite || 'à compléter')
      .replace(/\{\{scalabilite\}\}/g, reponses?.sectoriel?.scalabilite || 'à compléter')
      .replace(/\{\{type_operations\}\}/g, reponses?.sectoriel?.type_operations || 'à compléter')
      .replace(/\{\{foncier_disponible\}\}/g, reponses?.sectoriel?.foncier_disponible || 'à compléter')
      .replace(/\{\{montage_financier\}\}/g, reponses?.sectoriel?.montage_financier || 'à compléter')
      .replace(/\{\{commercialisation\}\}/g, reponses?.sectoriel?.commercialisation || 'à compléter')
      .replace(/\{\{agrement_promoteur\}\}/g, reponses?.sectoriel?.agrement_promoteur || 'à compléter')
      .replace(/\{\{delais_livraison\}\}/g, reponses?.sectoriel?.delais_livraison || 'à compléter')
      .replace(/\{\{risque_invendu\}\}/g, reponses?.sectoriel?.risque_invendu || 'à compléter')
      .replace(/\{\{conformite_urbanisme\}\}/g, reponses?.sectoriel?.conformite_urbanisme || 'à compléter')
      .replace(/\{\{type_service\}\}/g, reponses?.sectoriel?.type_service || 'à compléter')
      .replace(/\{\{flotte_disponible\}\}/g, reponses?.sectoriel?.flotte_disponible || 'à compléter')
      .replace(/\{\{modele_exploitation\}\}/g, reponses?.sectoriel?.modele_exploitation || 'à compléter')
      .replace(/\{\{clients_contrats\}\}/g, reponses?.sectoriel?.clients_contrats || 'à compléter')
      .replace(/\{\{conformite_reglementaire\}\}/g, reponses?.sectoriel?.conformite_reglementaire || 'à compléter')
      .replace(/\{\{gestion_carburant\}\}/g, reponses?.sectoriel?.gestion_carburant || 'à compléter')
      .replace(/\{\{maintenance_flotte\}\}/g, reponses?.sectoriel?.maintenance_flotte || 'à compléter')
      .replace(/\{\{tracking_securite\}\}/g, reponses?.sectoriel?.tracking_securite || 'à compléter')
      .replace(/\{\{concept_offre\}\}/g, reponses?.sectoriel?.concept_offre || 'à compléter')
      .replace(/\{\{capacite_couverts\}\}/g, reponses?.sectoriel?.capacite_couverts || 'à compléter')
      .replace(/\{\{ticket_moyen\}\}/g, reponses?.sectoriel?.ticket_moyen || 'à compléter')
      .replace(/\{\{approvisionnement\}\}/g, reponses?.sectoriel?.approvisionnement || 'à compléter')
      .replace(/\{\{normes_hygiene\}\}/g, reponses?.sectoriel?.normes_hygiene || 'à compléter')
      .replace(/\{\{gestion_pic\}\}/g, reponses?.sectoriel?.gestion_pic || 'à compléter')
      .replace(/\{\{cout_matiere\}\}/g, reponses?.sectoriel?.cout_matiere || 'à compléter')
      .replace(/\{\{fidelisation_clientele\}\}/g, reponses?.sectoriel?.fidelisation_clientele || 'à compléter')
      .replace(/\{\{service_produit\}\}/g, reponses?.sectoriel?.service_produit || 'à compléter')
      .replace(/\{\{stack_competences\}\}/g, reponses?.sectoriel?.stack_competences || 'à compléter')
      .replace(/\{\{modele_contractuel\}\}/g, reponses?.sectoriel?.modele_contractuel || 'à compléter')
      .replace(/\{\{pipeline_commercial\}\}/g, reponses?.sectoriel?.pipeline_commercial || 'à compléter')
      .replace(/\{\{propriete_intellectuelle\}\}/g, reponses?.sectoriel?.propriete_intellectuelle || 'à compléter')
      .replace(/\{\{dependance_cles\}\}/g, reponses?.sectoriel?.dependance_cles || 'à compléter')
      .replace(/\{\{recouvrement_digital\}\}/g, reponses?.sectoriel?.recouvrement_digital || 'à compléter')
      .replace(/\{\{scalabilite_produit\}\}/g, reponses?.sectoriel?.scalabilite_produit || 'à compléter')
      .replace(/\{\{produits_fabriques\}\}/g, reponses?.sectoriel?.produits_fabriques || 'à compléter')
      .replace(/\{\{capacite_production_indus\}\}/g, reponses?.sectoriel?.capacite_production_indus || 'à compléter')
      .replace(/\{\{equipements_indus\}\}/g, reponses?.sectoriel?.equipements_indus || 'à compléter')
      .replace(/\{\{matieres_premieres\}\}/g, reponses?.sectoriel?.matieres_premieres || 'à compléter')
      .replace(/\{\{normes_qualite_indus\}\}/g, reponses?.sectoriel?.normes_qualite_indus || 'à compléter')
      .replace(/\{\{energie_eau\}\}/g, reponses?.sectoriel?.energie_eau || 'à compléter')
      .replace(/\{\{gestion_dechets_indus\}\}/g, reponses?.sectoriel?.gestion_dechets_indus || 'à compléter')
      .replace(/\{\{competitivite_import\}\}/g, reponses?.sectoriel?.competitivite_import || 'à compléter')
      .replace(/\{\{format_support\}\}/g, reponses?.sectoriel?.format_support || 'à compléter')
      .replace(/\{\{audience_cible\}\}/g, reponses?.sectoriel?.audience_cible || 'à compléter')
      .replace(/\{\{modele_revenus_media\}\}/g, reponses?.sectoriel?.modele_revenus_media || 'à compléter')
      .replace(/\{\{agrement_csac\}\}/g, reponses?.sectoriel?.agrement_csac || 'à compléter')
      .replace(/\{\{production_contenu\}\}/g, reponses?.sectoriel?.production_contenu || 'à compléter')
      .replace(/\{\{monetisation_digitale\}\}/g, reponses?.sectoriel?.monetisation_digitale || 'à compléter')
      .replace(/\{\{independance_editoriale\}\}/g, reponses?.sectoriel?.independance_editoriale || 'à compléter')
      .replace(/\{\{droits_contenus\}\}/g, reponses?.sectoriel?.droits_contenus || 'à compléter')
      .replace(/\{\{service_env\}\}/g, reponses?.sectoriel?.service_env || 'à compléter')
      .replace(/\{\{zone_intervention\}\}/g, reponses?.sectoriel?.zone_intervention || 'à compléter')
      .replace(/\{\{modele_revenus_env\}\}/g, reponses?.sectoriel?.modele_revenus_env || 'à compléter')
      .replace(/\{\{agrement_env\}\}/g, reponses?.sectoriel?.agrement_env || 'à compléter')
      .replace(/\{\{collecte_tri\}\}/g, reponses?.sectoriel?.collecte_tri || 'à compléter')
      .replace(/\{\{partenariats_industriels\}\}/g, reponses?.sectoriel?.partenariats_industriels || 'à compléter')
      .replace(/\{\{changement_comportement\}\}/g, reponses?.sectoriel?.changement_comportement || 'à compléter')
      .replace(/\{\{viabilite_sans_subvention\}\}/g, reponses?.sectoriel?.viabilite_sans_subvention || 'à compléter')
      .replace(/\{\{niveaux_filieres\}\}/g, reponses?.sectoriel?.niveaux_filieres || 'à compléter')
      .replace(/\{\{agrement_mena\}\}/g, reponses?.sectoriel?.agrement_mena || 'à compléter')
      .replace(/\{\{corps_enseignant\}\}/g, reponses?.sectoriel?.corps_enseignant || 'à compléter')
      .replace(/\{\{frais_scolarite\}\}/g, reponses?.sectoriel?.frais_scolarite || 'à compléter')
      .replace(/\{\{taux_remplissage\}\}/g, reponses?.sectoriel?.taux_remplissage || 'à compléter')
      .replace(/\{\{resultats_examens\}\}/g, reponses?.sectoriel?.resultats_examens || 'à compléter')
      .replace(/\{\{retention_eleves\}\}/g, reponses?.sectoriel?.retention_eleves || 'à compléter')
      .replace(/\{\{insertion_diplomes\}\}/g, reponses?.sectoriel?.insertion_diplomes || 'à compléter')
      .replace(/\{\{especes_effectifs\}\}/g, reponses?.sectoriel?.especes_effectifs || 'à compléter')
      .replace(/\{\{systeme_elevage\}\}/g, reponses?.sectoriel?.systeme_elevage || 'à compléter')
      .replace(/\{\{alimentation_sante\}\}/g, reponses?.sectoriel?.alimentation_sante || 'à compléter')
      .replace(/\{\{debouches_elevage\}\}/g, reponses?.sectoriel?.debouches_elevage || 'à compléter')
      .replace(/\{\{gestion_mortalite\}\}/g, reponses?.sectoriel?.gestion_mortalite || 'à compléter')
      .replace(/\{\{cout_tete\}\}/g, reponses?.sectoriel?.cout_tete || 'à compléter')
      .replace(/\{\{gestion_cycle\}\}/g, reponses?.sectoriel?.gestion_cycle || 'à compléter')
      .replace(/\{\{risques_sanitaires\}\}/g, reponses?.sectoriel?.risques_sanitaires || 'à compléter')
      .replace(/\{\{gamme_produits\}\}/g, reponses?.sectoriel?.gamme_produits || 'à compléter')
      .replace(/\{\{agrement_pharmacie\}\}/g, reponses?.sectoriel?.agrement_pharmacie || 'à compléter')
      .replace(/\{\{approvisionnement_pharma\}\}/g, reponses?.sectoriel?.approvisionnement_pharma || 'à compléter')
      .replace(/\{\{gestion_stocks_pharma\}\}/g, reponses?.sectoriel?.gestion_stocks_pharma || 'à compléter')
      .replace(/\{\{clientele_pharma\}\}/g, reponses?.sectoriel?.clientele_pharma || 'à compléter')
      .replace(/\{\{marge_pharma\}\}/g, reponses?.sectoriel?.marge_pharma || 'à compléter')
      .replace(/\{\{chaine_froid_pharma\}\}/g, reponses?.sectoriel?.chaine_froid_pharma || 'à compléter')
      .replace(/\{\{lutte_contrefacon\}\}/g, reponses?.sectoriel?.lutte_contrefacon || 'à compléter')
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
      const bpGenere = injecter(tplData.squelette_bp, form, modeleChoisi)
      const nsGenere = injecter(tplData.squelette_ns || '', form, modeleChoisi)
      setBp(bpGenere)
      setNs(nsGenere)
      await sauvegarderAvecDonnees(bpGenere, nsGenere)
      setSaved(true)
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
    await sauvegarderAvecDonnees(bp, ns)
    setSaved(true)
    setGenerating(false)
    setStep('resultat')
  }

  async function sauvegarderAvecDonnees(bpText: string, nsText: string) {
    const supabase = createBrowserSupabaseClient()
    await supabase.from('dossiers_eden').insert({
      nom_projet: form.nom_projet, promoteur: form.promoteur, zone: form.zone,
      modele: modeleChoisi?.label, secteur: modeleChoisi?.secteur,
      juridique: form.juridique, capital: parseFloat(form.capital) || 0,
      montant: parseFloat(form.montant) || 0, type_financement: form.type_financement,
      objet: form.objet, emplois: parseInt(form.emplois) || 0,
      garanties: form.garanties.join(', '), partenaire: form.partenaire,
      plan_type: planType, business_plan: bpText, note_synthese: nsText,
      plan_financier: planData, statut: 'brouillon'
    })
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
        {[['modele','1. Modèle'],['formulaire','2. Informations'],['questionnaire','3. Questionnaire'],['plan','4. Plan financier'],['resultat','5. Documents']].map(([k,l]) => (
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
            {(typeModele === 'commercial' ? modelesCommercial : modelesSocial).map(m => (
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
            <button style={{ ...S.btn, ...S.btnGold }} onClick={() => setStep('questionnaire')} disabled={!form.nom_projet || !form.montant}>Continuer →</button>
          </div>
        </div>
      )}

      {/* ÉTAPE QUESTIONNAIRE */}
      {step === 'questionnaire' && modeleChoisi && (
        <Questionnaire
          modeleId={modeleChoisi.id}
          modeleLabel={modeleChoisi.label}
          nomProjet={form.nom_projet}
          onTerminer={(rep) => { setReponses(rep); setStep('plan') }}
          onRetour={() => setStep('formulaire')}
        />
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
