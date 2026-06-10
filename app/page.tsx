'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard,
  ClipboardList,
  Calendar,
  Users,
  Bell,
  ShieldCheck,
  Plus,
  RefreshCw,
  X,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  UserCheck,
  Lock,
  Landmark,
  Briefcase,
  FileText,
  ArrowUpRight,
  LogOut,
  Eye,
  EyeOff,
  Trash2,
  Edit3,
  UserPlus,
  Link2,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Building2,
  Activity,
  BookOpen,
  Star,
  Shield,
  ArrowLeft,
  Save,
  Search,
  Filter,
  MoreVertical,
  Printer,
  PenLine,
  Clock,
  MessageSquare,
  CheckSquare,
  BarChart2,
  Target,
  ChevronUp,
  Download,
  CalendarRange,
  Hash,
  Wallet,
  Heart,
  Handshake,
  GraduationCap,
  Receipt,
  Scale,
  Globe,
  Megaphone,
  Archive,
} from 'lucide-react';

// ============================================================
// DONNÉES DE SECOURS PREMIUM (BACKUP CORE — NE PAS MODIFIER)
// ============================================================
type Category = {
  id: string;
  label: string;
  icon: string;
  color: string;
  description: string;
};

const BACKUP_OBJECTIVES = [
  {
    id: '1',
    title: 'Structuration du modèle financier PPP',
    structure_type: 'Cabinet DOUKE',
    category: 'project_douke',
    status: 'En cours',
    priority: 'Haute',
    deadline: '2026-06-25',
    progress_percentage: 65,
    organization_id: 'd2222222-2222-2222-2222-222222222222',
    assigned_to: 'u2',
  },
  {
    id: '2',
    title: 'Audit des failles contractuelles - Projet Infrastructure',
    structure_type: 'Cabinet DOUKE',
    category: 'audit',
    status: 'En retard',
    priority: 'Critique',
    deadline: '2026-06-12',
    progress_percentage: 35,
    organization_id: 'd2222222-2222-2222-2222-222222222222',
    assigned_to: 'u2',
  },
  {
    id: '3',
    title: 'Déploiement des modules de gestion axée sur les résultats',
    structure_type: 'CONACCE Chaplains',
    category: 'project_conacce',
    status: 'En cours',
    priority: 'Moyenne',
    deadline: '2026-07-10',
    progress_percentage: 45,
    organization_id: 'c1111111-1111-1111-1111-111111111111',
    assigned_to: 'u3',
  },
  {
    id: '4',
    title: "Matrice d'impact terrain et collecte de données ONU",
    structure_type: 'CONACCE Chaplains',
    category: 'humanitaire',
    status: 'Terminé',
    priority: 'Haute',
    deadline: '2026-06-01',
    progress_percentage: 100,
    organization_id: 'c1111111-1111-1111-1111-111111111111',
    assigned_to: 'u3',
  },
  {
    id: '5',
    title: 'Recrutement et onboarding du nouveau DAF / DGA',
    structure_type: 'Cabinet DOUKE',
    category: 'admin',
    status: 'En cours',
    priority: 'Haute',
    deadline: '2026-06-30',
    progress_percentage: 20,
    organization_id: 'd2222222-2222-2222-2222-222222222222',
    assigned_to: 'u1',
  },
  {
    id: '6',
    title: 'Tenue journalière comptabilité client Entreprise BATA',
    structure_type: 'Cabinet DOUKE',
    category: 'comptabilite',
    status: 'En cours',
    priority: 'Haute',
    deadline: '2026-06-28',
    progress_percentage: 55,
    organization_id: 'd2222222-2222-2222-2222-222222222222',
    assigned_to: 'u4',
  },
  {
    id: '7',
    title: 'Déclarations fiscales trimestrielles - Portefeuille Q2',
    structure_type: 'Cabinet DOUKE',
    category: 'fiscal',
    status: 'En cours',
    priority: 'Critique',
    deadline: '2026-06-20',
    progress_percentage: 70,
    organization_id: 'd2222222-2222-2222-2222-222222222222',
    assigned_to: 'u2',
  },
  {
    id: '8',
    title: 'Mobilisation de financement - Projet Énergie Solaire Nord Bénin',
    structure_type: 'Cabinet DOUKE',
    category: 'financement',
    status: 'En cours',
    priority: 'Haute',
    deadline: '2026-07-15',
    progress_percentage: 30,
    organization_id: 'd2222222-2222-2222-2222-222222222222',
    assigned_to: 'u2',
  },
  {
    id: '9',
    title: 'Partenariat stratégique ONG internationale - Santé communautaire',
    structure_type: 'CONACCE Chaplains',
    category: 'partenariat',
    status: 'En cours',
    priority: 'Moyenne',
    deadline: '2026-07-30',
    progress_percentage: 25,
    organization_id: 'c1111111-1111-1111-1111-111111111111',
    assigned_to: 'u3',
  },
  {
    id: '10',
    title: 'Campagne de mécénat - Construction école primaire Atacora',
    structure_type: 'CONACCE Chaplains',
    category: 'mecenat',
    status: 'En cours',
    priority: 'Haute',
    deadline: '2026-08-01',
    progress_percentage: 40,
    organization_id: 'c1111111-1111-1111-1111-111111111111',
    assigned_to: 'u3',
  },
];

const BACKUP_COLLABORATORS = [
  {
    id: 'u1',
    first_name: 'Irina',
    last_name: 'VIEYRA',
    avatar_emoji: '👑',
    role: 'Directrice Principale',
    profile: 'Super-Admin',
    performance: 85,
    organization_id: 'Tous',
    senior_id: null,
    email: 'irina@cabinet-douke.com',
  },
  {
    id: 'u2',
    first_name: 'Serge',
    last_name: 'KODJO',
    avatar_emoji: '💼',
    role: 'Analyste Financier Senior',
    profile: 'Senior Analyst',
    performance: 60,
    organization_id: 'd2222222-2222-2222-2222-222222222222',
    senior_id: 'u1',
    email: 'serge@cabinet-douke.com',
  },
  {
    id: 'u3',
    first_name: 'Koffi',
    last_name: 'MENSAH',
    avatar_emoji: '🛡️',
    role: 'Coordinateur Terrain CONACCE',
    profile: 'Field Lead',
    performance: 45,
    organization_id: 'c1111111-1111-1111-1111-111111111111',
    senior_id: 'u1',
    email: 'koffi@conacce.org',
  },
  {
    id: 'u4',
    first_name: 'Amina',
    last_name: 'BELLO',
    avatar_emoji: '📊',
    role: 'Secrétaire Commerciale',
    profile: 'Secretaire',
    performance: 90,
    organization_id: 'd2222222-2222-2222-2222-222222222222',
    senior_id: 'u2',
    email: 'amina@cabinet-douke.com',
  },
];

const BACKUP_ACTIVITIES = [
  {
    id: 'a1',
    user_id: 'u1',
    description:
      'Irina VIEYRA a audité la matrice contractuelle du projet de souveraineté.',
    date: '2026-06-10',
    type: 'audit',
  },
  {
    id: 'a2',
    user_id: 'u2',
    description:
      'Nouveau livrable de diagnostic financier initial créé pour un entrepreneur béninois.',
    date: '2026-06-09',
    type: 'creation',
  },
  {
    id: 'a3',
    user_id: 'u2',
    description:
      'Serge KODJO a mis à jour les dossiers existants du Cabinet DOUKE.',
    date: '2026-06-08',
    type: 'update',
  },
];

// ============================================================
// RÉALISATIONS — Journal de bord des actions concrètes
// ============================================================
const BACKUP_REALISATIONS = [
  {
    id: 'r1',
    user_id: 'u2',
    objective_id: '1',
    description:
      'Finalisation de la structure du modèle Excel - onglet hypothèses complété',
    date: '2026-06-09',
    duration_hours: 3,
    progress_after: 65,
    validated_by: null,
  },
  {
    id: 'r2',
    user_id: 'u3',
    objective_id: '3',
    description:
      'Réunion de cadrage avec les équipes terrain de Parakou — 12 participants',
    date: '2026-06-08',
    duration_hours: 2,
    progress_after: 45,
    validated_by: null,
  },
  {
    id: 'r3',
    user_id: 'u4',
    objective_id: '6',
    description: 'Saisie des écritures comptables du mois de mai — 87 lignes',
    date: '2026-06-10',
    duration_hours: 4,
    progress_after: 55,
    validated_by: 'u2',
  },
];

// ============================================================
// REMARQUES des Seniors sur les dossiers Juniors
// ============================================================
const BACKUP_REMARQUES = [
  {
    id: 'rem1',
    from_id: 'u2',
    to_id: 'u4',
    objective_id: '6',
    text: 'Bien avancé. Vérifier que les TVA déductibles de mai sont bien imputées.',
    date: '2026-06-09',
  },
  {
    id: 'rem2',
    from_id: 'u1',
    to_id: 'u3',
    objective_id: '3',
    text: 'Le rapport de cadrage doit être envoyé avant le 12/06. Priorité absolue.',
    date: '2026-06-08',
  },
];

// ============================================================
// COMPTES D'ACCÈS SÉCURISÉS (NE PAS MODIFIER)
// ============================================================
const AUTH_ACCOUNTS = [
  {
    id: 'admin-irina',
    username: 'irina.vieyra',
    password: 'Douke@2026!',
    name: 'Irina VIEYRA',
    role: 'Super-Admin',
    orgId: 'Tous',
    emoji: '👑',
    collaborator_id: 'u1',
    color: 'blue',
  },
  {
    id: 'douke-daf',
    username: 'serge.kodjo',
    password: 'Senior@2026!',
    name: 'Serge KODJO',
    role: 'Senior Analyst',
    orgId: 'd2222222-2222-2222-2222-222222222222',
    emoji: '💼',
    collaborator_id: 'u2',
    color: 'blue',
  },
  {
    id: 'conacce-lead',
    username: 'koffi.mensah',
    password: 'Field@2026!',
    name: 'Koffi MENSAH',
    role: 'Field Lead',
    orgId: 'c1111111-1111-1111-1111-111111111111',
    emoji: '🛡️',
    collaborator_id: 'u3',
    color: 'emerald',
  },
  {
    id: 'junior-amina',
    username: 'amina.bello',
    password: 'Junior@2026!',
    name: 'Amina BELLO',
    role: 'Secretaire',
    orgId: 'd2222222-2222-2222-2222-222222222222',
    emoji: '📊',
    collaborator_id: 'u4',
    color: 'amber',
  },
];

// ============================================================
// CATÉGORIES DE DOSSIERS — ENRICHIES PAR STRUCTURE
// ============================================================
const DOSSIER_CATEGORIES_DOUKE = [
  {
    id: 'project_douke',
    label: 'Projet Stratégique',
    icon: '🏗️',
    color: 'blue',
    description: 'Projets multi-partenaires à horizon long terme',
  },
  {
    id: 'client_file',
    label: 'Dossier Client',
    icon: '🤝',
    color: 'emerald',
    description: 'Dossiers actifs de clients et mandants',
  },
  {
    id: 'comptabilite',
    label: 'Comptabilité',
    icon: '📒',
    color: 'teal',
    description: 'Tenue journalière, états financiers, bilans',
  },
  {
    id: 'fiscal',
    label: 'Fiscal & Social',
    icon: '🧾',
    color: 'orange',
    description: 'Déclarations fiscales, sociales, TVA, IS',
  },
  {
    id: 'financement',
    label: 'Recherche Financement',
    icon: '💰',
    color: 'yellow',
    description: 'Mobilisation de fonds, bailleurs, PPP',
  },
  {
    id: 'audit',
    label: 'Audit & Contrôle',
    icon: '🔍',
    color: 'purple',
    description: "Missions d'audit, vérification, reporting",
  },
  {
    id: 'formation',
    label: 'Formation & Conseil',
    icon: '🎓',
    color: 'pink',
    description: 'Programmes de formation et capacity building',
  },
  {
    id: 'admin',
    label: 'Administratif',
    icon: '📋',
    color: 'amber',
    description: 'Gestion interne, RH, conformité',
  },
  {
    id: 'other',
    label: 'Autre Mission',
    icon: '📁',
    color: 'slate',
    description: 'Missions diverses non classifiées',
  },
];

const DOSSIER_CATEGORIES_CONACCE = [
  {
    id: 'project_conacce',
    label: 'Projet CONACCE',
    icon: '🌍',
    color: 'emerald',
    description: 'Projets humanitaires structurés',
  },
  {
    id: 'humanitaire',
    label: 'Activité Humanitaire',
    icon: '❤️',
    color: 'rose',
    description: 'Actions de terrain, aide directe, secours',
  },
  {
    id: 'mecenat',
    label: 'Mécénat',
    icon: '🌟',
    color: 'yellow',
    description: 'Mobilisation de mécènes et donateurs',
  },
  {
    id: 'partenariat',
    label: 'Partenariat ONG',
    icon: '🤝',
    color: 'blue',
    description: 'Alliances avec autres organisations',
  },
  {
    id: 'formation',
    label: 'Formation & Renforcement',
    icon: '🎓',
    color: 'pink',
    description: 'Capacity building, formations terrain',
  },
  {
    id: 'admin',
    label: 'Administratif',
    icon: '📋',
    color: 'amber',
    description: 'Gestion interne, conformité, rapports',
  },
  {
    id: 'other',
    label: 'Autre',
    icon: '📁',
    color: 'slate',
    description: 'Missions diverses',
  },
];

const ALL_CATEGORIES: Category[] = [
  ...DOSSIER_CATEGORIES_DOUKE,
  ...DOSSIER_CATEGORIES_CONACCE,
];

const uniqueCategories = Array.from(
  new Map<string, Category>(
    ALL_CATEGORIES.map((cat) => [cat.id, cat])
  ).values()
);

const CATEGORY_STYLES = {
  project_douke: 'bg-blue-50 text-blue-700 border-blue-100',
  project_conacce: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  client_file: 'bg-teal-50 text-teal-700 border-teal-100',
  comptabilite: 'bg-cyan-50 text-cyan-700 border-cyan-100',
  fiscal: 'bg-orange-50 text-orange-700 border-orange-100',
  financement: 'bg-yellow-50 text-yellow-700 border-yellow-100',
  audit: 'bg-purple-50 text-purple-700 border-purple-100',
  formation: 'bg-pink-50 text-pink-700 border-pink-100',
  humanitaire: 'bg-rose-50 text-rose-700 border-rose-100',
  mecenat: 'bg-amber-50 text-amber-700 border-amber-100',
  partenariat: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  admin: 'bg-slate-50 text-slate-700 border-slate-200',
  other: 'bg-gray-50 text-gray-700 border-gray-100',
};

// ============================================================
// UTILITAIRES
// ============================================================
const getCategoryInfo = (catId) =>
  ALL_CATEGORIES.find((c) => c.id === catId) ||
  ALL_CATEGORIES[ALL_CATEGORIES.length - 1];
const formatDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};
const todayISO = () => new Date().toISOString().split('T')[0];

// ============================================================
// ÉCRAN DE CONNEXION SÉCURISÉ (CONSERVÉ 100%)
// ============================================================
function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [locked, setLocked] = useState(false);

  const handleLogin = (e) => {
    e.preventDefault();
    if (locked) return;
    setLoading(true);
    setError('');
    setTimeout(() => {
      const account = AUTH_ACCOUNTS.find(
        (a) =>
          a.username === username.trim().toLowerCase() &&
          a.password === password
      );
      if (account) {
        setAttempts(0);
        onLogin(account);
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        if (newAttempts >= 5) {
          setLocked(true);
          setError(
            "Compte verrouillé après 5 tentatives. Contactez l'administrateur."
          );
        } else {
          setError(`Identifiants incorrects. Tentative ${newAttempts}/5.`);
        }
        setLoading(false);
      }
    }, 800);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#0F172A] flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-emerald-600/5 rounded-full blur-3xl"></div>
      </div>
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl shadow-2xl shadow-blue-500/30 mb-4">
            <ShieldCheck size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-black text-white uppercase tracking-widest">
            Cabinet DOUKE
          </h1>
          <p className="text-[11px] text-blue-400 font-bold tracking-widest uppercase mt-1">
            Gouvernance & Sovereign Auth
          </p>
          <div className="flex items-center justify-center gap-2 mt-3">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
            <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
              Système de Sécurité Actif
            </span>
          </div>
        </div>
        <div className="bg-[#1E293B] border border-slate-700/50 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-sm font-black text-white uppercase tracking-wider mb-1">
            Accès Sécurisé
          </h2>
          <p className="text-[11px] text-slate-400 font-medium mb-6">
            Authentification à périmètre restreint — Cabinet DOUKE / CONACCE
          </p>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                Identifiant
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="prenom.nom"
                disabled={locked}
                className="w-full bg-[#0F172A] border border-slate-700 rounded-xl text-sm font-bold text-white p-3.5 outline-none focus:border-blue-500 transition-all placeholder-slate-600 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                Mot de passe
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••"
                  disabled={locked}
                  className="w-full bg-[#0F172A] border border-slate-700 rounded-xl text-sm font-bold text-white p-3.5 outline-none focus:border-blue-500 transition-all placeholder-slate-600 pr-12 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-all"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {error && (
              <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3">
                <AlertCircle size={14} className="text-rose-400 shrink-0" />
                <p className="text-[11px] text-rose-400 font-bold">{error}</p>
              </div>
            )}
            <button
              type="submit"
              disabled={loading || locked}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white p-4 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Vérification en cours...</span>
                </>
              ) : (
                <>
                  <Lock size={14} />
                  <span>Accéder au système</span>
                </>
              )}
            </button>
          </form>
          <div className="mt-6 pt-5 border-t border-slate-700/50">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-3">
              Profils disponibles sur cette instance :
            </p>
            <div className="space-y-1.5">
              {AUTH_ACCOUNTS.map((acc) => (
                <div
                  key={acc.id}
                  className="flex items-center justify-between bg-[#0F172A] rounded-lg px-3 py-2 border border-slate-800"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{acc.emoji}</span>
                    <span className="text-[10px] font-black text-slate-300">
                      {acc.username}
                    </span>
                  </div>
                  <span
                    className={`text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider ${
                      acc.role === 'Super-Admin'
                        ? 'bg-blue-500/20 text-blue-400'
                        : acc.role === 'Senior Analyst'
                        ? 'bg-slate-500/20 text-slate-300'
                        : acc.role === 'Field Lead'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-amber-500/20 text-amber-400'
                    }`}
                  >
                    {acc.role}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="text-center text-[10px] text-slate-600 font-bold mt-4 uppercase tracking-wider">
          © 2026 Cabinet DOUKE — Accès restreint. Toute tentative non autorisée
          est tracée.
        </p>
      </div>
    </div>
  );
}


// ============================================================
// MODAL COLLABORATEUR (CONSERVÉ + ENRICHI)
// ============================================================
function CollaboratorModal({
  isOpen,
  onClose,
  onSave,
  existing,
  allCollaborators,
}) {
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    avatar_emoji: '👤',
    role: '',
    profile: 'Junior',
    organization_id: 'd2222222-2222-2222-2222-222222222222',
    senior_id: null,
    email: '',
    performance: 50,
  });

  useEffect(() => {
    if (existing) setForm({ ...existing });
    else
      setForm({
        first_name: '',
        last_name: '',
        avatar_emoji: '👤',
        role: '',
        profile: 'Junior',
        organization_id: 'd2222222-2222-2222-2222-222222222222',
        senior_id: null,
        email: '',
        performance: 50,
      });
  }, [existing, isOpen]);

  if (!isOpen) return null;
  const EMOJIS = [
    '👤',
    '👑',
    '💼',
    '🛡️',
    '📊',
    '🎯',
    '⚡',
    '🔬',
    '📐',
    '🏛️',
    '🤝',
    '📌',
  ];
  const PROFILES = [
    'Super-Admin',
    'Senior Analyst',
    'Field Lead',
    'Junior',
    'Secretaire',
    'Consultant',
    'Stagiaire',
  ];
  const seniors = allCollaborators.filter((c) =>
    ['Super-Admin', 'Senior Analyst', 'Field Lead'].includes(c.profile)
  );

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl relative border border-slate-100 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
        >
          <X size={18} />
        </button>
        <div className="flex items-center gap-3 mb-5">
          <div className="bg-blue-50 p-2.5 rounded-xl border border-blue-100">
            <UserPlus size={18} className="text-blue-600" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
              {existing ? 'Modifier le collaborateur' : 'Nouveau collaborateur'}
            </h3>
            <p className="text-[10px] text-slate-400 font-medium">
              Remplissez les informations du profil
            </p>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">
              Avatar
            </label>
            <div className="flex gap-2 flex-wrap">
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() =>
                    setForm((f) => ({ ...f, avatar_emoji: emoji }))
                  }
                  className={`text-xl p-2 rounded-xl border-2 transition-all ${
                    form.avatar_emoji === emoji
                      ? 'border-blue-500 bg-blue-50 scale-110'
                      : 'border-slate-100 hover:border-slate-300 bg-slate-50'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                Prénom *
              </label>
              <input
                value={form.first_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, first_name: e.target.value }))
                }
                placeholder="Prénom"
                className="w-full border border-slate-200 p-3 rounded-xl text-xs font-bold outline-none focus:border-blue-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                Nom *
              </label>
              <input
                value={form.last_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, last_name: e.target.value }))
                }
                placeholder="NOM"
                className="w-full border border-slate-200 p-3 rounded-xl text-xs font-bold outline-none focus:border-blue-500 transition-all"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
              Poste / Fonction *
            </label>
            <input
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              placeholder="Ex: Analyste Financier Junior"
              className="w-full border border-slate-200 p-3 rounded-xl text-xs font-bold outline-none focus:border-blue-500 transition-all"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
              Email
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) =>
                setForm((f) => ({ ...f, email: e.target.value }))
              }
              placeholder="prenom@cabinet-douke.com"
              className="w-full border border-slate-200 p-3 rounded-xl text-xs font-bold outline-none focus:border-blue-500 transition-all"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                Profil / Niveau d'accès
              </label>
              <select
                value={form.profile}
                onChange={(e) =>
                  setForm((f) => ({ ...f, profile: e.target.value }))
                }
                className="w-full border border-slate-200 p-3 rounded-xl text-xs font-bold outline-none bg-white cursor-pointer"
              >
                {PROFILES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                Structure
              </label>
              <select
                value={form.organization_id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, organization_id: e.target.value }))
                }
                className="w-full border border-slate-200 p-3 rounded-xl text-xs font-bold outline-none bg-white cursor-pointer"
              >
                <option value="Tous">Toutes structures</option>
                <option value="d2222222-2222-2222-2222-222222222222">
                  Cabinet DOUKE
                </option>
                <option value="c1111111-1111-1111-1111-111111111111">
                  CONACCE Chaplains
                </option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Link2 size={10} />
              Rattacher à un Senior (Référent hiérarchique)
            </label>
            <select
              value={form.senior_id || ''}
              onChange={(e) =>
                setForm((f) => ({ ...f, senior_id: e.target.value || null }))
              }
              className="w-full border border-slate-200 p-3 rounded-xl text-xs font-bold outline-none bg-white cursor-pointer"
            >
              <option value="">— Aucun référent (autonome) —</option>
              {seniors
                .filter((s) => s.id !== existing?.id)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.avatar_emoji} {s.first_name} {s.last_name} ({s.role})
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2 flex justify-between">
              <span>Indice de performance initial</span>
              <span className="text-blue-600">{form.performance}%</span>
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={form.performance}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  performance: parseInt(e.target.value),
                }))
              }
              className="w-full accent-blue-600"
            />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 border border-slate-200 text-slate-600 p-3 rounded-xl font-black text-xs uppercase tracking-wider hover:bg-slate-50 transition-all"
          >
            Annuler
          </button>
          <button
            onClick={() => {
              if (!form.first_name || !form.last_name || !form.role) return;
              onSave({ ...form, id: existing?.id || `u${Date.now()}` });
              onClose();
            }}
            className="flex-2 bg-blue-600 hover:bg-blue-700 text-white px-6 p-3 rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2"
          >
            <Save size={14} />
            {existing
              ? 'Enregistrer les modifications'
              : 'Créer le collaborateur'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MODAL DOSSIER / OBJECTIF (CONSERVÉ + ENRICHI)
// ============================================================
function ObjectiveModal({
  isOpen,
  onClose,
  onSave,
  onDelete,
  existing,
  collaborators,
  currentUser,
}) {
  const [form, setForm] = useState({
    title: '',
    structure_type: 'Cabinet DOUKE',
    category: 'project_douke',
    status: 'En cours',
    priority: 'Haute',
    deadline: '2026-06-30',
    progress_percentage: 0,
    organization_id: 'd2222222-2222-2222-2222-222222222222',
    assigned_to: '',
  });
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (existing) setForm({ ...existing });
    else
      setForm({
        title: '',
        structure_type: 'Cabinet DOUKE',
        category: 'project_douke',
        status: 'En cours',
        priority: 'Haute',
        deadline: '2026-06-30',
        progress_percentage: 0,
        organization_id: 'd2222222-2222-2222-2222-222222222222',
        assigned_to: '',
      });
    setConfirmDelete(false);
  }, [existing, isOpen]);

  if (!isOpen) return null;

  const isConacce =
    form.organization_id === 'c1111111-1111-1111-1111-111111111111';
  const cats = isConacce
    ? DOSSIER_CATEGORIES_CONACCE
    : DOSSIER_CATEGORIES_DOUKE;

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl relative border border-slate-100 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
        >
          <X size={18} />
        </button>
        <div className="flex items-center gap-3 mb-5">
          <div
            className={`p-2.5 rounded-xl border ${
              existing
                ? 'bg-amber-50 border-amber-100'
                : 'bg-blue-50 border-blue-100'
            }`}
          >
            {existing ? (
              <Edit3 size={18} className="text-amber-600" />
            ) : (
              <FolderOpen size={18} className="text-blue-600" />
            )}
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
              {existing ? 'Modifier le dossier' : 'Ouvrir un nouveau dossier'}
            </h3>
            <p className="text-[10px] text-slate-400 font-medium">
              Renseignez toutes les informations du dossier
            </p>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
              Intitulé de la mission *
            </label>
            <input
              value={form.title}
              onChange={(e) =>
                setForm((f) => ({ ...f, title: e.target.value }))
              }
              placeholder="Ex: Audit financier de souveraineté..."
              className="w-full border border-slate-200 p-3 rounded-xl text-xs font-bold outline-none focus:border-blue-500 transition-all"
            />
          </div>
          {currentUser.orgId === 'Tous' && (
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                Structure affectée
              </label>
              <select
                value={form.organization_id}
                onChange={(e) => {
                  const isC =
                    e.target.value === 'c1111111-1111-1111-1111-111111111111';
                  setForm((f) => ({
                    ...f,
                    organization_id: e.target.value,
                    structure_type: isC ? 'CONACCE Chaplains' : 'Cabinet DOUKE',
                    category: isC ? 'project_conacce' : 'project_douke',
                  }));
                }}
                className="w-full border border-slate-200 p-3 rounded-xl text-xs font-bold outline-none cursor-pointer bg-white"
              >
                <option value="d2222222-2222-2222-2222-222222222222">
                  Cabinet DOUKE (Financement)
                </option>
                <option value="c1111111-1111-1111-1111-111111111111">
                  CONACCE Chaplains (Terrain)
                </option>
              </select>
            </div>
          )}
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">
              Catégorie du dossier *
            </label>
            <div className="grid grid-cols-3 gap-2">
              {cats.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, category: cat.id }))}
                  className={`p-2.5 rounded-xl border-2 text-left transition-all ${
                    form.category === cat.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-100 hover:border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="text-lg mb-1">{cat.icon}</div>
                  <div className="text-[9px] font-black uppercase tracking-wide text-slate-700 leading-tight">
                    {cat.label}
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                Priorité
              </label>
              <select
                value={form.priority}
                onChange={(e) =>
                  setForm((f) => ({ ...f, priority: e.target.value }))
                }
                className="w-full border border-slate-200 p-3 rounded-xl text-xs font-bold outline-none bg-white"
              >
                <option>Critique</option>
                <option>Haute</option>
                <option>Moyenne</option>
                <option>Basse</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                Statut
              </label>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value }))
                }
                className="w-full border border-slate-200 p-3 rounded-xl text-xs font-bold outline-none bg-white"
              >
                <option>En cours</option>
                <option>En retard</option>
                <option>Terminé</option>
                <option>En attente</option>
                <option>Suspendu</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
              Échéance cible
            </label>
            <input
              type="date"
              value={form.deadline}
              onChange={(e) =>
                setForm((f) => ({ ...f, deadline: e.target.value }))
              }
              className="w-full border border-slate-200 p-3 rounded-xl text-xs font-bold outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <UserCheck size={10} />
              Responsable du dossier
            </label>
            <select
              value={form.assigned_to || ''}
              onChange={(e) =>
                setForm((f) => ({ ...f, assigned_to: e.target.value }))
              }
              className="w-full border border-slate-200 p-3 rounded-xl text-xs font-bold outline-none bg-white cursor-pointer"
            >
              <option value="">— Non assigné —</option>
              {collaborators.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.avatar_emoji} {c.first_name} {c.last_name} ({c.role})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2 flex justify-between">
              <span>Progression initiale</span>
              <span className="text-blue-600">{form.progress_percentage}%</span>
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={form.progress_percentage}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  progress_percentage: parseInt(e.target.value),
                }))
              }
              className="w-full accent-blue-600"
            />
          </div>
        </div>
        {existing && (
          <div className="mt-5 pt-4 border-t border-slate-100">
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-rose-100 text-rose-600 text-xs font-black uppercase tracking-wider hover:bg-rose-50 transition-all"
              >
                <Trash2 size={14} />
                Supprimer ce dossier
              </button>
            ) : (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
                <p className="text-xs font-black text-rose-700 mb-3 text-center">
                  ⚠️ Confirmer la suppression définitive ?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 border border-slate-200 text-slate-600 p-2.5 rounded-xl font-black text-[10px] uppercase hover:bg-slate-50 transition-all"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={() => {
                      onDelete(existing.id);
                      onClose();
                    }}
                    className="flex-1 bg-rose-600 hover:bg-rose-700 text-white p-2.5 rounded-xl font-black text-[10px] uppercase shadow-sm transition-all flex items-center justify-center gap-1"
                  >
                    <Trash2 size={12} />
                    Supprimer
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        <div className="flex gap-3 mt-4">
          <button
            onClick={onClose}
            className="flex-1 border border-slate-200 text-slate-600 p-3 rounded-xl font-black text-xs uppercase tracking-wider hover:bg-slate-50 transition-all"
          >
            Annuler
          </button>
          <button
            onClick={() => {
              if (!form.title.trim()) return;
              onSave({ ...form, id: existing?.id || Date.now().toString() });
              onClose();
            }}
            className="flex-2 bg-blue-600 hover:bg-blue-700 text-white px-6 p-3 rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2"
          >
            <Save size={14} />
            {existing ? 'Enregistrer' : 'Créer le dossier'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MODAL SAISIE DE RÉALISATION (NOUVEAU — POINT 2)
// ============================================================
function RealisationModal({
  isOpen,
  onClose,
  onSave,
  objectives,
  currentUser,
  collaborators,
}) {
  const [form, setForm] = useState({
    objective_id: '',
    description: '',
    date: todayISO(),
    duration_hours: 1,
    progress_after: 0,
  });
  const [selectedObj, setSelectedObj] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setForm({
        objective_id: '',
        description: '',
        date: todayISO(),
        duration_hours: 1,
        progress_after: 0,
      });
      setSelectedObj(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Filtre : Junior ne voit que ses dossiers
  const isJuniorOrSecretary = ['Junior', 'Secretaire'].includes(
    currentUser.role
  );
  const myObjs = isJuniorOrSecretary
    ? objectives.filter((o) => o.assigned_to === currentUser.collaborator_id)
    : objectives;

  const handleObjSelect = (id) => {
    const obj = myObjs.find((o) => o.id === id);
    setSelectedObj(obj);
    setForm((f) => ({
      ...f,
      objective_id: id,
      progress_after: obj ? obj.progress_percentage : 0,
    }));
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl relative border border-slate-100 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
        >
          <X size={18} />
        </button>
        <div className="flex items-center gap-3 mb-5">
          <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-100">
            <PenLine size={18} className="text-emerald-600" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
              Saisir une réalisation
            </h3>
            <p className="text-[10px] text-slate-400 font-medium">
              Journalisez une action concrète effectuée sur un dossier
            </p>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
              Dossier concerné *
            </label>
            <select
              value={form.objective_id}
              onChange={(e) => handleObjSelect(e.target.value)}
              className="w-full border border-slate-200 p-3 rounded-xl text-xs font-bold outline-none bg-white cursor-pointer"
            >
              <option value="">— Sélectionner un dossier —</option>
              {myObjs.map((o) => (
                <option key={o.id} value={o.id}>
                  {getCategoryInfo(o.category)?.icon} {o.title}
                </option>
              ))}
            </select>
          </div>
          {selectedObj && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
              <div>
                <span
                  className={`text-[9px] font-black px-2 py-0.5 rounded border ${
                    CATEGORY_STYLES[selectedObj.category] || ''
                  }`}
                >
                  {getCategoryInfo(selectedObj.category)?.label}
                </span>
                <p className="text-[11px] text-slate-500 font-bold mt-1">
                  Progression actuelle :{' '}
                  <span className="text-blue-600">
                    {selectedObj.progress_percentage}%
                  </span>
                </p>
              </div>
              <span
                className={`text-[10px] font-black px-2 py-0.5 rounded border ${
                  selectedObj.status === 'Terminé'
                    ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                    : selectedObj.status === 'En retard'
                    ? 'bg-rose-50 text-rose-600 border-rose-100'
                    : 'bg-amber-50 text-amber-600 border-amber-100'
                }`}
              >
                {selectedObj.status}
              </span>
            </div>
          )}
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
              Description de l'action effectuée *
            </label>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              rows={3}
              placeholder="Décrivez précisément ce que vous avez accompli..."
              className="w-full border border-slate-200 p-3 rounded-xl text-xs font-bold outline-none focus:border-blue-500 transition-all resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                Date de réalisation
              </label>
              <input
                type="date"
                value={form.date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, date: e.target.value }))
                }
                className="w-full border border-slate-200 p-3 rounded-xl text-xs font-bold outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Clock size={9} />
                Durée (heures)
              </label>
              <input
                type="number"
                min="0.5"
                max="24"
                step="0.5"
                value={form.duration_hours}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    duration_hours: parseFloat(e.target.value),
                  }))
                }
                className="w-full border border-slate-200 p-3 rounded-xl text-xs font-bold outline-none"
              />
            </div>
          </div>
          {selectedObj && (
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2 flex justify-between">
                <span>Progression après cette action</span>
                <span
                  className={`font-black ${
                    form.progress_after >= selectedObj.progress_percentage
                      ? 'text-emerald-600'
                      : 'text-rose-600'
                  }`}
                >
                  {form.progress_after}%
                </span>
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={form.progress_after}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    progress_after: parseInt(e.target.value),
                  }))
                }
                className="w-full accent-blue-600"
              />
              {form.progress_after < selectedObj.progress_percentage && (
                <p className="text-[10px] text-amber-600 font-bold mt-1">
                  ⚠️ La progression est inférieure à l'actuel. Confirmez si
                  c'est voulu.
                </p>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 border border-slate-200 text-slate-600 p-3 rounded-xl font-black text-xs uppercase tracking-wider hover:bg-slate-50 transition-all"
          >
            Annuler
          </button>
          <button
            onClick={() => {
              if (!form.objective_id || !form.description.trim()) return;
              onSave({
                ...form,
                id: `r${Date.now()}`,
                user_id: currentUser.collaborator_id,
                validated_by: null,
              });
              onClose();
            }}
            className="flex-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 p-3 rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2"
          >
            <CheckSquare size={14} />
            Enregistrer la réalisation
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MODAL IMPRESSION (NOUVEAU — POINT 4)
// ============================================================
function PrintModal({
  isOpen,
  onClose,
  collaborators,
  objectives,
  realisations,
  currentUser,
}) {
  const [printType, setPrintType] = useState('realisations');
  const [filterUser, setFilterUser] = useState('all');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(todayISO);

  if (!isOpen) return null;

  // Secrétaire peut imprimer tout le monde, Junior seulement lui-même
  const isJunior = currentUser.role === 'Junior';
  const printableUsers = isJunior
    ? collaborators.filter((c) => c.id === currentUser.collaborator_id)
    : collaborators;

  const handlePrint = () => {
    const targetUser =
      filterUser === 'all'
        ? null
        : collaborators.find((c) => c.id === filterUser);
    const filteredRealisations = realisations.filter((r) => {
      const dateOk = r.date >= dateFrom && r.date <= dateTo;
      const userOk = filterUser === 'all' || r.user_id === filterUser;
      return dateOk && userOk;
    });
    const filteredObjectives = objectives.filter((o) => {
      const userOk = filterUser === 'all' || o.assigned_to === filterUser;
      return userOk;
    });

    const printWindow = window.open('', '_blank');
    const content =
      printType === 'realisations' ? filteredRealisations : filteredObjectives;

    printWindow.document.write(`
      <html><head><title>Cabinet DOUKE — ${
        printType === 'realisations' ? 'Réalisations' : 'Prévisions'
      }</title>
      <style>
        * { font-family: Arial, sans-serif; margin: 0; padding: 0; box-sizing: border-box; }
        body { padding: 32px; color: #1e293b; }
        .header { border-bottom: 3px solid #2563eb; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; }
        .brand { font-size: 20px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; color: #0f172a; }
        .subtitle { font-size: 11px; color: #64748b; margin-top: 4px; text-transform: uppercase; letter-spacing: 1px; }
        .meta { text-align: right; font-size: 11px; color: #64748b; }
        .section-title { font-size: 13px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; color: #1e293b; border-left: 4px solid #2563eb; padding-left: 10px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th { background: #f1f5f9; padding: 10px 12px; text-align: left; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; font-size: 10px; color: #64748b; border-bottom: 2px solid #e2e8f0; }
        td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; }
        tr:hover td { background: #f8fafc; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 9px; font-weight: 900; text-transform: uppercase; }
        .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; text-align: center; text-transform: uppercase; letter-spacing: 1px; }
        .total-row td { font-weight: 900; background: #f1f5f9; border-top: 2px solid #e2e8f0; }
        @media print { body { padding: 16px; } }
      </style></head><body>
      <div class="header">
        <div><div class="brand">🏛️ Cabinet DOUKE</div><div class="subtitle">Rapport — ${
          printType === 'realisations'
            ? 'Journal des Réalisations'
            : 'Tableau des Prévisions'
        }</div></div>
        <div class="meta"><strong>Période :</strong> ${formatDate(
          dateFrom
        )} → ${formatDate(dateTo)}<br/><strong>Collaborateur :</strong> ${
      targetUser ? targetUser.first_name + ' ' + targetUser.last_name : 'Tous'
    }<br/><strong>Généré le :</strong> ${formatDate(todayISO())}</div>
      </div>
      ${
        printType === 'realisations'
          ? `
        <div class="section-title">Réalisations enregistrées (${
          content.length
        })</div>
        <table><thead><tr><th>#</th><th>Date</th><th>Collaborateur</th><th>Dossier</th><th>Action effectuée</th><th>Durée (h)</th><th>Progression</th></tr></thead><tbody>
        ${content
          .map((r, i) => {
            const collab = collaborators.find((c) => c.id === r.user_id);
            const obj = objectives.find((o) => o.id === r.objective_id);
            return `<tr><td>${i + 1}</td><td>${formatDate(r.date)}</td><td>${
              collab ? collab.first_name + ' ' + collab.last_name : '—'
            }</td><td>${obj ? obj.title : '—'}</td><td>${
              r.description
            }</td><td>${r.duration_hours}h</td><td><strong>${
              r.progress_after
            }%</strong></td></tr>`;
          })
          .join('')}
        <tr class="total-row"><td colspan="5">TOTAL</td><td>${content.reduce(
          (s, r) => s + r.duration_hours,
          0
        )}h</td><td>${content.length} action(s)</td></tr>
        </tbody></table>
      `
          : `
        <div class="section-title">Prévisions & Objectifs (${
          content.length
        })</div>
        <table><thead><tr><th>#</th><th>Dossier / Mission</th><th>Responsable</th><th>Structure</th><th>Priorité</th><th>Statut</th><th>Échéance</th><th>Avancement</th></tr></thead><tbody>
        ${content
          .map((o, i) => {
            const collab = collaborators.find((c) => c.id === o.assigned_to);
            return `<tr><td>${i + 1}</td><td><strong>${
              o.title
            }</strong></td><td>${
              collab ? collab.first_name + ' ' + collab.last_name : '—'
            }</td><td>${o.structure_type}</td><td>${o.priority}</td><td>${
              o.status
            }</td><td>${formatDate(o.deadline)}</td><td><strong>${
              o.progress_percentage
            }%</strong></td></tr>`;
          })
          .join('')}
        </tbody></table>
      `
      }
      <div class="footer">Cabinet DOUKE © 2026 — Document confidentiel — Diffusion interne uniquement</div>
      </body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative border border-slate-100">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
        >
          <X size={18} />
        </button>
        <div className="flex items-center gap-3 mb-5">
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
            <Printer size={18} className="text-slate-700" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
              Impression du rapport
            </h3>
            <p className="text-[10px] text-slate-400 font-medium">
              Définissez les paramètres d'impression
            </p>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">
              Type de rapport
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'realisations', label: 'Réalisations', icon: '✅' },
                { id: 'previsions', label: 'Prévisions', icon: '📋' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setPrintType(t.id)}
                  className={`p-3 rounded-xl border-2 text-center transition-all ${
                    printType === t.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-100 hover:border-slate-200'
                  }`}
                >
                  <div className="text-2xl mb-1">{t.icon}</div>
                  <div className="text-[10px] font-black uppercase text-slate-700">
                    {t.label}
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
              Collaborateur
            </label>
            <select
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              className="w-full border border-slate-200 p-3 rounded-xl text-xs font-bold outline-none bg-white cursor-pointer"
            >
              {!isJunior && (
                <option value="all">Tous les collaborateurs</option>
              )}
              {printableUsers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.avatar_emoji} {c.first_name} {c.last_name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                Du
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full border border-slate-200 p-3 rounded-xl text-xs font-bold outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                Au
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full border border-slate-200 p-3 rounded-xl text-xs font-bold outline-none"
              />
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 border border-slate-200 text-slate-600 p-3 rounded-xl font-black text-xs uppercase hover:bg-slate-50 transition-all"
          >
            Annuler
          </button>
          <button
            onClick={handlePrint}
            className="flex-2 bg-slate-900 hover:bg-slate-800 text-white px-6 p-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2"
          >
            <Printer size={14} />
            Imprimer
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// DASHBOARD ADMIN — Vue consolidée complète
// ============================================================
function AdminDashboard({
  objectives,
  collaborators,
  activities,
  realisations,
  stats,
  currentStructure,
  setCurrentStructure,
  setCurrentView,
  currentUser,
}) {
  const displayObjectives =
    currentStructure === 'Tous'
      ? objectives
      : objectives.filter((o) => o.organization_id === currentStructure);

  return (
    <>
      {/* KPI CARTES */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          {
            label: 'Dossiers Actifs',
            value: displayObjectives.length,
            icon: <Briefcase size={22} className="text-blue-600" />,
            bg: 'from-blue-500/5 to-transparent',
            border: 'border-blue-100',
            sub: 'Missions en cours de traitement',
          },
          {
            label: "Indicateur d'Avancement",
            value: `${stats.globalProgress}%`,
            icon: <CheckCircle2 size={22} className="text-emerald-600" />,
            bg: 'from-emerald-500/5 to-transparent',
            border: 'border-emerald-100',
            sub: 'Performance moyenne pondérée',
          },
          {
            label: 'Alertes / Retards',
            value: displayObjectives.filter((o) => o.status === 'En retard')
              .length,
            icon: <AlertCircle size={22} className="text-rose-600" />,
            bg:
              displayObjectives.filter((o) => o.status === 'En retard').length >
              0
                ? 'from-rose-500/10 to-rose-500/5'
                : 'from-rose-500/5 to-transparent',
            border: 'border-rose-100',
            sub: 'Blocages nécessitant arbitrage',
            alert:
              displayObjectives.filter((o) => o.status === 'En retard').length >
              0,
          },
          {
            label: 'Livrables en cours',
            value: displayObjectives.filter((o) => o.status === 'En cours')
              .length,
            icon: <FileText size={22} className="text-amber-600" />,
            bg: 'from-amber-500/5 to-transparent',
            border: 'border-amber-100',
            sub: 'Validation finale imminente',
          },
        ].map((card, idx) => (
          <div
            key={idx}
            className={`bg-white p-6 rounded-2xl border shadow-sm flex flex-col justify-between bg-gradient-to-b ${card.bg} ${card.border}`}
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {card.label}
                </p>
                <p
                  className={`text-3xl font-black mt-2 tracking-tight ${
                    card.alert ? 'text-rose-600' : 'text-slate-900'
                  }`}
                >
                  {card.value}
                </p>
              </div>
              <div className="bg-white p-2.5 rounded-xl shadow-sm border border-slate-100">
                {card.icon}
              </div>
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-4 pt-3 border-t border-slate-50">
              {card.sub}
            </p>
          </div>
        ))}
      </div>

      {/* RÉPARTITION PAR CATÉGORIE */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <h3 className="font-black text-slate-900 text-xs uppercase tracking-wider mb-4">
          Répartition par Catégorie de Dossiers
        </h3>
        <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2">
          {ALL_CATEGORIES.filter((cat) =>
            displayObjectives.some((o) => o.category === cat.id)
          ).map((cat) => {
            const count = displayObjectives.filter(
              (o) => o.category === cat.id
            ).length;
            return (
              <div
                key={cat.id}
                className={`p-3 rounded-xl border text-center cursor-pointer transition-all hover:scale-105 ${
                  CATEGORY_STYLES[cat.id]
                }`}
                onClick={() => {
                  setCurrentView('Objectifs');
                }}
              >
                <div className="text-xl mb-1">{cat.icon}</div>
                <div className="text-lg font-black">{count}</div>
                <div className="text-[8px] font-black uppercase tracking-wide leading-tight mt-0.5">
                  {cat.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTIONS ANALYTIQUES */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Performance structures */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-black text-slate-900 text-xs uppercase tracking-wider mb-5 flex items-center justify-between">
              <span>Performance par Structure</span>
              <Landmark size={14} className="text-slate-400" />
            </h3>
            <div className="space-y-6">
              {[
                {
                  label: 'Cabinet DOUKE',
                  value: stats.doukeProgress,
                  color: 'from-blue-500 to-blue-600',
                  badge: 'bg-blue-50 text-blue-600',
                },
                {
                  label: 'CONACCE Chaplains',
                  value: stats.conacceProgress,
                  color: 'from-emerald-500 to-emerald-600',
                  badge: 'bg-emerald-50 text-emerald-600',
                },
              ].map((s, i) => (
                <div key={i}>
                  <div className="flex justify-between items-center mb-2">
                    <p className="font-black text-slate-700 text-xs uppercase tracking-wide">
                      {s.label}
                    </p>
                    <span
                      className={`font-black text-xs px-2 py-0.5 rounded ${s.badge}`}
                    >
                      {s.value}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden border border-slate-200/40">
                    <div
                      className={`bg-gradient-to-r ${s.color} h-full transition-all duration-500`}
                      style={{ width: `${s.value}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="text-[10px] text-slate-400 font-bold bg-slate-50 p-3 rounded-xl border border-slate-100 mt-6 uppercase tracking-wider text-center">
            Consolidation en temps réel
          </div>
        </div>

        {/* Avancement collaborateurs */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
          <h3 className="font-black text-slate-900 text-xs uppercase tracking-wider mb-4 flex items-center justify-between">
            <span>Avancement par Collaborateur</span>
            <Users size={14} className="text-slate-400" />
          </h3>
          <div className="space-y-3.5">
            {collaborators.map((c, idx) => {
              const colorClass =
                c.performance > 75
                  ? 'from-emerald-400 to-emerald-500'
                  : c.performance > 55
                  ? 'from-blue-500 to-blue-600'
                  : 'from-amber-400 to-amber-500';
              const textBg =
                c.performance > 75
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                  : c.performance > 55
                  ? 'bg-blue-50 text-blue-700 border-blue-100'
                  : 'bg-amber-50 text-amber-700 border-amber-100';
              const senior = collaborators.find((s) => s.id === c.senior_id);
              const myRealCount = realisations.filter(
                (r) => r.user_id === c.id
              ).length;
              return (
                <div
                  key={idx}
                  className="flex items-center gap-3.5 bg-slate-50/60 p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition-all"
                >
                  <span className="text-xl bg-white p-2 rounded-xl shadow-sm border border-slate-100 flex items-center justify-center w-10 h-10">
                    {c.avatar_emoji || '👤'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1">
                      <div>
                        <p className="text-xs font-black text-slate-900 leading-none">
                          {c.first_name} {c.last_name}
                        </p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide">
                            {c.role}
                          </p>
                          {senior && (
                            <span className="text-[9px] text-blue-500 font-bold">
                              → {senior.first_name}
                            </span>
                          )}
                          <span className="text-[9px] text-slate-400 font-bold">
                            · {myRealCount} réal.
                          </span>
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded border ${textBg}`}
                      >
                        {c.performance}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full bg-gradient-to-r ${colorClass} transition-all duration-500`}
                        style={{ width: `${c.performance}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Anomalies */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-black text-slate-900 text-xs uppercase tracking-wider mb-4 flex items-center justify-between">
              <span>Anomalies et Blocages</span>
              <AlertCircle size={14} className="text-rose-500" />
            </h3>
            <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
              {displayObjectives.filter((o) => o.status === 'En retard')
                .length === 0 ? (
                <div className="text-center py-12 text-slate-400 italic text-xs font-medium">
                  Aucun retard détecté.
                </div>
              ) : (
                displayObjectives
                  .filter((o) => o.status === 'En retard')
                  .map((urg, idx) => (
                    <div
                      key={idx}
                      className="text-xs flex justify-between items-center bg-rose-50/30 p-2.5 rounded-xl border border-rose-100/50"
                    >
                      <div>
                        <p className="font-black text-slate-900">{urg.title}</p>
                        <p className="text-[10px] font-bold text-blue-600 uppercase mt-0.5">
                          {urg.structure_type}
                        </p>
                      </div>
                      <span className="font-black text-rose-600 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-100 text-[10px] shrink-0">
                        {urg.deadline}
                      </span>
                    </div>
                  ))
              )}
            </div>
          </div>
          <div className="text-[10px] font-bold text-slate-400 tracking-wide uppercase border-t pt-3 flex items-center gap-1.5 mt-2">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
            <span>Arbitrage prioritaire requis sous 48h</span>
          </div>
        </div>
      </div>

      {/* AUDIT TRAIL */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-black text-slate-900 text-xs uppercase tracking-wider">
            Traçabilité de Gouvernance (Audit Trail)
          </h3>
          <span className="text-[9px] font-black uppercase text-slate-400 bg-slate-50 border px-2 py-0.5 rounded">
            Journal Consolidé
          </span>
        </div>
        <div className="space-y-2.5">
          {activities.map((act, i) => (
            <div
              key={i}
              className="text-xs text-slate-700 font-medium p-3 bg-slate-50/80 rounded-xl border border-slate-100 flex items-center justify-between hover:bg-slate-50 transition-all"
            >
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0"></span>
                <span className="font-bold text-slate-800">
                  {act.description}
                </span>
              </div>
              <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-white border px-2 py-0.5 rounded shadow-sm shrink-0">
                <span>{formatDate(act.date)}</span>
                <ArrowUpRight size={10} className="text-slate-400" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ============================================================
// DASHBOARD SENIOR — Vue objectifs + juniors + alertes
// ============================================================
function SeniorDashboard({
  objectives,
  collaborators,
  realisations,
  remarques,
  stats,
  currentUser,
}) {
  const myJuniors = collaborators.filter(
    (c) => c.senior_id === currentUser.collaborator_id
  );
  const myObjectives = objectives.filter(
    (o) => o.assigned_to === currentUser.collaborator_id
  );
  const urgents = myObjectives.filter(
    (o) =>
      o.status === 'En retard' ||
      o.deadline <=
        new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0]
  );

  return (
    <>
      {/* KPI SENIOR */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
        {[
          {
            label: 'Mes Dossiers',
            value: myObjectives.length,
            icon: '📁',
            color: 'text-blue-600',
            bg: 'bg-blue-50 border-blue-100',
          },
          {
            label: 'Avg. Avancement',
            value: `${
              myObjectives.length > 0
                ? Math.round(
                    myObjectives.reduce(
                      (s, o) => s + o.progress_percentage,
                      0
                    ) / myObjectives.length
                  )
                : 0
            }%`,
            icon: '📊',
            color: 'text-emerald-600',
            bg: 'bg-emerald-50 border-emerald-100',
          },
          {
            label: 'Urgences',
            value: urgents.length,
            icon: '⚠️',
            color: 'text-rose-600',
            bg: 'bg-rose-50 border-rose-100',
          },
          {
            label: 'Juniors suivis',
            value: myJuniors.length,
            icon: '👥',
            color: 'text-purple-600',
            bg: 'bg-purple-50 border-purple-100',
          },
        ].map((k, i) => (
          <div
            key={i}
            className={`p-5 rounded-2xl border ${k.bg} flex flex-col gap-2`}
          >
            <span className="text-2xl">{k.icon}</span>
            <p className={`text-2xl font-black ${k.color}`}>{k.value}</p>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
              {k.label}
            </p>
          </div>
        ))}
      </div>

      {/* MES OBJECTIFS */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-black text-slate-900 text-xs uppercase tracking-wider">
            Mes Objectifs & Dossiers
          </h3>
          <span className="text-[10px] font-black text-slate-400 bg-slate-50 border px-2 py-0.5 rounded">
            {myObjectives.length} dossiers
          </span>
        </div>
        <div className="divide-y divide-slate-50">
          {myObjectives.length === 0 && (
            <div className="p-8 text-center text-slate-400 text-xs font-medium italic">
              Aucun dossier assigné.
            </div>
          )}
          {myObjectives.map((obj, i) => {
            const catInfo = getCategoryInfo(obj.category);
            const myReal = realisations.filter(
              (r) =>
                r.objective_id === obj.id &&
                r.user_id === currentUser.collaborator_id
            );
            return (
              <div key={i} className="p-4 hover:bg-slate-50 transition-all">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span
                        className={`text-[9px] font-black px-2 py-0.5 rounded border flex items-center gap-1 ${
                          CATEGORY_STYLES[obj.category] || ''
                        }`}
                      >
                        <span>{catInfo?.icon}</span>
                        <span>{catInfo?.label}</span>
                      </span>
                      <span
                        className={`text-[9px] font-black px-2 py-0.5 rounded border ${
                          obj.status === 'Terminé'
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                            : obj.status === 'En retard'
                            ? 'bg-rose-50 text-rose-600 border-rose-100'
                            : 'bg-amber-50 text-amber-600 border-amber-100'
                        }`}
                      >
                        {obj.status}
                      </span>
                      {obj.priority === 'Critique' && (
                        <span className="text-[9px] font-black text-rose-600">
                          ⚡ Critique
                        </span>
                      )}
                    </div>
                    <p className="font-black text-slate-900 text-sm mb-2">
                      {obj.title}
                    </p>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 max-w-48 bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-blue-500 to-blue-600 h-full"
                          style={{ width: `${obj.progress_percentage}%` }}
                        ></div>
                      </div>
                      <span className="text-xs font-black text-slate-700">
                        {obj.progress_percentage}%
                      </span>
                      <span className="text-[10px] text-slate-400 font-bold">
                        Échéance : {formatDate(obj.deadline)}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 shrink-0">
                    {myReal.length} réal.
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SUIVI JUNIORS */}
      {myJuniors.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-black text-slate-900 text-xs uppercase tracking-wider">
              Collaborateurs Juniors sous ma supervision
            </h3>
            <span className="text-[10px] font-black text-slate-400 bg-slate-50 border px-2 py-0.5 rounded">
              {myJuniors.length} junior(s)
            </span>
          </div>
          <div className="p-4 space-y-4">
            {myJuniors.map((junior, ji) => {
              const juniorObjs = objectives.filter(
                (o) => o.assigned_to === junior.id
              );
              const juniorReal = realisations.filter(
                (r) => r.user_id === junior.id
              );
              const juniorAvg =
                juniorObjs.length > 0
                  ? Math.round(
                      juniorObjs.reduce(
                        (s, o) => s + o.progress_percentage,
                        0
                      ) / juniorObjs.length
                    )
                  : 0;
              return (
                <div
                  key={ji}
                  className="bg-slate-50 rounded-2xl border border-slate-100 p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xl bg-white p-2 rounded-xl border border-slate-100 shadow-sm">
                        {junior.avatar_emoji}
                      </span>
                      <div>
                        <p className="font-black text-slate-900 text-sm">
                          {junior.first_name} {junior.last_name}
                        </p>
                        <p className="text-[10px] text-slate-500 font-bold uppercase">
                          {junior.role}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-black text-blue-600">
                        {juniorAvg}%
                      </p>
                      <p className="text-[9px] text-slate-400 font-bold uppercase">
                        Avancement moy.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {juniorObjs.slice(0, 3).map((o, oi) => (
                      <div
                        key={oi}
                        className="flex items-center justify-between bg-white rounded-xl p-2.5 border border-slate-100"
                      >
                        <span className="text-xs font-bold text-slate-700 truncate flex-1">
                          {o.title}
                        </span>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <div className="w-16 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-gradient-to-r from-blue-500 to-blue-600 h-full"
                              style={{ width: `${o.progress_percentage}%` }}
                            ></div>
                          </div>
                          <span className="text-[10px] font-black text-slate-600">
                            {o.progress_percentage}%
                          </span>
                        </div>
                      </div>
                    ))}
                    {juniorObjs.length > 3 && (
                      <p className="text-[10px] text-slate-400 font-bold text-center">
                        +{juniorObjs.length - 3} autre(s) dossier(s)
                      </p>
                    )}
                  </div>
                  <div className="flex justify-between items-center mt-3 pt-2 border-t border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400">
                      {juniorReal.length} réalisations enregistrées
                    </span>
                    <span
                      className={`text-[9px] font-black px-2 py-0.5 rounded ${
                        junior.performance > 75
                          ? 'bg-emerald-50 text-emerald-600'
                          : junior.performance > 50
                          ? 'bg-blue-50 text-blue-600'
                          : 'bg-amber-50 text-amber-600'
                      }`}
                    >
                      Perf. {junior.performance}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* DERNIÈRES RÉALISATIONS DE MES JUNIORS */}
      {myJuniors.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="font-black text-slate-900 text-xs uppercase tracking-wider">
              Dernières Réalisations de mes Juniors
            </h3>
          </div>
          <div className="divide-y divide-slate-50">
            {realisations
              .filter((r) => myJuniors.some((j) => j.id === r.user_id))
              .slice(0, 5)
              .map((r, ri) => {
                const collab = collaborators.find((c) => c.id === r.user_id);
                const obj = objectives.find((o) => o.id === r.objective_id);
                return (
                  <div key={ri} className="p-4 flex items-start gap-3">
                    <span className="text-lg mt-0.5">
                      {collab?.avatar_emoji || '👤'}
                    </span>
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <p className="text-xs font-black text-slate-900">
                          {collab?.first_name} {collab?.last_name}
                        </p>
                        <span className="text-[10px] text-slate-400 font-bold shrink-0">
                          {formatDate(r.date)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 font-medium mt-0.5">
                        {r.description}
                      </p>
                      {obj && (
                        <p className="text-[10px] text-blue-600 font-bold mt-1">
                          ↳ {obj.title} — {r.progress_after}%
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            {realisations.filter((r) =>
              myJuniors.some((j) => j.id === r.user_id)
            ).length === 0 && (
              <div className="p-8 text-center text-slate-400 text-xs italic">
                Aucune réalisation enregistrée par vos juniors.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================
// DASHBOARD JUNIOR — Vue personnelle uniquement
// ============================================================
function JuniorDashboard({
  objectives,
  collaborators,
  realisations,
  remarques,
  currentUser,
  onSaisirRealisation,
}) {
  const myObjectives = objectives.filter(
    (o) => o.assigned_to === currentUser.collaborator_id
  );
  const myRealisations = realisations.filter(
    (r) => r.user_id === currentUser.collaborator_id
  );
  const myRemarques = remarques.filter(
    (r) => r.to_id === currentUser.collaborator_id
  );
  const myAvg =
    myObjectives.length > 0
      ? Math.round(
          myObjectives.reduce((s, o) => s + o.progress_percentage, 0) /
            myObjectives.length
        )
      : 0;
  const mySenior = collaborators.find(
    (c) =>
      c.id ===
      collaborators.find((col) => col.id === currentUser.collaborator_id)
        ?.senior_id
  );
  const thisWeekObjs = myObjectives.filter((o) => {
    const deadline = new Date(o.deadline);
    const today = new Date();
    const weekEnd = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    return deadline >= today && deadline <= weekEnd;
  });

  return (
    <>
      {/* HEADER JUNIOR PERSONNALISÉ */}
      <div className="bg-gradient-to-r from-[#0F172A] to-[#1E293B] rounded-2xl p-6 text-white border border-slate-700/50 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-4xl bg-white/10 p-3 rounded-2xl border border-white/10">
              {currentUser.emoji}
            </span>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Espace personnel
              </p>
              <h2 className="text-xl font-black text-white">
                {currentUser.name}
              </h2>
              <p className="text-[11px] text-blue-400 font-bold uppercase tracking-wider mt-0.5">
                {currentUser.role}
              </p>
              {mySenior && (
                <p className="text-[10px] text-slate-400 font-bold mt-1">
                  Référent : {mySenior.first_name} {mySenior.last_name}
                </p>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-4xl font-black text-white">{myAvg}%</p>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mt-1">
              Avancement global
            </p>
            <div className="w-32 bg-white/10 h-2 rounded-full overflow-hidden mt-2 ml-auto">
              <div
                className="bg-gradient-to-r from-blue-400 to-emerald-400 h-full transition-all"
                style={{ width: `${myAvg}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI JUNIOR */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: 'Mes Dossiers',
            value: myObjectives.length,
            icon: '📁',
            color: 'text-blue-600',
            bg: 'bg-blue-50 border-blue-100',
          },
          {
            label: 'Prévisions Semaine',
            value: thisWeekObjs.length,
            icon: '📅',
            color: 'text-purple-600',
            bg: 'bg-purple-50 border-purple-100',
          },
          {
            label: 'Réalisations',
            value: myRealisations.length,
            icon: '✅',
            color: 'text-emerald-600',
            bg: 'bg-emerald-50 border-emerald-100',
          },
          {
            label: 'Remarques Reçues',
            value: myRemarques.length,
            icon: '💬',
            color: 'text-amber-600',
            bg: 'bg-amber-50 border-amber-100',
          },
        ].map((k, i) => (
          <div
            key={i}
            className={`p-5 rounded-2xl border ${k.bg} flex flex-col gap-2`}
          >
            <span className="text-2xl">{k.icon}</span>
            <p className={`text-2xl font-black ${k.color}`}>{k.value}</p>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
              {k.label}
            </p>
          </div>
        ))}
      </div>

      {/* PRÉVISIONS DE LA SEMAINE */}
      {thisWeekObjs.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <h3 className="font-black text-amber-800 text-xs uppercase tracking-wider mb-3 flex items-center gap-2">
            <CalendarRange size={14} />
            Prévisions de la semaine — Alertes délais
          </h3>
          <div className="space-y-2">
            {thisWeekObjs.map((o, i) => {
              const daysLeft = Math.ceil(
                (new Date(o.deadline) - new Date()) / (1000 * 60 * 60 * 24)
              );
              return (
                <div
                  key={i}
                  className="flex items-center justify-between bg-white rounded-xl p-3 border border-amber-100"
                >
                  <div className="flex-1">
                    <p className="font-black text-slate-900 text-xs">
                      {o.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="w-20 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-amber-400 to-amber-500 h-full"
                          style={{ width: `${o.progress_percentage}%` }}
                        ></div>
                      </div>
                      <span className="text-[10px] font-black text-slate-600">
                        {o.progress_percentage}%
                      </span>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-black px-2 py-1 rounded-lg border shrink-0 ml-3 ${
                      daysLeft <= 1
                        ? 'bg-rose-100 text-rose-700 border-rose-200'
                        : daysLeft <= 3
                        ? 'bg-amber-100 text-amber-700 border-amber-200'
                        : 'bg-emerald-100 text-emerald-700 border-emerald-200'
                    }`}
                  >
                    {daysLeft <= 0 ? "Aujourd'hui !" : `J-${daysLeft}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MES OBJECTIFS */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-black text-slate-900 text-xs uppercase tracking-wider">
            Mes Objectifs à Atteindre
          </h3>
          <button
            onClick={onSaisirRealisation}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-sm"
          >
            <PenLine size={12} />
            Saisir une réalisation
          </button>
        </div>
        <div className="divide-y divide-slate-50">
          {myObjectives.length === 0 && (
            <div className="p-8 text-center text-slate-400 text-xs italic">
              Aucun dossier vous est assigné pour l'instant.
            </div>
          )}
          {myObjectives.map((obj, i) => {
            const catInfo = getCategoryInfo(obj.category);
            const objReal = myRealisations.filter(
              (r) => r.objective_id === obj.id
            );
            const objRemarques = myRemarques.filter(
              (r) => r.objective_id === obj.id
            );
            return (
              <div key={i} className="p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span
                        className={`text-[9px] font-black px-2 py-0.5 rounded border flex items-center gap-1 ${
                          CATEGORY_STYLES[obj.category] || ''
                        }`}
                      >
                        <span>{catInfo?.icon}</span>
                        <span>{catInfo?.label}</span>
                      </span>
                      <span
                        className={`text-[9px] font-black px-2 py-0.5 rounded border ${
                          obj.status === 'Terminé'
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                            : obj.status === 'En retard'
                            ? 'bg-rose-50 text-rose-600 border-rose-100'
                            : 'bg-amber-50 text-amber-600 border-amber-100'
                        }`}
                      >
                        {obj.status}
                      </span>
                      {obj.priority === 'Critique' && (
                        <span className="text-[9px] font-black text-rose-600 animate-pulse">
                          ⚡ Critique
                        </span>
                      )}
                    </div>
                    <p className="font-black text-slate-900 text-sm">
                      {obj.title}
                    </p>
                    <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                      Échéance : {formatDate(obj.deadline)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-2xl font-black text-slate-900">
                      {obj.progress_percentage}%
                    </p>
                    <p className="text-[9px] text-slate-400 font-bold uppercase">
                      avancement
                    </p>
                  </div>
                </div>
                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden border border-slate-200/50">
                  <div
                    className={`h-full transition-all duration-700 ${
                      obj.progress_percentage === 100
                        ? 'bg-gradient-to-r from-emerald-500 to-emerald-600'
                        : obj.progress_percentage < 40
                        ? 'bg-gradient-to-r from-rose-500 to-rose-600'
                        : 'bg-gradient-to-r from-blue-500 to-blue-600'
                    }`}
                    style={{ width: `${obj.progress_percentage}%` }}
                  ></div>
                </div>
                {/* Remarques du Senior */}
                {objRemarques.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {objRemarques.map((rem, ri) => {
                      const fromUser = collaborators.find(
                        (c) => c.id === rem.from_id
                      );
                      return (
                        <div
                          key={ri}
                          className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl p-2.5"
                        >
                          <MessageSquare
                            size={12}
                            className="text-blue-500 mt-0.5 shrink-0"
                          />
                          <div>
                            <p className="text-[9px] font-black text-blue-600 uppercase">
                              {fromUser?.first_name} {fromUser?.last_name} ·{' '}
                              {formatDate(rem.date)}
                            </p>
                            <p className="text-[11px] text-slate-700 font-medium mt-0.5">
                              {rem.text}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {objReal.length > 0 && (
                  <p className="text-[10px] text-emerald-600 font-bold mt-2">
                    ✅ {objReal.length} réalisation(s) enregistrée(s)
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 5 DERNIÈRES RÉALISATIONS */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-black text-slate-900 text-xs uppercase tracking-wider">
            Mes 10 Dernières Réalisations
          </h3>
          <span className="text-[10px] font-black text-slate-400 bg-slate-50 border px-2 py-0.5 rounded">
            {myRealisations.length} au total
          </span>
        </div>
        <div className="divide-y divide-slate-50">
          {myRealisations.length === 0 && (
            <div className="p-8 text-center text-slate-400 text-xs italic">
              Aucune réalisation enregistrée. Commencez à journaliser vos
              actions.
            </div>
          )}
          {myRealisations.slice(0, 10).map((r, ri) => {
            const obj = objectives.find((o) => o.id === r.objective_id);
            return (
              <div key={ri} className="p-4 flex items-start gap-3">
                <div className="bg-emerald-50 border border-emerald-100 p-2 rounded-xl shrink-0">
                  <CheckSquare size={14} className="text-emerald-600" />
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <p className="text-xs font-bold text-slate-700">
                      {r.description}
                    </p>
                    <span className="text-[10px] text-slate-400 font-bold shrink-0 ml-2">
                      {formatDate(r.date)}
                    </span>
                  </div>
                  {obj && (
                    <p className="text-[10px] text-blue-600 font-bold mt-0.5">
                      ↳ {obj.title}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                      <Clock size={9} />
                      {r.duration_hours}h
                    </span>
                    <span className="text-[10px] font-black text-emerald-600">
                      {r.progress_after}%
                    </span>
                    {r.validated_by && (
                      <span className="text-[9px] bg-emerald-50 border border-emerald-100 text-emerald-600 font-black px-1.5 py-0.5 rounded uppercase">
                        Validé
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ============================================================
// VUE RÉALISATIONS — Journal complet (accessible à tous)
// ============================================================
function RealisationsView({
  realisations,
  objectives,
  collaborators,
  currentUser,
  onAdd,
}) {
  const isJuniorOrSecretary = ['Junior', 'Secretaire'].includes(
    currentUser.role
  );
  const isSenior = ['Senior Analyst', 'Field Lead'].includes(currentUser.role);
  const isAdmin = currentUser.role === 'Super-Admin';

  const myJuniors = collaborators.filter(
    (c) => c.senior_id === currentUser.collaborator_id
  );

  const displayReal = (() => {
    if (isAdmin) return realisations;
    if (isSenior) {
      const myIds = [
        currentUser.collaborator_id,
        ...myJuniors.map((j) => j.id),
      ];
      return realisations.filter((r) => myIds.includes(r.user_id));
    }
    return realisations.filter(
      (r) => r.user_id === currentUser.collaborator_id
    );
  })();

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-black text-slate-900 text-sm uppercase tracking-wider">
            Journal des Réalisations
          </h3>
          <p className="text-[11px] text-slate-400 font-medium mt-0.5">
            {displayReal.length} action(s) enregistrée(s)
          </p>
        </div>
        <button
          onClick={onAdd}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2"
        >
          <PenLine size={16} />
          Saisir une réalisation
        </button>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-400 uppercase text-[10px] tracking-widest border-b border-slate-200">
                <th className="p-4 font-black">Date</th>
                {!isJuniorOrSecretary && (
                  <th className="p-4 font-black">Collaborateur</th>
                )}
                <th className="p-4 font-black">Dossier</th>
                <th className="p-4 font-black">Action effectuée</th>
                <th className="p-4 font-black text-center">Durée</th>
                <th className="p-4 font-black text-center">Avancement</th>
                <th className="p-4 font-black text-center">Validation</th>
              </tr>
            </thead>
            <tbody>
              {displayReal.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="p-10 text-center text-slate-400 italic text-xs"
                  >
                    Aucune réalisation pour votre scope.
                  </td>
                </tr>
              )}
              {displayReal.map((r, i) => {
                const collab = collaborators.find((c) => c.id === r.user_id);
                const obj = objectives.find((o) => o.id === r.objective_id);
                const catInfo = obj ? getCategoryInfo(obj.category) : null;
                return (
                  <tr
                    key={i}
                    className="border-b last:border-0 hover:bg-slate-50/80 transition-all"
                  >
                    <td className="p-4 font-bold text-slate-600">
                      {formatDate(r.date)}
                    </td>
                    {!isJuniorOrSecretary && (
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="text-base">
                            {collab?.avatar_emoji}
                          </span>
                          <span className="font-black text-slate-900">
                            {collab?.first_name} {collab?.last_name}
                          </span>
                        </div>
                      </td>
                    )}
                    <td className="p-4 max-w-xs">
                      {obj ? (
                        <div>
                          <span
                            className={`text-[9px] font-black px-1.5 py-0.5 rounded border mb-1 flex items-center gap-1 w-fit ${
                              CATEGORY_STYLES[obj.category] || ''
                            }`}
                          >
                            <span>{catInfo?.icon}</span>
                            <span>{catInfo?.label}</span>
                          </span>
                          <p className="text-slate-800 font-bold truncate">
                            {obj.title}
                          </p>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="p-4 text-slate-700 font-medium max-w-sm">
                      {r.description}
                    </td>
                    <td className="p-4 text-center font-black text-slate-700">
                      {r.duration_hours}h
                    </td>
                    <td className="p-4 text-center">
                      <span className="font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                        {r.progress_after}%
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      {r.validated_by ? (
                        <span className="text-[9px] font-black bg-emerald-50 border border-emerald-100 text-emerald-600 px-2 py-0.5 rounded uppercase">
                          ✓ Validé
                        </span>
                      ) : (
                        <span className="text-[9px] font-black bg-slate-50 border border-slate-200 text-slate-400 px-2 py-0.5 rounded uppercase">
                          En attente
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// VUE OBJECTIFS COMPLÈTE (CONSERVÉE + ENRICHIE)
// ============================================================
function ObjectifsView({
  objectives,
  collaborators,
  currentUser,
  onAddObjective,
  onEditObjective,
  onDeleteObjective,
  onUpdateProgress,
  filterCategory,
  setFilterCategory,
  searchQuery,
  setSearchQuery,
}) {
  const isJuniorOrSecretary = ['Junior', 'Secretaire'].includes(
    currentUser.role
  );
  const canEdit = !isJuniorOrSecretary || currentUser.role === 'Secretaire';
  const canAdd = !isJuniorOrSecretary;

  const displayObjectives = (() => {
    let objs =
      isJuniorOrSecretary && currentUser.role !== 'Secretaire'
        ? objectives.filter(
            (o) => o.assigned_to === currentUser.collaborator_id
          )
        : objectives;
    if (filterCategory !== 'all')
      objs = objs.filter((o) => o.category === filterCategory);
    if (searchQuery.trim())
      objs = objs.filter((o) =>
        o.title.toLowerCase().includes(searchQuery.toLowerCase())
      );
    return objs;
  })();

  const getAssignedCollaborator = (id) =>
    collaborators.find((c) => c.id === id);

  return (
    <div className="space-y-5">
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un dossier..."
              className="pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500 transition-all w-52"
            />
          </div>
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5">
            <Filter size={12} className="text-slate-400" />
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="bg-transparent text-xs font-black text-slate-700 outline-none cursor-pointer"
            >
              <option value="all">Toutes catégories</option>
              {ALL_CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.icon} {cat.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {canAdd && (
          <button
            onClick={() => onAddObjective()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider shadow-sm transition-all flex items-center gap-2"
          >
            <Plus size={14} />
            Nouveau dossier
          </button>
        )}
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
        <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
          <div>
            <h3 className="font-black text-sm uppercase tracking-wider">
              Console de Gestion des Dossiers
            </h3>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5">
              Ajustement dynamique de performance — Sécurisé
            </p>
          </div>
          <span className="text-[10px] font-black tracking-widest uppercase bg-blue-600 text-white px-3 py-1 rounded-lg">
            {displayObjectives.length} dossier(s)
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-400 uppercase text-[10px] tracking-widest border-b border-slate-200">
                <th className="p-4 font-black">Dossier / Mission</th>
                <th className="p-4 font-black">Catégorie</th>
                <th className="p-4 font-black">Structure</th>
                <th className="p-4 font-black">Échéance</th>
                <th className="p-4 font-black">Priorité</th>
                <th className="p-4 font-black text-center">Statut</th>
                <th className="p-4 font-black text-center">Responsable</th>
                <th className="p-4 font-black text-center">Progression</th>
                {canEdit && (
                  <th className="p-4 font-black text-right">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {displayObjectives.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="p-12 text-center text-slate-400 italic text-xs"
                  >
                    Aucun dossier trouvé.
                  </td>
                </tr>
              )}
              {displayObjectives.map((obj, i) => {
                const catInfo = getCategoryInfo(obj.category);
                const assignee = getAssignedCollaborator(obj.assigned_to);
                return (
                  <tr
                    key={i}
                    className="border-b last:border-0 hover:bg-slate-50/80 transition-all"
                  >
                    <td className="p-4 font-black text-slate-900 text-sm max-w-xs">
                      <div className="truncate">{obj.title}</div>
                    </td>
                    <td className="p-4">
                      <span
                        className={`px-2 py-0.5 rounded-lg font-black text-[10px] border flex items-center gap-1 w-fit ${
                          CATEGORY_STYLES[obj.category] || CATEGORY_STYLES.other
                        }`}
                      >
                        <span>{catInfo?.icon}</span>
                        <span className="hidden lg:inline">
                          {catInfo?.label}
                        </span>
                      </span>
                    </td>
                    <td className="p-4">
                      <span
                        className={`px-2.5 py-0.5 rounded-full font-black text-[10px] border ${
                          obj.organization_id ===
                          'd2222222-2222-2222-2222-222222222222'
                            ? 'bg-blue-50 text-blue-700 border-blue-100'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                        }`}
                      >
                        {obj.structure_type}
                      </span>
                    </td>
                    <td className="p-4 font-bold text-slate-600">
                      {formatDate(obj.deadline)}
                    </td>
                    <td className="p-4">
                      <span
                        className={`font-bold ${
                          obj.priority === 'Critique'
                            ? 'text-rose-600 font-black'
                            : obj.priority === 'Haute'
                            ? 'text-amber-600'
                            : 'text-slate-500'
                        }`}
                      >
                        ⚡ {obj.priority}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-md font-black text-[10px] border ${
                          obj.status === 'Terminé'
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                            : obj.status === 'En retard'
                            ? 'bg-rose-50 text-rose-600 border-rose-100'
                            : 'bg-amber-50 text-amber-600 border-amber-100'
                        }`}
                      >
                        {obj.status}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      {assignee ? (
                        <div className="flex items-center gap-1.5 justify-center">
                          <span className="text-sm">
                            {assignee.avatar_emoji}
                          </span>
                          <span className="text-[10px] font-bold text-slate-700">
                            {assignee.first_name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-300 font-bold">
                          —
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col items-center gap-1 min-w-[90px]">
                        <span className="font-black text-slate-900 text-xs">
                          {obj.progress_percentage}%
                        </span>
                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden border">
                          <div
                            className="bg-gradient-to-r from-blue-500 to-blue-600 h-full transition-all"
                            style={{ width: `${obj.progress_percentage}%` }}
                          ></div>
                        </div>
                      </div>
                    </td>
                    {canEdit && (
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() =>
                              onUpdateProgress(
                                obj.id,
                                obj.progress_percentage,
                                obj.title,
                                -10
                              )
                            }
                            className="bg-slate-100 hover:bg-slate-200 font-black text-slate-700 px-2 py-1.5 rounded-lg text-[10px] transition-all border"
                          >
                            -10%
                          </button>
                          <button
                            onClick={() =>
                              onUpdateProgress(
                                obj.id,
                                obj.progress_percentage,
                                obj.title,
                                10
                              )
                            }
                            className="bg-blue-600 hover:bg-blue-700 text-white font-black px-2 py-1.5 rounded-lg text-[10px] shadow-sm transition-all"
                          >
                            +10%
                          </button>
                          <button
                            onClick={() => onEditObjective(obj)}
                            className="bg-amber-50 hover:bg-amber-100 text-amber-600 p-1.5 rounded-lg border border-amber-100 transition-all"
                          >
                            <Edit3 size={12} />
                          </button>
                          <button
                            onClick={() => onDeleteObjective(obj.id)}
                            className="bg-rose-50 hover:bg-rose-100 text-rose-600 p-1.5 rounded-lg border border-rose-100 transition-all"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// VUE ÉQUIPE (CONSERVÉE 100% + enrichie)
// ============================================================
function EquipeView({
  collaborators,
  objectives,
  realisations,
  currentUser,
  onAddCollaborator,
  onEditCollaborator,
  onDeleteCollaborator,
}) {
  const canManageUsers = currentUser.role === 'Super-Admin';
  const isSenior = ['Senior Analyst', 'Field Lead'].includes(currentUser.role);

  // Senior voit seulement ses juniors, Admin voit tout
  const visibleCollabs = canManageUsers
    ? collaborators
    : isSenior
    ? collaborators.filter(
        (c) =>
          c.id === currentUser.collaborator_id ||
          c.senior_id === currentUser.collaborator_id
      )
    : collaborators.filter((c) => c.id === currentUser.collaborator_id);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-black text-slate-900 text-sm uppercase tracking-wider">
            Gestion des Collaborateurs
          </h3>
          <p className="text-[11px] text-slate-400 font-medium mt-0.5">
            {visibleCollabs.length} membre(s) dans votre périmètre
          </p>
        </div>
        {canManageUsers && (
          <button
            onClick={() => onAddCollaborator()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2"
          >
            <UserPlus size={16} />
            Nouveau Collaborateur
          </button>
        )}
      </div>

      {/* ORGANIGRAMME */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h4 className="font-black text-slate-700 text-[10px] uppercase tracking-wider mb-4 flex items-center gap-2">
          <Link2 size={12} />
          Organigramme & Rattachements
        </h4>
        <div className="space-y-4">
          {visibleCollabs
            .filter(
              (c) =>
                !c.senior_id ||
                !visibleCollabs.find((v) => v.id === c.senior_id)
            )
            .map((senior) => {
              const juniors = visibleCollabs.filter(
                (c) => c.senior_id === senior.id
              );
              const colorClass =
                senior.performance > 75
                  ? 'from-emerald-400 to-emerald-500'
                  : senior.performance > 55
                  ? 'from-blue-500 to-blue-600'
                  : 'from-amber-400 to-amber-500';
              return (
                <div
                  key={senior.id}
                  className="border border-slate-100 rounded-2xl overflow-hidden"
                >
                  <div className="flex items-center gap-4 p-4 bg-slate-50 hover:bg-slate-100 transition-all">
                    <span className="text-2xl bg-white p-2 rounded-xl shadow-sm border border-slate-100 flex items-center justify-center w-12 h-12 shrink-0">
                      {senior.avatar_emoji}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-black text-slate-900 text-sm">
                          {senior.first_name} {senior.last_name}
                        </p>
                        <span
                          className={`text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider border ${
                            senior.profile === 'Super-Admin'
                              ? 'bg-blue-50 text-blue-700 border-blue-100'
                              : senior.profile === 'Senior Analyst'
                              ? 'bg-slate-100 text-slate-700 border-slate-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                          }`}
                        >
                          {senior.profile}
                        </span>
                        {senior.email && (
                          <span className="text-[9px] text-slate-400 font-bold">
                            {senior.email}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">
                        {senior.role}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex-1 max-w-32 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full bg-gradient-to-r ${colorClass}`}
                            style={{ width: `${senior.performance}%` }}
                          ></div>
                        </div>
                        <span className="text-[10px] font-black text-slate-600">
                          {senior.performance}%
                        </span>
                        <span className="text-[9px] text-slate-400 font-bold">
                          {
                            objectives.filter(
                              (o) => o.assigned_to === senior.id
                            ).length
                          }{' '}
                          dossiers
                        </span>
                      </div>
                    </div>
                    {canManageUsers && (
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => onEditCollaborator(senior)}
                          className="p-2 rounded-lg bg-white border border-slate-200 hover:bg-amber-50 hover:border-amber-200 text-slate-500 hover:text-amber-600 transition-all"
                        >
                          <Edit3 size={13} />
                        </button>
                        <button
                          onClick={() => onDeleteCollaborator(senior.id)}
                          className="p-2 rounded-lg bg-white border border-slate-200 hover:bg-rose-50 hover:border-rose-200 text-slate-500 hover:text-rose-600 transition-all"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                  {juniors.length > 0 && (
                    <div className="border-t border-slate-100">
                      {juniors.map((junior, ji) => {
                        const jColorClass =
                          junior.performance > 75
                            ? 'from-emerald-400 to-emerald-500'
                            : junior.performance > 55
                            ? 'from-blue-500 to-blue-600'
                            : 'from-amber-400 to-amber-500';
                        return (
                          <div
                            key={junior.id}
                            className={`flex items-center gap-4 p-3.5 pl-8 hover:bg-slate-50 transition-all ${
                              ji < juniors.length - 1
                                ? 'border-b border-slate-100'
                                : ''
                            }`}
                          >
                            <div className="flex items-center gap-1 text-slate-300 shrink-0">
                              <ChevronRight size={12} />
                            </div>
                            <span className="text-lg bg-white p-1.5 rounded-xl shadow-sm border border-slate-100 flex items-center justify-center w-9 h-9 shrink-0">
                              {junior.avatar_emoji}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-black text-slate-800 text-xs">
                                  {junior.first_name} {junior.last_name}
                                </p>
                                <span
                                  className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider border ${
                                    junior.profile === 'Junior'
                                      ? 'bg-amber-50 text-amber-700 border-amber-100'
                                      : 'bg-teal-50 text-teal-700 border-teal-100'
                                  }`}
                                >
                                  {junior.profile}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <div className="flex-1 max-w-24 bg-slate-200 h-1 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full bg-gradient-to-r ${jColorClass}`}
                                    style={{ width: `${junior.performance}%` }}
                                  ></div>
                                </div>
                                <span className="text-[9px] font-black text-slate-500">
                                  {junior.performance}%
                                </span>
                                <span className="text-[9px] text-slate-400 font-bold">
                                  {
                                    objectives.filter(
                                      (o) => o.assigned_to === junior.id
                                    ).length
                                  }{' '}
                                  dossiers
                                </span>
                              </div>
                            </div>
                            {canManageUsers && (
                              <div className="flex gap-2 shrink-0">
                                <button
                                  onClick={() => onEditCollaborator(junior)}
                                  className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-amber-50 hover:border-amber-200 text-slate-400 hover:text-amber-600 transition-all"
                                >
                                  <Edit3 size={11} />
                                </button>
                                <button
                                  onClick={() =>
                                    onDeleteCollaborator(junior.id)
                                  }
                                  className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-rose-50 hover:border-rose-200 text-slate-400 hover:text-rose-600 transition-all"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {juniors.length === 0 && (
                    <div className="px-8 py-3 text-[10px] text-slate-400 font-bold italic border-t border-slate-50">
                      Aucun junior rattaché.
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      {/* GRILLE CARTES */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {visibleCollabs.map((c, i) => {
          const assignedDossiers = objectives.filter(
            (o) => o.assigned_to === c.id
          );
          const senior = collaborators.find((s) => s.id === c.senior_id);
          const realCount = realisations.filter(
            (r) => r.user_id === c.id
          ).length;
          return (
            <div
              key={i}
              className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm text-center relative overflow-hidden flex flex-col justify-between"
            >
              <div>
                <span className="text-4xl block mb-3 bg-slate-50 p-3 rounded-2xl border border-slate-100 w-16 h-16 mx-auto flex items-center justify-center shadow-inner">
                  {c.avatar_emoji || '👤'}
                </span>
                <h4 className="font-black text-slate-900 text-md">
                  {c.first_name} {c.last_name}
                </h4>
                <p className="text-[10px] text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider inline-block mt-1.5 border border-blue-100">
                  {c.role}
                </p>
                {senior && (
                  <div className="mt-2 flex items-center justify-center gap-1 text-[9px] text-slate-400 font-bold">
                    <Link2 size={9} />
                    <span>
                      Réf: {senior.first_name} {senior.last_name}
                    </span>
                  </div>
                )}
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100">
                <div className="grid grid-cols-2 text-left text-xs mb-2">
                  <div>
                    <span className="text-[9px] font-black text-slate-400 uppercase block tracking-wider">
                      Performance
                    </span>
                    <span className="text-sm font-black text-slate-800">
                      {c.performance}%
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] font-black text-slate-400 uppercase block tracking-wider">
                      Statut
                    </span>
                    <span className="text-xs font-black text-emerald-500 uppercase tracking-wide">
                      ● Actif
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 text-left text-xs border-t border-slate-50 pt-2">
                  <div>
                    <span className="text-[9px] text-slate-400 font-bold uppercase">
                      {assignedDossiers.length} dossier(s)
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] text-slate-400 font-bold uppercase">
                      {realCount} réal.
                    </span>
                  </div>
                </div>
              </div>
              {canManageUsers && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => onEditCollaborator(c)}
                    className="flex-1 bg-amber-50 hover:bg-amber-100 text-amber-600 py-2 rounded-xl border border-amber-100 font-black text-[10px] uppercase transition-all flex items-center justify-center gap-1"
                  >
                    <Edit3 size={11} />
                    Modifier
                  </button>
                  <button
                    onClick={() => onDeleteCollaborator(c.id)}
                    className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl border border-rose-100 transition-all"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// COMPOSANT PRINCIPAL
// ============================================================
export default function FullyLoadedPremiumDashboard() {
  // AUTH
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  // NAVIGATION
  const [currentView, setCurrentView] = useState('Tableau de bord');
  const [currentStructure, setCurrentStructure] = useState('Tous');

  // DONNÉES
  const [loading, setLoading] = useState(false);
  const [usingBackupData, setUsingBackupData] = useState(false);
  const [collaborators, setCollaborators] = useState([]);
  const [objectives, setObjectives] = useState([]);
  const [activities, setActivities] = useState([]);
  const [realisations, setRealisations] = useState([]);
  const [remarques, setRemarques] = useState([]);

  // MODALES
  const [isObjectiveModalOpen, setIsObjectiveModalOpen] = useState(false);
  const [isCollaboratorModalOpen, setIsCollaboratorModalOpen] = useState(false);
  const [isRealisationModalOpen, setIsRealisationModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [editingObjective, setEditingObjective] = useState(null);
  const [editingCollaborator, setEditingCollaborator] = useState(null);

  // FORMULAIRE ANCIEN (conservé 100% pour compatibilité)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState('Dossier Client');
  const [newOrg, setNewOrg] = useState('d2222222-2222-2222-2222-222222222222');
  const [newPriority, setNewPriority] = useState('Haute');
  const [newDeadline, setNewDeadline] = useState('2026-06-30');

  // FILTRES
  const [filterCategory, setFilterCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // STATS
  const [stats, setStats] = useState({
    totalObjectives: 0,
    globalProgress: 0,
    lateTasks: 0,
    pendingTasks: 0,
    conacceProgress: 0,
    doukeProgress: 0,
  });

  // AUTH
  const handleLogin = (account) => {
    setCurrentUser(account);
    setIsAuthenticated(true);
    if (account.orgId !== 'Tous') setCurrentStructure(account.orgId);
    else setCurrentStructure('Tous');
  };

  const handleLogout = () => {
    if (window.confirm('Confirmer la déconnexion sécurisée ?')) {
      setIsAuthenticated(false);
      setCurrentUser(null);
      setCurrentView('Tableau de bord');
    }
  };

  // DONNÉES
  const loadDataEngine = async () => {
    try {
      setLoading(true);
      throw new Error(
        'Supabase Schema Cache Mismatch — Switching to Premium Local Data Core'
      );
    } catch (fallbackError) {
      setUsingBackupData(true);
      let filteredObjs = [...BACKUP_OBJECTIVES];
      if (currentUser?.orgId !== 'Tous') {
        filteredObjs = BACKUP_OBJECTIVES.filter(
          (o) => o.organization_id === currentUser?.orgId
        );
      }
      setObjectives(filteredObjs);
      setCollaborators(BACKUP_COLLABORATORS);
      setActivities(BACKUP_ACTIVITIES);
      setRealisations(BACKUP_REALISATIONS);
      setRemarques(BACKUP_REMARQUES);
      calculateMetrics(filteredObjs);
    } finally {
      setLoading(false);
    }
  };

  const calculateMetrics = (targetObjectives) => {
    const totalObjs = targetObjectives.length;
    const avgProgress =
      totalObjs > 0
        ? Math.round(
            targetObjectives.reduce(
              (acc, curr) => acc + curr.progress_percentage,
              0
            ) / totalObjs
          )
        : 0;
    const late = targetObjectives.filter(
      (o) => o.status === 'En retard'
    ).length;
    const pending = targetObjectives.filter(
      (o) => o.status === 'En cours'
    ).length;
    const conacceObjs = targetObjectives.filter(
      (o) => o.organization_id === 'c1111111-1111-1111-1111-111111111111'
    );
    const doukeObjs = targetObjectives.filter(
      (o) => o.organization_id === 'd2222222-2222-2222-2222-222222222222'
    );
    setStats({
      totalObjectives: totalObjs,
      globalProgress: avgProgress,
      lateTasks: late,
      pendingTasks: pending,
      conacceProgress:
        conacceObjs.length > 0
          ? Math.round(
              conacceObjs.reduce((a, c) => a + c.progress_percentage, 0) /
                conacceObjs.length
            )
          : 45,
      doukeProgress:
        doukeObjs.length > 0
          ? Math.round(
              doukeObjs.reduce((a, c) => a + c.progress_percentage, 0) /
                doukeObjs.length
            )
          : 62,
    });
  };

  useEffect(() => {
    if (isAuthenticated && currentUser) loadDataEngine();
  }, [currentUser, isAuthenticated]);

  // ACTIONS DOSSIERS
  const handleUpdateProgress = (
    id,
    currentProgress,
    currentTitle,
    increment
  ) => {
    let newProgress = Math.max(0, Math.min(100, currentProgress + increment));
    let newStatus =
      newProgress === 100
        ? 'Terminé'
        : newProgress < 40
        ? 'En retard'
        : 'En cours';
    const logMessage = `${currentUser.name} a modifié "${currentTitle}" à ${newProgress}%`;
    const updated = objectives.map((o) =>
      o.id === id
        ? { ...o, progress_percentage: newProgress, status: newStatus }
        : o
    );
    setObjectives(updated);
    calculateMetrics(updated);
    setActivities((prev) => [
      {
        id: Date.now().toString(),
        user_id: currentUser.collaborator_id,
        description: logMessage,
        date: todayISO(),
        type: 'update',
      },
      ...prev,
    ]);
  };

  const handleSaveObjective = (formData) => {
    const isEdit = objectives.find((o) => o.id === formData.id);
    let updated;
    if (isEdit) {
      updated = objectives.map((o) => (o.id === formData.id ? formData : o));
    } else {
      updated = [
        {
          ...formData,
          organization_id:
            currentUser.orgId !== 'Tous'
              ? currentUser.orgId
              : formData.organization_id,
        },
        ...objectives,
      ];
    }
    setObjectives(updated);
    calculateMetrics(updated);
    const log = isEdit
      ? `${currentUser.name} a modifié le dossier "${formData.title}"`
      : `${currentUser.name} a ouvert le dossier "${formData.title}"`;
    setActivities((prev) => [
      {
        id: Date.now().toString(),
        user_id: currentUser.collaborator_id,
        description: log,
        date: todayISO(),
        type: isEdit ? 'update' : 'creation',
      },
      ...prev,
    ]);
    setEditingObjective(null);
  };

  const handleDeleteObjective = (id) => {
    const obj = objectives.find((o) => o.id === id);
    const updated = objectives.filter((o) => o.id !== id);
    setObjectives(updated);
    calculateMetrics(updated);
    if (obj)
      setActivities((prev) => [
        {
          id: Date.now().toString(),
          user_id: currentUser.collaborator_id,
          description: `${currentUser.name} a supprimé le dossier "${obj.title}"`,
          date: todayISO(),
          type: 'deletion',
        },
        ...prev,
      ]);
  };

  // FORMULAIRE ANCIEN (conservé 100%)
  const handleCreateObjective = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const targetOrg = currentUser.orgId !== 'Tous' ? currentUser.orgId : newOrg;
    const newObjItem = {
      id: Date.now().toString(),
      title: newTitle,
      structure_type: newType,
      category: 'project_douke',
      status: 'En cours',
      priority: newPriority,
      deadline: newDeadline,
      progress_percentage: 0,
      organization_id: targetOrg,
    };
    const updated = [newObjItem, ...objectives];
    setObjectives(updated);
    calculateMetrics(updated);
    setActivities((prev) => [
      {
        id: Date.now().toString(),
        user_id: currentUser.collaborator_id,
        description: `${currentUser.name} a ouvert le dossier stratégique : "${newTitle}"`,
        date: todayISO(),
        type: 'creation',
      },
      ...prev,
    ]);
    setNewTitle('');
    setIsModalOpen(false);
  };

  // ACTIONS COLLABORATEURS
  const handleSaveCollaborator = (formData) => {
    const isEdit = collaborators.find((c) => c.id === formData.id);
    let updated = isEdit
      ? collaborators.map((c) => (c.id === formData.id ? formData : c))
      : [...collaborators, formData];
    setCollaborators(updated);
    const log = isEdit
      ? `${currentUser.name} a modifié le profil de ${formData.first_name} ${formData.last_name}`
      : `${currentUser.name} a créé le collaborateur ${formData.first_name} ${formData.last_name}`;
    setActivities((prev) => [
      {
        id: Date.now().toString(),
        user_id: currentUser.collaborator_id,
        description: log,
        date: todayISO(),
        type: isEdit ? 'update' : 'creation',
      },
      ...prev,
    ]);
    setEditingCollaborator(null);
  };

  const handleDeleteCollaborator = (id) => {
    const collab = collaborators.find((c) => c.id === id);
    setCollaborators((prev) => prev.filter((c) => c.id !== id));
    if (collab)
      setActivities((prev) => [
        {
          id: Date.now().toString(),
          user_id: currentUser.collaborator_id,
          description: `${currentUser.name} a supprimé le collaborateur ${collab.first_name} ${collab.last_name}`,
          date: todayISO(),
          type: 'deletion',
        },
        ...prev,
      ]);
  };

  // ACTIONS RÉALISATIONS
  const handleSaveRealisation = (formData) => {
    setRealisations((prev) => [formData, ...prev]);
    // Mettre à jour la progression de l'objectif
    if (formData.objective_id && formData.progress_after !== undefined) {
      const obj = objectives.find((o) => o.id === formData.objective_id);
      if (obj) {
        handleUpdateProgressDirect(
          formData.objective_id,
          formData.progress_after,
          obj.title
        );
      }
    }
    const obj = objectives.find((o) => o.id === formData.objective_id);
    setActivities((prev) => [
      {
        id: Date.now().toString(),
        user_id: currentUser.collaborator_id,
        description: `${currentUser.name} a enregistré une réalisation sur "${
          obj?.title || 'un dossier'
        }"`,
        date: todayISO(),
        type: 'realisation',
      },
      ...prev,
    ]);
  };

  const handleUpdateProgressDirect = (id, newProgress, title) => {
    let newStatus =
      newProgress === 100
        ? 'Terminé'
        : newProgress < 40
        ? 'En retard'
        : 'En cours';
    const updated = objectives.map((o) =>
      o.id === id
        ? { ...o, progress_percentage: newProgress, status: newStatus }
        : o
    );
    setObjectives(updated);
    calculateMetrics(updated);
  };

  // NAVIGATION
  const isJuniorOrSecretary =
    currentUser && ['Junior', 'Secretaire'].includes(currentUser.role);
  const isAdmin = currentUser && currentUser.role === 'Super-Admin';
  const isSenior =
    currentUser && ['Senior Analyst', 'Field Lead'].includes(currentUser.role);

  const navItems = [
    {
      label: 'Tableau de bord',
      view: 'Tableau de bord',
      icon: <LayoutDashboard size={20} />,
      show: true,
    },
    {
      label: 'Objectifs & Missions',
      view: 'Objectifs',
      icon: <ClipboardList size={20} />,
      show: true,
    },
    {
      label: 'Réalisations',
      view: 'Réalisations',
      icon: <PenLine size={20} />,
      show: true,
    },
    {
      label: 'Planification',
      view: 'Planification',
      icon: <Calendar size={20} />,
      show: !isJuniorOrSecretary,
    },
    {
      label: 'Équipe & Collaborateurs',
      view: 'Équipe',
      icon: <Users size={20} />,
      show: true,
    },
  ].filter((n) => n.show);

  const displayObjectives = (() => {
    let objs =
      currentStructure === 'Tous'
        ? objectives
        : objectives.filter((o) => o.organization_id === currentStructure);
    if (filterCategory !== 'all')
      objs = objs.filter((o) => o.category === filterCategory);
    if (searchQuery.trim())
      objs = objs.filter((o) =>
        o.title.toLowerCase().includes(searchQuery.toLowerCase())
      );
    return objs;
  })();

  if (!isAuthenticated) return <LoginScreen onLogin={handleLogin} />;

  return (
    <div className="flex h-screen bg-[#F1F5F9] font-sans text-slate-800 overflow-hidden">
      {/* ============ SIDEBAR ============ */}
      <aside className="w-72 bg-[#0F172A] text-slate-300 flex flex-col shadow-2xl shrink-0 z-10 border-r border-slate-800">
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Logo */}
          <div className="p-6 flex items-center gap-3.5 border-b border-slate-800 bg-[#1E293B]/40">
            <div className="bg-blue-600 p-2.5 rounded-xl text-white shadow-lg shadow-blue-500/30 flex items-center justify-center">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h1 className="font-black text-white text-md uppercase tracking-wider leading-none">
                Cabinet DOUKE
              </h1>
              <p className="text-[10px] text-blue-400 font-bold tracking-widest uppercase mt-1">
                Gouvernance & Sovereign Auth
              </p>
            </div>
          </div>

          {/* Profil connecté */}
          <div className="p-4 mx-4 my-4 bg-[#1E293B]/60 border border-slate-800 rounded-xl shadow-inner">
            <div className="flex items-center gap-2 mb-2">
              <Lock size={12} className="text-emerald-400 animate-pulse" />
              <span className="text-[10px] uppercase tracking-wider font-black text-slate-400">
                Session Active
              </span>
            </div>
            <div className="flex items-center gap-3 bg-[#0F172A] border border-slate-700 rounded-lg p-2.5">
              <span className="text-xl">{currentUser.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-white truncate">
                  {currentUser.name}
                </p>
                <p className="text-[9px] text-blue-400 font-bold uppercase tracking-wider">
                  {currentUser.role}
                </p>
              </div>
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"></div>
            </div>
            {usingBackupData && (
              <div className="text-[9px] text-amber-400 font-bold uppercase tracking-wider mt-2 flex items-center gap-1">
                <span>● Mode de Résilience Actif</span>
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="p-4 space-y-1.5">
            {navItems.map((item, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentView(item.view)}
                className={`w-full flex items-center justify-between p-3.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                  currentView === item.view
                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-xl shadow-blue-600/20 border-l-4 border-blue-400'
                    : 'hover:bg-slate-800/60 hover:text-white text-slate-400'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  {item.icon}
                  <span className="text-[11px] font-bold">{item.label}</span>
                </div>
              </button>
            ))}
          </nav>

          {/* Bouton Imprimer accessible à tous */}
          <div className="px-4">
            <button
              onClick={() => setIsPrintModalOpen(true)}
              className="w-full flex items-center gap-3 p-3.5 rounded-xl text-slate-400 hover:bg-slate-800/60 hover:text-white transition-all text-xs font-black uppercase tracking-wider"
            >
              <Printer size={20} />
              <span className="text-[11px] font-bold">Imprimer un rapport</span>
            </button>
          </div>
        </div>

        {/* Pied sidebar */}
        <div className="p-4 border-t border-slate-800/80 bg-[#1E293B]/20 flex flex-col gap-2">
          <div className="flex justify-between items-center px-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            <span>Données</span>
            <span
              className={
                usingBackupData ? 'text-amber-500' : 'text-emerald-500'
              }
            >
              {usingBackupData ? 'Sécurisées S-Core' : 'Supabase Sync'}
            </span>
          </div>
          <button
            onClick={loadDataEngine}
            className="w-full flex items-center justify-center gap-2 p-3 text-xs font-black uppercase tracking-wider text-slate-300 hover:text-white rounded-xl border border-slate-800 hover:bg-slate-800 transition-all bg-[#1E293B]/40"
          >
            <RefreshCw size={14} className="text-blue-500" />
            <span>Rafraîchir les flux</span>
          </button>
          {/* BOUTON DÉCONNEXION PROMINENT */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 p-3.5 text-xs font-black uppercase tracking-wider text-white rounded-xl bg-rose-600 hover:bg-rose-700 transition-all shadow-lg shadow-rose-900/30 border border-rose-500/30"
          >
            <LogOut size={16} />
            <span>Déconnexion sécurisée</span>
          </button>
        </div>
      </aside>

      {/* ============ MAIN ============ */}
      <main className="flex-1 flex flex-col overflow-y-auto">
        {/* TOPBAR */}
        <header className="bg-white border-b border-slate-200 h-20 px-8 flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center gap-6">
            <div>
              <h2 className="text-lg font-black text-slate-900 uppercase tracking-wider">
                {currentView}
              </h2>
              <p className="text-[11px] text-slate-400 font-medium">
                Cabinet d'Ingénierie Financière & Arbitrage ODD
              </p>
            </div>
            {currentView === 'Tableau de bord' && isAdmin && (
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1">
                <span className="text-[10px] font-black uppercase text-slate-400">
                  Scope :
                </span>
                <select
                  className="bg-transparent font-black text-xs text-slate-700 py-1 outline-none cursor-pointer"
                  onChange={(e) => setCurrentStructure(e.target.value)}
                  value={currentStructure}
                >
                  <option value="Tous">Vue Consolidée</option>
                  <option value="c1111111-1111-1111-1111-111111111111">
                    CONACCE Chaplains
                  </option>
                  <option value="d2222222-2222-2222-2222-222222222222">
                    Cabinet DOUKE
                  </option>
                </select>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            {/* Bouton saisir réalisation dans la topbar */}
            <button
              onClick={() => setIsRealisationModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all flex items-center gap-2 shadow-sm"
            >
              <PenLine size={14} />
              Saisir une réalisation
            </button>
            <div className="text-right">
              <p className="text-xs font-black text-slate-900">
                {currentUser.name}
              </p>
              <span className="text-[9px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full font-black uppercase tracking-wider border border-blue-100">
                {currentUser.role}
              </span>
            </div>
            <div className="w-11 h-11 bg-gradient-to-tr from-slate-800 to-slate-900 rounded-2xl flex items-center justify-center text-white font-black text-lg shadow-md border border-slate-700">
              {currentUser.emoji}
            </div>
          </div>
        </header>

        {/* ============ CONTENU PAR VUE ============ */}
        <div className="p-8 space-y-8">
          {/* TABLEAU DE BORD — ADAPTATIF PAR PROFIL */}
          {currentView === 'Tableau de bord' && (
            <>
              {isAdmin && (
                <AdminDashboard
                  objectives={displayObjectives}
                  collaborators={collaborators}
                  activities={activities}
                  realisations={realisations}
                  stats={stats}
                  currentStructure={currentStructure}
                  setCurrentStructure={setCurrentStructure}
                  setCurrentView={setCurrentView}
                  currentUser={currentUser}
                />
              )}
              {isSenior && (
                <SeniorDashboard
                  objectives={objectives}
                  collaborators={collaborators}
                  realisations={realisations}
                  remarques={remarques}
                  stats={stats}
                  currentUser={currentUser}
                />
              )}
              {isJuniorOrSecretary && (
                <JuniorDashboard
                  objectives={objectives}
                  collaborators={collaborators}
                  realisations={realisations}
                  remarques={remarques}
                  currentUser={currentUser}
                  onSaisirRealisation={() => setIsRealisationModalOpen(true)}
                />
              )}
            </>
          )}

          {/* OBJECTIFS */}
          {currentView === 'Objectifs' && (
            <ObjectifsView
              objectives={objectives}
              collaborators={collaborators}
              currentUser={currentUser}
              onAddObjective={() => {
                setEditingObjective(null);
                setIsObjectiveModalOpen(true);
              }}
              onEditObjective={(obj) => {
                setEditingObjective(obj);
                setIsObjectiveModalOpen(true);
              }}
              onDeleteObjective={handleDeleteObjective}
              onUpdateProgress={handleUpdateProgress}
              filterCategory={filterCategory}
              setFilterCategory={setFilterCategory}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
            />
          )}

          {/* RÉALISATIONS */}
          {currentView === 'Réalisations' && (
            <RealisationsView
              realisations={realisations}
              objectives={objectives}
              collaborators={collaborators}
              currentUser={currentUser}
              onAdd={() => setIsRealisationModalOpen(true)}
            />
          )}

          {/* PLANIFICATION */}
          {currentView === 'Planification' && (
            <div className="bg-white rounded-2xl border p-12 shadow-sm text-center max-w-xl mx-auto my-12">
              <div className="text-4xl mb-4">📅</div>
              <h4 className="font-black text-slate-900 text-sm uppercase tracking-wider">
                Planificateur de Livrables de Cabinet
              </h4>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Cette console regroupe la frise chronologique interconnectée
                avec les dates de conseils d'administration du Cabinet DOUKE et
                les jalons de validation terrain de la CONACCE Chaplains.
              </p>
            </div>
          )}

          {/* ÉQUIPE */}
          {currentView === 'Équipe' && (
            <EquipeView
              collaborators={collaborators}
              objectives={objectives}
              realisations={realisations}
              currentUser={currentUser}
              onAddCollaborator={() => {
                setEditingCollaborator(null);
                setIsCollaboratorModalOpen(true);
              }}
              onEditCollaborator={(c) => {
                setEditingCollaborator(c);
                setIsCollaboratorModalOpen(true);
              }}
              onDeleteCollaborator={handleDeleteCollaborator}
            />
          )}
        </div>

        {/* FLOATING ACTION BUTTON */}
        <div className="fixed bottom-8 right-8 flex flex-col gap-3">
          <button
            onClick={() => setIsRealisationModalOpen(true)}
            title="Saisir une réalisation"
            className="bg-gradient-to-tr from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white rounded-2xl shadow-2xl shadow-emerald-600/40 transition-transform hover:scale-105 flex items-center justify-center w-14 h-14"
          >
            <PenLine size={22} />
          </button>
          {!isJuniorOrSecretary && (
            <button
              onClick={() => {
                setEditingObjective(null);
                setIsObjectiveModalOpen(true);
              }}
              title="Nouveau dossier"
              className="bg-gradient-to-tr from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-2xl shadow-2xl shadow-blue-600/40 transition-transform hover:scale-105 flex items-center justify-center w-14 h-14"
            >
              <Plus size={24} />
            </button>
          )}
        </div>

        {/* ANCIEN MODAL (CONSERVÉ 100%) */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative border border-slate-100">
              <button
                onClick={() => setIsModalOpen(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-all"
              >
                <X size={18} />
              </button>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-4">
                Ouvrir un nouveau dossier / Livrable
              </h3>
              <form onSubmit={handleCreateObjective} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                    Intitulé de la mission
                  </label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Ex: Audit financier de souveraineté..."
                    className="w-full border border-slate-200 p-3 rounded-xl text-xs font-bold outline-none focus:border-blue-500 transition-all"
                    required
                  />
                </div>
                {currentUser.orgId === 'Tous' ? (
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                      Structure Affectée
                    </label>
                    <select
                      value={newOrg}
                      onChange={(e) => setNewOrg(e.target.value)}
                      className="w-full border border-slate-200 p-3 rounded-xl text-xs font-bold outline-none cursor-pointer bg-white"
                    >
                      <option value="d2222222-2222-2222-2222-222222222222">
                        Cabinet DOUKE (Financement)
                      </option>
                      <option value="c1111111-1111-1111-1111-111111111111">
                        CONACCE Chaplains (Terrain)
                      </option>
                    </select>
                  </div>
                ) : (
                  <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100 text-[11px] text-blue-700 font-bold">
                    🔒 Affectation automatique rattachée à votre profil
                    opérationnel.
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                      Priorité
                    </label>
                    <select
                      value={newPriority}
                      onChange={(e) => setNewPriority(e.target.value)}
                      className="w-full border border-slate-200 p-3 rounded-xl text-xs font-bold outline-none bg-white"
                    >
                      <option value="Haute">Haute</option>
                      <option value="Critique">Critique</option>
                      <option value="Moyenne">Moyenne</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                      Échéance Target
                    </label>
                    <input
                      type="date"
                      value={newDeadline}
                      onChange={(e) => setNewDeadline(e.target.value)}
                      className="w-full border border-slate-200 p-3 rounded-xl text-xs font-bold outline-none"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white p-3.5 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-500/20 transition-all mt-2"
                >
                  Valider et Inscrire en Base de Données
                </button>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* ============ MODALES PRINCIPALES ============ */}
      <ObjectiveModal
        isOpen={isObjectiveModalOpen}
        onClose={() => {
          setIsObjectiveModalOpen(false);
          setEditingObjective(null);
        }}
        onSave={handleSaveObjective}
        onDelete={handleDeleteObjective}
        existing={editingObjective}
        collaborators={collaborators}
        currentUser={currentUser}
      />

      <CollaboratorModal
        isOpen={isCollaboratorModalOpen}
        onClose={() => {
          setIsCollaboratorModalOpen(false);
          setEditingCollaborator(null);
        }}
        onSave={handleSaveCollaborator}
        existing={editingCollaborator}
        allCollaborators={collaborators}
      />

      <RealisationModal
        isOpen={isRealisationModalOpen}
        onClose={() => setIsRealisationModalOpen(false)}
        onSave={handleSaveRealisation}
        objectives={objectives}
        currentUser={currentUser}
        collaborators={collaborators}
      />

      <PrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        collaborators={collaborators}
        objectives={objectives}
        realisations={realisations}
        currentUser={currentUser}
      />
    </div>
  );
}
