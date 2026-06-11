'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  LayoutDashboard, ClipboardList, Calendar, Users, ShieldCheck,
  Plus, RefreshCw, X, AlertCircle, CheckCircle2, UserCheck, Lock,
  Landmark, Briefcase, FileText, ArrowUpRight, LogOut, Eye, EyeOff,
  Trash2, Edit3, UserPlus, Link2, ChevronRight, FolderOpen, Save,
  Search, Filter, Printer, PenLine, Clock, MessageSquare, CheckSquare,
  CalendarRange,
} from 'lucide-react';

// ============================================================
// SUPABASE CLIENT
// ============================================================
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ============================================================
// TYPES
// ============================================================
type Category = {
  id: string;
  label: string;
  icon: string;
  color: string;
  description: string;
};

type Objective = {
  id: string;
  title: string;
  structure_type: string;
  category: string;
  status: string;
  priority: string;
  deadline: string;
  progress_percentage: number;
  organization_id: string;
  assigned_to: string;
};

type Collaborator = {
  id: string;
  first_name: string;
  last_name: string;
  avatar_emoji: string;
  role: string;
  profile: string;
  performance: number;
  organization_id: string;
  senior_id: string | null;
  email: string;
};

type Activity = {
  id: string;
  user_id: string;
  description: string;
  date: string;
  type: string;
};

type Realisation = {
  id: string;
  user_id: string;
  objective_id: string;
  description: string;
  date: string;
  duration_hours: number;
  progress_after: number;
  validated_by: string | null;
};

type Remarque = {
  id: string;
  from_id: string;
  to_id: string;
  objective_id: string;
  text: string;
  date: string;
};

type AuthAccount = {
  id: string;
  username: string;
  password: string;
  name: string;
  role: string;
  orgId: string;
  emoji: string;
  collaborator_id: string;
  color: string;
};

// ============================================================
// CATÉGORIES
// ============================================================
const DOSSIER_CATEGORIES_DOUKE: Category[] = [
  { id: 'project_douke', label: 'Projet Stratégique', icon: '🏗️', color: 'blue', description: 'Projets multi-partenaires à horizon long terme' },
  { id: 'client_file', label: 'Dossier Client', icon: '🤝', color: 'emerald', description: 'Dossiers actifs de clients et mandants' },
  { id: 'comptabilite', label: 'Comptabilité', icon: '📒', color: 'teal', description: 'Tenue journalière, états financiers, bilans' },
  { id: 'fiscal', label: 'Fiscal & Social', icon: '🧾', color: 'orange', description: 'Déclarations fiscales, sociales, TVA, IS' },
  { id: 'financement', label: 'Recherche Financement', icon: '💰', color: 'yellow', description: 'Mobilisation de fonds, bailleurs, PPP' },
  { id: 'audit', label: 'Audit & Contrôle', icon: '🔍', color: 'purple', description: "Missions d'audit, vérification, reporting" },
  { id: 'formation', label: 'Formation & Conseil', icon: '🎓', color: 'pink', description: 'Programmes de formation et capacity building' },
  { id: 'admin', label: 'Administratif', icon: '📋', color: 'amber', description: 'Gestion interne, RH, conformité' },
  { id: 'other', label: 'Autre Mission', icon: '📁', color: 'slate', description: 'Missions diverses non classifiées' },
];

const DOSSIER_CATEGORIES_CONACCE: Category[] = [
  { id: 'project_conacce', label: 'Projet CONACCE', icon: '🌍', color: 'emerald', description: 'Projets humanitaires structurés' },
  { id: 'humanitaire', label: 'Activité Humanitaire', icon: '❤️', color: 'rose', description: 'Actions de terrain, aide directe, secours' },
  { id: 'mecenat', label: 'Mécénat', icon: '🌟', color: 'yellow', description: 'Mobilisation de mécènes et donateurs' },
  { id: 'partenariat', label: 'Partenariat ONG', icon: '🤝', color: 'blue', description: 'Alliances avec autres organisations' },
  { id: 'formation', label: 'Formation & Renforcement', icon: '🎓', color: 'pink', description: 'Capacity building, formations terrain' },
  { id: 'admin', label: 'Administratif', icon: '📋', color: 'amber', description: 'Gestion interne, conformité, rapports' },
  { id: 'other', label: 'Autre', icon: '📁', color: 'slate', description: 'Missions diverses' },
];

const ALL_CATEGORIES: Category[] = Array.from(
  new Map<string, Category>(
    [...DOSSIER_CATEGORIES_DOUKE, ...DOSSIER_CATEGORIES_CONACCE].map((cat) => [cat.id, cat])
  ).values()
);

// ============================================================
// STYLES PAR CATÉGORIE
// ============================================================
const CATEGORY_STYLES: Record<string, string> = {
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
const getCategoryInfo = (catId: string): Category =>
  ALL_CATEGORIES.find((c) => c.id === catId) ?? ALL_CATEGORIES[ALL_CATEGORIES.length - 1];

const formatDate = (d: string | null | undefined): string => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const todayISO = (): string => new Date().toISOString().split('T')[0];

const computeStatus = (progress: number): string => {
  if (progress === 100) return 'Terminé';
  if (progress < 40) return 'En retard';
  return 'En cours';
};

// ============================================================
// ÉCRAN DE CONNEXION — identique mais sans setTimeout ni AUTH_ACCOUNTS
// ============================================================
function LoginScreen({ onLogin }: { onLogin: (account: AuthAccount) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [locked, setLocked] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (locked) return;
    setLoading(true);
    setError('');

    try {
      
        .from('auth_accounts')
        .select('*')
        .eq('username', username.trim().toLowerCase())
        .eq('password_hash', password)
        .single();

      if (error || !data) {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        if (newAttempts >= 5) {
          setLocked(true);
          setError("Compte verrouillé après 5 tentatives. Contactez l'administrateur.");
        } else {
          setError(`Identifiants incorrects. Tentative ${newAttempts}/5.`);
        }
        setLoading(false);
        return;
      }

      // Mapping Supabase → AuthAccount
      const account: AuthAccount = {
        id: data.id,
        username: data.username,
        password: data.password_hash,
        name: data.name,
        role: data.role,
        orgId: data.org_id,
        emoji: data.emoji,
        collaborator_id: data.collaborator_id ?? '',
        color: data.color,
      };

      setAttempts(0);
      onLogin(account);

    } catch (err) {
      setError('Erreur de connexion. Vérifiez votre réseau.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#0F172A] flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-emerald-600/5 rounded-full blur-3xl" />
      </div>
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl shadow-2xl shadow-blue-500/30 mb-4">
            <ShieldCheck size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-black text-white uppercase tracking-widest">Cabinet DOUKE</h1>
          <p className="text-[11px] text-blue-400 font-bold tracking-widest uppercase mt-1">Gouvernance & Sovereign Auth</p>
          <div className="flex items-center justify-center gap-2 mt-3">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Système de Sécurité Actif</span>
          </div>
        </div>
        <div className="bg-[#1E293B] border border-slate-700/50 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-sm font-black text-white uppercase tracking-wider mb-1">Accès Sécurisé</h2>
          <p className="text-[11px] text-slate-400 font-medium mb-6">Authentification à périmètre restreint — Cabinet DOUKE / CONACCE</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Identifiant</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                placeholder="prenom.nom" disabled={locked}
                className="w-full bg-[#0F172A] border border-slate-700 rounded-xl text-sm font-bold text-white p-3.5 outline-none focus:border-blue-500 transition-all placeholder-slate-600 disabled:opacity-50" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Mot de passe</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={password}
                  onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••" disabled={locked}
                  className="w-full bg-[#0F172A] border border-slate-700 rounded-xl text-sm font-bold text-white p-3.5 outline-none focus:border-blue-500 transition-all placeholder-slate-600 pr-12 disabled:opacity-50" />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-all">
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
            <button type="submit" disabled={loading || locked}
           const { data, error } = await supabase
  .from('auth_accounts')
  .select('*')
  .eq('username', username.trim().toLowerCase())
  .eq('password_hash', password)
  .single();

console.log('DATA:', JSON.stringify(data));
console.log('ERROR:', JSON.stringify(error));
            </button>
          </form>
        </div>
        <p className="text-center text-[10px] text-slate-600 font-bold mt-4 uppercase tracking-wider">
          © 2026 Cabinet DOUKE — Accès restreint.
        </p>
      </div>
    </div>
  );
}

// ============================================================
// COMPOSANT PRINCIPAL — données vides, prêt pour Supabase
// ============================================================
export default function FullyLoadedPremiumDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthAccount | null>(null);
  const [currentView, setCurrentView] = useState('Tableau de bord');
  const [currentStructure, setCurrentStructure] = useState('Tous');
  const [loading, setLoading] = useState(false);

  // États de données — vides, seront peuplés par Supabase
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [realisations, setRealisations] = useState<Realisation[]>([]);
  const [remarques, setRemarques] = useState<Remarque[]>([]);

  // Modales
  const [isObjectiveModalOpen, setIsObjectiveModalOpen] = useState(false);
  const [isCollaboratorModalOpen, setIsCollaboratorModalOpen] = useState(false);
  const [isRealisationModalOpen, setIsRealisationModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [editingObjective, setEditingObjective] = useState<Objective | null>(null);
  const [editingCollaborator, setEditingCollaborator] = useState<Collaborator | null>(null);

  // Filtres
  const [filterCategory, setFilterCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Stats
  const [stats, setStats] = useState({
    totalObjectives: 0, globalProgress: 0, lateTasks: 0,
    pendingTasks: 0, conacceProgress: 0, doukeProgress: 0,
  });

  // ---- AUTH ----
  const handleLogin = (account: AuthAccount) => {
    setCurrentUser(account);
    setIsAuthenticated(true);
    setCurrentStructure(account.orgId !== 'Tous' ? account.orgId : 'Tous');
  };

  const handleLogout = () => {
    if (window.confirm('Confirmer la déconnexion sécurisée ?')) {
      setIsAuthenticated(false);
      setCurrentUser(null);
      setCurrentView('Tableau de bord');
    }
  };

  // ---- CALCUL STATS ----
  const calculateMetrics = (targetObjectives: Objective[]) => {
    const total = targetObjectives.length;
    const avg = total > 0
      ? Math.round(targetObjectives.reduce((a, o) => a + o.progress_percentage, 0) / total)
      : 0;
    const conacceObjs = targetObjectives.filter((o) => o.organization_id === 'c1111111-1111-1111-1111-111111111111');
    const doukeObjs = targetObjectives.filter((o) => o.organization_id === 'd2222222-2222-2222-2222-222222222222');
    setStats({
      totalObjectives: total,
      globalProgress: avg,
      lateTasks: targetObjectives.filter((o) => o.status === 'En retard').length,
      pendingTasks: targetObjectives.filter((o) => o.status === 'En cours').length,
      conacceProgress: conacceObjs.length > 0
        ? Math.round(conacceObjs.reduce((a, o) => a + o.progress_percentage, 0) / conacceObjs.length) : 0,
      doukeProgress: doukeObjs.length > 0
        ? Math.round(doukeObjs.reduce((a, o) => a + o.progress_percentage, 0) / doukeObjs.length) : 0,
    });
  };

  // ---- CHARGEMENT DONNÉES — placeholder Supabase (étape 5) ----
  const loadData = async (user: AuthAccount | null = currentUser) => {
  if (!user) return;
  setLoading(true);

  try {
    // 1. COLLABORATORS
    const { data: collabData } = await supabase
      .from('collaborators')
      .select('*')
      .order('created_at', { ascending: true });

    // 2. OBJECTIVES — filtrés par org si pas Super-Admin
    const objQuery = supabase
  .from('objectives')
  .select('*')
  .order('created_at', { ascending: false });

const { data: objData } = user.orgId !== 'Tous'
  ? await objQuery.eq('organization_id', user.orgId)
  : await objQuery;

    // 3. ACTIVITIES
    const { data: actData } = await supabase
      .from('activities')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    // 4. REALISATIONS
    const realQuery = supabase
  .from('realisations')
  .select('*')
  .order('date', { ascending: false });

const { data: realData } = user.orgId !== 'Tous'
  ? await realQuery.eq('user_id', user.collaborator_id)
  : await realQuery;

    // 5. REMARQUES
    const { data: remData } = await supabase
      .from('remarques')
      .select('*')
      .order('date', { ascending: false });

    // 6. MISE À JOUR DES ÉTATS
    const collabs = (collabData ?? []) as Collaborator[];
    const objs = (objData ?? []) as Objective[];

    setCollaborators(collabs);
    setObjectives(objs);
    setActivities((actData ?? []) as Activity[]);
    setRealisations((realData ?? []) as Realisation[]);
    setRemarques((remData ?? []) as Remarque[]);
    calculateMetrics(objs);

  } catch (err) {
    console.error('Erreur loadData:', err);
  } finally {
    setLoading(false);
  }
};

  useEffect(() => {
    if (isAuthenticated && currentUser) loadData(currentUser);
  }, [currentUser, isAuthenticated]);

  // ---- ACTIONS OBJECTIFS ----
  const handleUpdateProgress = (id: string, currentProgress: number, currentTitle: string, increment: number) => {
    const newProgress = Math.max(0, Math.min(100, currentProgress + increment));
    const newStatus = computeStatus(newProgress);
    setObjectives((prev) => {
      const updated = prev.map((o) => o.id === id ? { ...o, progress_percentage: newProgress, status: newStatus } : o);
      calculateMetrics(updated);
      return updated;
    });
  };

  const handleUpdateProgressDirect = (id: string, newProgress: number) => {
    const newStatus = computeStatus(newProgress);
    setObjectives((prev) => {
      const updated = prev.map((o) => o.id === id ? { ...o, progress_percentage: newProgress, status: newStatus } : o);
      calculateMetrics(updated);
      return updated;
    });
  };

  const handleSaveObjective = (formData: Objective) => {
    const isEdit = objectives.find((o) => o.id === formData.id);
    setObjectives((prev) => {
      const updated = isEdit
        ? prev.map((o) => o.id === formData.id ? formData : o)
        : [formData, ...prev];
      calculateMetrics(updated);
      return updated;
    });
    setEditingObjective(null);
  };

  const handleDeleteObjective = (id: string) => {
    setObjectives((prev) => {
      const updated = prev.filter((o) => o.id !== id);
      calculateMetrics(updated);
      return updated;
    });
  };

  // ---- ACTIONS COLLABORATEURS ----
  const handleSaveCollaborator = (formData: Collaborator) => {
    const isEdit = collaborators.find((c) => c.id === formData.id);
    setCollaborators((prev) => isEdit ? prev.map((c) => c.id === formData.id ? formData : c) : [...prev, formData]);
    setEditingCollaborator(null);
  };

  const handleDeleteCollaborator = (id: string) => {
    setCollaborators((prev) => prev.filter((c) => c.id !== id));
  };

  // ---- ACTIONS RÉALISATIONS ----
  const handleSaveRealisation = (formData: Realisation) => {
    setRealisations((prev) => [formData, ...prev]);
    if (formData.objective_id && formData.progress_after !== undefined) {
      handleUpdateProgressDirect(formData.objective_id, formData.progress_after);
    }
  };

  // ---- GUARD ----
  if (!isAuthenticated || !currentUser) return <LoginScreen onLogin={handleLogin} />;

  const isJuniorOrSecretary = ['Junior', 'Secretaire'].includes(currentUser.role);
  const isAdmin = currentUser.role === 'Super-Admin';
  const isSenior = ['Senior Analyst', 'Field Lead'].includes(currentUser.role);

  const navItems = [
    { label: 'Tableau de bord', view: 'Tableau de bord', icon: <LayoutDashboard size={20} />, show: true },
    { label: 'Objectifs & Missions', view: 'Objectifs', icon: <ClipboardList size={20} />, show: true },
    { label: 'Réalisations', view: 'Réalisations', icon: <PenLine size={20} />, show: true },
    { label: 'Planification', view: 'Planification', icon: <Calendar size={20} />, show: !isJuniorOrSecretary },
    { label: 'Équipe & Collaborateurs', view: 'Équipe', icon: <Users size={20} />, show: true },
  ].filter((n) => n.show);

  const displayObjectives = (() => {
    let objs = currentStructure === 'Tous' ? objectives : objectives.filter((o) => o.organization_id === currentStructure);
    if (filterCategory !== 'all') objs = objs.filter((o) => o.category === filterCategory);
    if (searchQuery.trim()) objs = objs.filter((o) => o.title.toLowerCase().includes(searchQuery.toLowerCase()));
    return objs;
  })();

  return (
    <div className="flex h-screen bg-[#F1F5F9] font-sans text-slate-800 overflow-hidden">
      {/* SIDEBAR */}
      <aside className="w-72 bg-[#0F172A] text-slate-300 flex flex-col shadow-2xl shrink-0 z-10 border-r border-slate-800">
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-6 flex items-center gap-3.5 border-b border-slate-800 bg-[#1E293B]/40">
            <div className="bg-blue-600 p-2.5 rounded-xl text-white shadow-lg shadow-blue-500/30">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h1 className="font-black text-white text-md uppercase tracking-wider leading-none">Cabinet DOUKE</h1>
              <p className="text-[10px] text-blue-400 font-bold tracking-widest uppercase mt-1">Gouvernance & Sovereign Auth</p>
            </div>
          </div>

          <div className="p-4 mx-4 my-4 bg-[#1E293B]/60 border border-slate-800 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <Lock size={12} className="text-emerald-400 animate-pulse" />
              <span className="text-[10px] uppercase tracking-wider font-black text-slate-400">Session Active</span>
            </div>
            <div className="flex items-center gap-3 bg-[#0F172A] border border-slate-700 rounded-lg p-2.5">
              <span className="text-xl">{currentUser.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-white truncate">{currentUser.name}</p>
                <p className="text-[9px] text-blue-400 font-bold uppercase tracking-wider">{currentUser.role}</p>
              </div>
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            </div>
          </div>

          <nav className="p-4 space-y-1.5">
            {navItems.map((item, idx) => (
              <button key={idx} onClick={() => setCurrentView(item.view)}
                className={`w-full flex items-center gap-3.5 p-3.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all ${
                  currentView === item.view
                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-xl shadow-blue-600/20 border-l-4 border-blue-400'
                    : 'hover:bg-slate-800/60 hover:text-white text-slate-400'
                }`}>
                {item.icon}<span>{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="px-4">
            <button onClick={() => setIsPrintModalOpen(true)}
              className="w-full flex items-center gap-3 p-3.5 rounded-xl text-slate-400 hover:bg-slate-800/60 hover:text-white transition-all text-[11px] font-bold uppercase tracking-wider">
              <Printer size={20} /><span>Imprimer un rapport</span>
            </button>
          </div>
        </div>

        <div className="p-4 border-t border-slate-800/80 bg-[#1E293B]/20 flex flex-col gap-2">
          <button onClick={() => loadData(currentUser)}
            className="w-full flex items-center justify-center gap-2 p-3 text-xs font-black uppercase tracking-wider text-slate-300 hover:text-white rounded-xl border border-slate-800 hover:bg-slate-800 transition-all">
            <RefreshCw size={14} className="text-blue-500" />
            <span>Rafraîchir les données</span>
          </button>
          <button onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 p-3.5 text-xs font-black uppercase tracking-wider text-white rounded-xl bg-rose-600 hover:bg-rose-700 transition-all shadow-lg">
            <LogOut size={16} /><span>Déconnexion sécurisée</span>
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 flex flex-col overflow-y-auto">
        <header className="bg-white border-b border-slate-200 h-20 px-8 flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center gap-6">
            <div>
              <h2 className="text-lg font-black text-slate-900 uppercase tracking-wider">{currentView}</h2>
              <p className="text-[11px] text-slate-400 font-medium">Cabinet d'Ingénierie Financière & Arbitrage ODD</p>
            </div>
            {currentView === 'Tableau de bord' && isAdmin && (
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1">
                <span className="text-[10px] font-black uppercase text-slate-400">Scope :</span>
                <select className="bg-transparent font-black text-xs text-slate-700 py-1 outline-none cursor-pointer"
                  onChange={(e) => setCurrentStructure(e.target.value)} value={currentStructure}>
                  <option value="Tous">Vue Consolidée</option>
                  <option value="c1111111-1111-1111-1111-111111111111">CONACCE Chaplains</option>
                  <option value="d2222222-2222-2222-2222-222222222222">Cabinet DOUKE</option>
                </select>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setIsRealisationModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all flex items-center gap-2 shadow-sm">
              <PenLine size={14} /> Saisir une réalisation
            </button>
            <div className="text-right">
              <p className="text-xs font-black text-slate-900">{currentUser.name}</p>
              <span className="text-[9px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full font-black uppercase tracking-wider border border-blue-100">{currentUser.role}</span>
            </div>
            <div className="w-11 h-11 bg-gradient-to-tr from-slate-800 to-slate-900 rounded-2xl flex items-center justify-center text-white text-lg shadow-md border border-slate-700">{currentUser.emoji}</div>
          </div>
        </header>

        <div className="p-8">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                <p className="text-sm font-black text-slate-400 uppercase tracking-wider">Chargement des données...</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-20 text-slate-400">
              <p className="text-4xl mb-4">🔌</p>
              <p className="font-black text-sm uppercase tracking-wider">Connexion Supabase à configurer</p>
              <p className="text-xs mt-2">Les données apparaîtront ici après l'étape 4 (auth) et l'étape 5 (fetch).</p>
            </div>
          )}
        </div>

        {/* FABs */}
        <div className="fixed bottom-8 right-8 flex flex-col gap-3">
          <button onClick={() => setIsRealisationModalOpen(true)}
            className="bg-gradient-to-tr from-emerald-600 to-emerald-700 hover:scale-105 text-white rounded-2xl shadow-2xl shadow-emerald-600/40 transition-transform flex items-center justify-center w-14 h-14">
            <PenLine size={22} />
          </button>
          {!isJuniorOrSecretary && (
            <button onClick={() => { setEditingObjective(null); setIsObjectiveModalOpen(true); }}
              className="bg-gradient-to-tr from-blue-600 to-blue-700 hover:scale-105 text-white rounded-2xl shadow-2xl shadow-blue-600/40 transition-transform flex items-center justify-center w-14 h-14">
              <Plus size={24} />
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
