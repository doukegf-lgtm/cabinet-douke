'use client'
import { useState } from 'react'

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
export interface ReponsesQuestionnaire {
  // Bloc 0 — Identité et vision
  probleme_adresse: string
  valeur_ajoutee: string
  parcours_professionnel: string
  experience_similaire: string
  pourquoi_vous: string
  // Bloc 1 — Marché
  profil_clients: string
  taille_marche: string
  concurrents: string
  politique_prix: string
  test_marche: string
  acquisition_premiers_clients: string
  // Bloc 2 — Opérationnel
  processus_production: string
  equipements_cles: string
  fournisseurs_principaux: string
  capacite_production: string
  goulots_etranglement: string
  accords_signes: string
  // Bloc 3 — RH
  equipe_cles: string
  postes_prioritaires: string
  fidelisation_personnel: string
  // Bloc 4 — Risques
  risques_principaux: string
  mitigations: string
  plan_b_financier: string
  risques_reglementaires: string
  // Bloc 5 — Sectoriel
  sectoriel: Record<string, string>
}

const reponseVide = (): ReponsesQuestionnaire => ({
  probleme_adresse: '', valeur_ajoutee: '', parcours_professionnel: '',
  experience_similaire: '', pourquoi_vous: '',
  profil_clients: '', taille_marche: '', concurrents: '', politique_prix: '',
  test_marche: '', acquisition_premiers_clients: '',
  processus_production: '', equipements_cles: '', fournisseurs_principaux: '',
  capacite_production: '', goulots_etranglement: '', accords_signes: '',
  equipe_cles: '', postes_prioritaires: '', fidelisation_personnel: '',
  risques_principaux: '', mitigations: '', plan_b_financier: '', risques_reglementaires: '',
  sectoriel: {}
})

// ─────────────────────────────────────────────
// QUESTIONS SECTORIELLES
// ─────────────────────────────────────────────
const QUESTIONS_SECTORIELLES: Record<string, { id: string; label: string; profondeur?: boolean }[]> = {
  agro: [
    { id: 'superficie_statut', label: 'Quelle superficie exploitez-vous (ha) et quel est le statut foncier (propriété, location, concession) ?' },
    { id: 'cultures_rendements', label: 'Quelles sont vos cultures principales et quels rendements attendez-vous par hectare par campagne ?' },
    { id: 'contre_saison', label: 'Avez-vous une campagne de contre-saison prévue ? Si oui, quel système d\'irrigation utilisez-vous ?' },
    { id: 'debouches', label: 'Quels sont vos débouchés commerciaux identifiés — marchés locaux, transformateurs, exportation ?' },
    { id: 'certifications', label: 'Quelles certifications visez-vous (GlobalGAP, bio, label qualité) et dans quel délai ?' },
    { id: 'cout_production', label: '[PROFONDEUR] Quel est votre coût de production à l\'hectare et votre seuil de rentabilité par culture ?', profondeur: true },
    { id: 'pertes_recolte', label: '[PROFONDEUR] Comment gérez-vous les pertes post-récolte — quel taux estimez-vous actuellement et quel est votre objectif ?', profondeur: true },
    { id: 'precommandes', label: '[PROFONDEUR] Avez-vous des contrats ou précommandes signés avec des acheteurs ? Sinon, quel est votre plan pour la première récolte ?', profondeur: true },
  ],
  energie: [
    { id: 'puissance_systemes', label: 'Quelle puissance totale installez-vous (kWc) et pour combien de systèmes sur la première année ?' },
    { id: 'modele_commercial', label: 'Quel est votre modèle commercial principal — vente directe, PAYGO, maintenance contractuelle ?' },
    { id: 'partenaires_telecom', label: 'Quels opérateurs télécom avez-vous contactés pour le mobile money (Orange, MTN, Moov) ?' },
    { id: 'certifications_equip', label: 'Quelles marques d\'équipements utilisez-vous et quelles sont leurs certifications (IEC 61215, IEC 62109) ?' },
    { id: 'agrement', label: 'Avez-vous obtenu ou êtes-vous en cours d\'obtention de l\'agrément CRSE/ANRE ?' },
    { id: 'cout_installation', label: '[PROFONDEUR] Quel est votre coût d\'installation moyen par kWc et votre marge nette après SAV ?', profondeur: true },
    { id: 'gestion_impayes', label: '[PROFONDEUR] Comment gérez-vous les impayés PAYGO — système de coupure à distance, taux de recouvrement cible ?', profondeur: true },
    { id: 'cartographie_zones', label: '[PROFONDEUR] Avez-vous cartographié les zones non électrifiées et estimé le nombre de ménages adressables ?', profondeur: true },
  ],
  commerce: [
    { id: 'references_marges', label: 'Quelles sont vos 10 références produits les plus vendues et leurs marges respectives ?' },
    { id: 'rotation_stock', label: 'Quelle est votre rotation de stock cible (en jours) et comment la mesurerez-vous ?' },
    { id: 'conditions_achat', label: 'Quelles sont vos conditions d\'achat chez vos fournisseurs (délai paiement, remises volume) ?' },
    { id: 'logiciel_gestion', label: 'Avez-vous un logiciel de gestion de stock ou système de suivi — lequel ?' },
    { id: 'gestion_ruptures', label: 'Quelle est votre politique de gestion des ruptures sur les références critiques ?' },
    { id: 'bfr_reel', label: '[PROFONDEUR] Quel est votre BFR réel en nombre de jours de CA et comment le financerez-vous ?', profondeur: true },
    { id: 'echecs_similaires', label: '[PROFONDEUR] Avez-vous analysé les causes d\'échec des commerces similaires dans votre zone — quelles leçons en tirez-vous ?', profondeur: true },
    { id: 'differenciation', label: '[PROFONDEUR] Comment vous défendrez-vous face aux commerçants informels — quelle est votre stratégie de différenciation concrète ?', profondeur: true },
  ],
  microfinance: [
    { id: 'methodologie_credit', label: 'Quelle méthodologie de crédit utilisez-vous — solidaire (Grameen), individuel, ou les deux ?' },
    { id: 'par30_cible', label: 'Quel est votre PAR30 cible et quels mécanismes mettez-vous en place pour l\'atteindre ?' },
    { id: 'agrement_bceao', label: 'Où en est votre dossier d\'agrément BCEAO/ARSM — déposé, en cours, à initier ?' },
    { id: 'teg_conformite', label: 'Quel est votre TEG et comment justifiez-vous sa conformité au plafond BCEAO ?' },
    { id: 'logiciel_portefeuille', label: 'Quel logiciel de gestion de portefeuille utilisez-vous (Mifos, Mambu, autre) ?' },
    { id: 'viabilite_osr', label: '[PROFONDEUR] Quel est votre modèle de calcul du taux d\'intérêt pour atteindre OSR > 100% sur 3 ans ?', profondeur: true },
    { id: 'prevention_fraude', label: '[PROFONDEUR] Comment prévenez-vous la fraude interne — séparation des tâches, audit, contrôle des agents ?', profondeur: true },
    { id: 'saturation_marche', label: '[PROFONDEUR] Avez-vous étudié la saturation du marché microfinance dans votre zone — combien d\'IMF concurrentes et taux de couverture actuel ?', profondeur: true },
  ],
  inclusion_femmes: [
    { id: 'ciblage_vulnerables', label: 'Comment identifiez-vous les femmes les plus vulnérables — critères précis et processus de sélection ?' },
    { id: 'activites_agr', label: 'Quelles activités génératrices de revenus avez-vous sélectionnées et sur quelle base ?' },
    { id: 'partenariat_imf', label: 'Quel est votre partenariat avec une IMF locale pour le microcrédit — convention signée ou en négociation ?' },
    { id: 'mesure_autonomisation', label: 'Comment mesurerez-vous l\'autonomisation économique réelle au-delà du revenu ?' },
    { id: 'protection_vbg', label: 'Quel est votre mécanisme de protection contre les violences basées sur le genre ?' },
    { id: 'perennite_groupements', label: '[PROFONDEUR] Quelle est votre stratégie pour que les groupements survivent au-delà de la fin du projet ?', profondeur: true },
    { id: 'implication_conjoints', label: '[PROFONDEUR] Comment impliquez-vous les conjoints et leaders communautaires pour éviter les résistances culturelles ?', profondeur: true },
    { id: 'baseline_donnees', label: '[PROFONDEUR] Avez-vous des données de base sur la situation économique des femmes ciblées avant le projet ?', profondeur: true },
  ],
  sante_communautaire: [
    { id: 'nb_asc_villages', label: 'Combien d\'ASC allez-vous former et dans quels villages ?' },
    { id: 'curriculum_formation', label: 'Quel curriculum de formation utilisez-vous — validé par le Ministère de la Santé ?' },
    { id: 'chaine_froid', label: 'Comment assurez-vous la chaîne du froid pour les vaccins dans des zones sans électricité fiable ?' },
    { id: 'protocole_reference', label: 'Quel est votre protocole de référencement vers les structures de santé supérieures ?' },
    { id: 'convention_sante', label: 'Avez-vous une convention signée avec la Direction Sanitaire de district ?' },
    { id: 'indicateurs_baseline', label: '[PROFONDEUR] Quels sont vos indicateurs de baseline (mortalité infantile, couverture vaccinale, malnutrition) et comment les avez-vous obtenus ?', profondeur: true },
    { id: 'retention_asc', label: '[PROFONDEUR] Comment garantissez-vous la motivation et la rétention des ASC bénévoles sur 3 ans ?', profondeur: true },
    { id: 'integration_snigs', label: '[PROFONDEUR] Comment intégrez-vous votre intervention dans le système de rapportage national (SNIGS) ?', profondeur: true },
  ],
  jeunesse: [
    { id: 'filieres_base', label: 'Quelles filières de formation avez-vous sélectionnées et sur quelle base (enquête employeurs, données ANPE) ?' },
    { id: 'entreprises_signees', label: 'Combien d\'entreprises partenaires avez-vous déjà signées pour les stages et l\'emploi ?' },
    { id: 'referentiel_cqp', label: 'Quel référentiel de compétences utilisez-vous — validé par la DGFPT pour les certifications CQP ?' },
    { id: 'suivi_diplomes', label: 'Quel est votre dispositif de suivi des diplômés à 1, 3 et 6 mois après la formation ?' },
    { id: 'taux_insertion_cible', label: 'Quel taux d\'insertion à 6 mois vous engagez-vous à atteindre et comment le mesurerez-vous de façon auditable ?' },
    { id: 'pedagogie_non_lecteurs', label: '[PROFONDEUR] Comment adaptez-vous votre pédagogie aux jeunes non-lecteurs ou faiblement alphabétisés ?', profondeur: true },
    { id: 'sans_emploi_salarie', label: '[PROFONDEUR] Quelle est votre stratégie pour les jeunes qui ne trouvent pas d\'emploi salarié — entrepreneuriat, crédit, incubation ?', profondeur: true },
    { id: 'partenariats_3ans', label: '[PROFONDEUR] Comment maintenez-vous et renouvelez-vous vos partenariats employeurs sur 3 ans ?', profondeur: true },
  ],
  eau: [
    { id: 'nb_forages', label: 'Combien de forages, puits ou points d\'eau allez-vous réaliser ou réhabiliter — localisation précise ?' },
    { id: 'etude_hydrogeologique', label: 'Disposez-vous d\'une étude hydrogéologique validée par la Direction de l\'Hydraulique ?' },
    { id: 'modele_pompe', label: 'Quel modèle de pompe utilisez-vous (PMH Afridev, India Mark, solaire) et pourquoi ?' },
    { id: 'constitution_cpe', label: 'Comment allez-vous constituer et former les Comités de Points d\'Eau (CPE) ?' },
    { id: 'tarification_communautaire', label: 'Quel est votre système de tarification communautaire pour couvrir la maintenance ?' },
    { id: 'gestion_boues', label: '[PROFONDEUR] Comment gérez-vous les boues de vidange — filière de traitement ou valorisation agronomique ?', profondeur: true },
    { id: 'maintenance_5ans', label: '[PROFONDEUR] Quel est votre plan de maintenance préventive et corrective sur 5 ans après le projet — qui paie, qui intervient ?', profondeur: true },
    { id: 'mesure_maladies', label: '[PROFONDEUR] Comment mesurez-vous et documentez-vous la réduction des maladies hydriques de façon acceptable par les bailleurs JMP/OMS ?', profondeur: true },
  ],
}

// ─────────────────────────────────────────────
// BLOCS UNIVERSELS
// ─────────────────────────────────────────────
const BLOCS_UNIVERSELS = [
  {
    id: 0,
    titre: '🎯 Identité & Vision',
    description: 'Ces questions aident les bailleurs à comprendre qui vous êtes et pourquoi ce projet.',
    questions: [
      { id: 'probleme_adresse', label: 'À quel problème concret et documenté vouliez-vous répondre en initiant ce projet ?' },
      { id: 'valeur_ajoutee', label: 'Quelle est la valeur ajoutée spécifique de votre projet par rapport à ce qui existe déjà dans la zone ?' },
      { id: 'parcours_professionnel', label: 'Votre parcours professionnel — expériences, formations, réalisations clés en lien avec ce projet' },
      { id: 'experience_similaire', label: '[PROFONDEUR] Avez-vous déjà géré une activité similaire ? Si oui, quels résultats et quelles leçons en avez-vous tirés ?', profondeur: true },
      { id: 'pourquoi_vous', label: '[PROFONDEUR] Pourquoi vous — et pas quelqu\'un d\'autre — êtes-vous la bonne personne pour porter ce projet à succès ?', profondeur: true },
    ]
  },
  {
    id: 1,
    titre: '📊 Marché & Clientèle',
    description: 'La connaissance du marché est le critère #1 d\'évaluation pour un bailleur.',
    questions: [
      { id: 'profil_clients', label: 'Qui sont vos clients/bénéficiaires cibles ? (profil précis, localisation, revenus moyens, habitudes)' },
      { id: 'taille_marche', label: 'Comment avez-vous estimé la taille de votre marché ? (sources utilisées, méthode de calcul)' },
      { id: 'concurrents', label: 'Citez vos 3 principaux concurrents directs avec leurs forces et faiblesses' },
      { id: 'politique_prix', label: 'Quel prix pratiquez-vous et comment l\'avez-vous déterminé par rapport au marché ?' },
      { id: 'test_marche', label: '[PROFONDEUR] Avez-vous déjà testé votre produit/service auprès de clients réels ? Quels retours avez-vous obtenus ?', profondeur: true },
      { id: 'acquisition_premiers_clients', label: '[PROFONDEUR] Quelle est votre stratégie pour acquérir vos 100 premiers clients — canaux, budget, délai estimé ?', profondeur: true },
    ]
  },
  {
    id: 2,
    titre: '⚙️ Opérationnel & Production',
    description: 'Prouvez que vous maîtrisez votre outil de production.',
    questions: [
      { id: 'processus_production', label: 'Décrivez étape par étape votre processus de production ou de délivrance du service' },
      { id: 'equipements_cles', label: 'Quels sont vos équipements clés et leur état (neuf / occasion / à acquérir) ?' },
      { id: 'fournisseurs_principaux', label: 'Qui sont vos 3 fournisseurs principaux — délais, conditions de paiement, alternatives ?' },
      { id: 'capacite_production', label: 'Quelle est votre capacité de production maximale par mois en régime de croisière ?' },
      { id: 'goulots_etranglement', label: '[PROFONDEUR] Quels sont les 3 goulots d\'étranglement opérationnels identifiés et comment comptez-vous les résoudre ?', profondeur: true },
      { id: 'accords_signes', label: '[PROFONDEUR] Avez-vous des accords ou lettres d\'intention signés avec des clients, fournisseurs ou partenaires ?', profondeur: true },
    ]
  },
  {
    id: 3,
    titre: '👥 Ressources Humaines',
    description: 'L\'équipe est souvent le facteur décisif pour les bailleurs.',
    questions: [
      { id: 'equipe_cles', label: 'Qui sont les personnes clés de votre équipe et quelles sont leurs compétences spécifiques ?' },
      { id: 'postes_prioritaires', label: 'Quels postes allez-vous recruter en priorité et pourquoi ?' },
      { id: 'fidelisation_personnel', label: 'Comment allez-vous former et fidéliser votre personnel dans un contexte de marché du travail tendu ?' },
    ]
  },
  {
    id: 4,
    titre: '⚠️ Risques & Résilience',
    description: 'Un promoteur qui connaît ses risques rassure plus qu\'il n\'inquiète.',
    questions: [
      { id: 'risques_principaux', label: 'Quels sont selon vous les 3 risques principaux qui pourraient faire échouer ce projet ?' },
      { id: 'mitigations', label: 'Pour chaque risque, quelle est votre mesure de mitigation concrète ?' },
      { id: 'plan_b_financier', label: '[PROFONDEUR] Que se passe-t-il si vos ventes sont 40% inférieures aux prévisions les 6 premiers mois — quel est votre plan B financier ?', profondeur: true },
      { id: 'risques_reglementaires', label: '[PROFONDEUR] Y a-t-il des risques réglementaires, environnementaux ou climatiques spécifiques que vous avez anticipés ?', profondeur: true },
    ]
  },
]

// ─────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────
const S = {
  card: { background: '#162030', border: '1px solid rgba(201,168,76,.15)', borderRadius: '12px', padding: '20px', marginBottom: '16px' } as React.CSSProperties,
  label: { fontSize: '13px', color: '#E8E8E8', fontWeight: 500, marginBottom: '6px', display: 'block', lineHeight: '1.5' } as React.CSSProperties,
  labelProfondeur: { fontSize: '13px', color: '#C9A84C', fontWeight: 600, marginBottom: '6px', display: 'block', lineHeight: '1.5' } as React.CSSProperties,
  textarea: { width: '100%', background: '#0F1923', border: '1px solid rgba(201,168,76,.2)', borderRadius: '8px', padding: '10px 12px', color: '#E8E8E8', fontSize: '13px', lineHeight: '1.6', resize: 'vertical' as const, outline: 'none', minHeight: '90px', boxSizing: 'border-box' as const, fontFamily: 'inherit' },
  btn: { padding: '10px 20px', borderRadius: '8px', fontWeight: 600, fontSize: '13px', cursor: 'pointer', border: 'none' } as React.CSSProperties,
  btnGold: { background: 'linear-gradient(135deg,#C9A84C,#8a6d2f)', color: '#0F1923' } as React.CSSProperties,
  btnGhost: { background: 'rgba(201,168,76,.1)', color: '#C9A84C', border: '1px solid rgba(201,168,76,.3)' } as React.CSSProperties,
}

// ─────────────────────────────────────────────
// COMPOSANT PRINCIPAL
// ─────────────────────────────────────────────
interface Props {
  modeleId: string
  modeleLabel: string
  nomProjet: string
  onTerminer: (reponses: ReponsesQuestionnaire) => void
  onRetour: () => void
}

export default function Questionnaire({ modeleId, modeleLabel, nomProjet, onTerminer, onRetour }: Props) {
  const [blocActuel, setBlocActuel] = useState(0)
  const [reponses, setReponses] = useState<ReponsesQuestionnaire>(reponseVide())

  const questionsSectorielles = QUESTIONS_SECTORIELLES[modeleId] || []
  const totalBlocs = BLOCS_UNIVERSELS.length + (questionsSectorielles.length > 0 ? 1 : 0)
  const estBlocSectoriel = blocActuel === BLOCS_UNIVERSELS.length
  const blocInfo = !estBlocSectoriel ? BLOCS_UNIVERSELS[blocActuel] : null
  const pct = Math.round((blocActuel / totalBlocs) * 100)

  function setRep(key: string, val: string) {
    setReponses(r => ({ ...r, [key]: val }))
  }
  function setRepSec(key: string, val: string) {
    setReponses(r => ({ ...r, sectoriel: { ...r.sectoriel, [key]: val } }))
  }

  function suivant() {
    if (blocActuel < totalBlocs - 1) setBlocActuel(b => b + 1)
    else onTerminer(reponses)
  }
  function precedent() {
    if (blocActuel > 0) setBlocActuel(b => b - 1)
    else onRetour()
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '11px', color: '#6B7A8D', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Questionnaire — {nomProjet}
        </div>
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#C9A84C', marginBottom: '12px' }}>
          {estBlocSectoriel ? `🎯 Questions spécifiques — ${modeleLabel}` : blocInfo?.titre}
        </div>
        {!estBlocSectoriel && (
          <div style={{ fontSize: '12px', color: '#6B7A8D', marginBottom: '12px' }}>{blocInfo?.description}</div>
        )}

        {/* Barre de progression */}
        <div style={{ background: 'rgba(255,255,255,.06)', borderRadius: '4px', height: '6px', marginBottom: '8px' }}>
          <div style={{ background: 'linear-gradient(90deg,#C9A84C,#8a6d2f)', borderRadius: '4px', height: '6px', width: `${pct}%`, transition: 'width .3s ease' }} />
        </div>
        <div style={{ fontSize: '11px', color: '#6B7A8D' }}>
          Bloc {blocActuel + 1} sur {totalBlocs} — {pct}% complété
        </div>
      </div>

      {/* Questions universelles */}
      {!estBlocSectoriel && blocInfo && (
        <div style={S.card}>
          {blocInfo.questions.map(q => (
            <div key={q.id} style={{ marginBottom: '16px' }}>
              <label style={(q as any).profondeur ? S.labelProfondeur : S.label}>
                {(q as any).profondeur && <span style={{ fontSize: '10px', background: 'rgba(201,168,76,.15)', border: '1px solid rgba(201,168,76,.3)', borderRadius: '4px', padding: '1px 6px', marginRight: '6px', verticalAlign: 'middle' }}>PROFONDEUR</span>}
                {q.label.replace('[PROFONDEUR] ', '')}
              </label>
              <textarea
                style={S.textarea}
                value={(reponses as any)[q.id] || ''}
                onChange={e => setRep(q.id, e.target.value)}
                placeholder="Votre réponse détaillée…"
                rows={q.id === 'parcours_professionnel' || q.id === 'processus_production' ? 5 : 3}
              />
            </div>
          ))}
        </div>
      )}

      {/* Questions sectorielles */}
      {estBlocSectoriel && (
        <div style={S.card}>
          <div style={{ fontSize: '12px', color: '#6B7A8D', marginBottom: '16px' }}>
            Ces questions sont spécifiques à votre secteur d'activité. Elles enrichiront les sections techniques de votre business plan.
          </div>
          {questionsSectorielles.map(q => (
            <div key={q.id} style={{ marginBottom: '16px' }}>
              <label style={q.profondeur ? S.labelProfondeur : S.label}>
                {q.profondeur && <span style={{ fontSize: '10px', background: 'rgba(201,168,76,.15)', border: '1px solid rgba(201,168,76,.3)', borderRadius: '4px', padding: '1px 6px', marginRight: '6px', verticalAlign: 'middle' }}>PROFONDEUR</span>}
                {q.label.replace('[PROFONDEUR] ', '')}
              </label>
              <textarea
                style={S.textarea}
                value={reponses.sectoriel[q.id] || ''}
                onChange={e => setRepSec(q.id, e.target.value)}
                placeholder="Votre réponse détaillée…"
                rows={3}
              />
            </div>
          ))}
        </div>
      )}

      {/* Navigation */}
      <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
        <button style={{ ...S.btn, ...S.btnGhost }} onClick={precedent}>← Retour</button>
        <button style={{ ...S.btn, ...S.btnGold }} onClick={suivant}>
          {blocActuel === totalBlocs - 1 ? '✅ Terminer le questionnaire →' : 'Bloc suivant →'}
        </button>
      </div>
    </div>
  )
}
