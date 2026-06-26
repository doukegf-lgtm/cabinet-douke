"use client";
import { useState, useEffect } from "react";

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
interface Activite {
  id: string;
  nom: string;
  description: string;
  unite: string;
  quantite: number;
  cout_unitaire: number;
  mois_debut: number;
  duree_mois: number;
}

interface PostePersonnel {
  id: string;
  poste: string;
  nbre: number;
  salaire_mensuel: number;
  mois: number;
  type: "permanent" | "consultant";
}

interface SourceFinancement {
  id: string;
  bailleur: string;
  type: "subvention" | "pret" | "fonds_propres" | "recettes_services";
  montant: number;
  taux_interet: number;
  duree_mois: number;
  conditions: string;
}

interface BeneficiaireGroupe {
  id: string;
  categorie: string;
  nombre: number;
  zone: string;
}

interface ChargeFonctionnement {
  id: string;
  nature: string;
  montant_mensuel: number;
  mois: number;
}

interface RecetteService {
  id: string;
  service: string;
  unite: string;
  volume_annuel: number;
  tarif: number;
}

interface MoteurSocialState {
  nom_projet: string;
  secteur: string;
  zone: string;
  juridique: string;
  modele: string;
  duree_projet_ans: number;
  activites: Activite[];
  personnel: PostePersonnel[];
  charges_fonctionnement: ChargeFonctionnement[];
  sources_financement: SourceFinancement[];
  beneficiaires: BeneficiaireGroupe[];
  recettes_services: RecetteService[];
  reserve_imprevus_pct: number;
  taux_croissance_beneficiaires: number;
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 9);
const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR");
const fmtPct = (n: number) => (Math.round(n * 10) / 10).toFixed(1) + "%";

// ─────────────────────────────────────────────
// ÉTAT INITIAL
// ─────────────────────────────────────────────
const initialState: MoteurSocialState = {
  nom_projet: "",
  secteur: "",
  zone: "Bénin",
  juridique: "ONG",
  modele: "",
  duree_projet_ans: 3,
  activites: [
    { id: uid(), nom: "", description: "", unite: "session", quantite: 0, cout_unitaire: 0, mois_debut: 1, duree_mois: 12 },
    { id: uid(), nom: "", description: "", unite: "bénéficiaire", quantite: 0, cout_unitaire: 0, mois_debut: 1, duree_mois: 12 },
  ],
  personnel: [
    { id: uid(), poste: "Coordinateur de projet", nbre: 1, salaire_mensuel: 0, mois: 12, type: "permanent" },
    { id: uid(), poste: "Assistant(e) terrain", nbre: 1, salaire_mensuel: 0, mois: 12, type: "permanent" },
    { id: uid(), poste: "Comptable", nbre: 1, salaire_mensuel: 0, mois: 12, type: "permanent" },
  ],
  charges_fonctionnement: [
    { id: uid(), nature: "Loyer bureau", montant_mensuel: 0, mois: 12 },
    { id: uid(), nature: "Eau & Électricité", montant_mensuel: 0, mois: 12 },
    { id: uid(), nature: "Téléphone & Internet", montant_mensuel: 0, mois: 12 },
    { id: uid(), nature: "Transport & Déplacement terrain", montant_mensuel: 0, mois: 12 },
    { id: uid(), nature: "Fournitures de bureau", montant_mensuel: 0, mois: 12 },
  ],
  sources_financement: [
    { id: uid(), bailleur: "AFD / I-OSC", type: "subvention", montant: 0, taux_interet: 0, duree_mois: 0, conditions: "Max 80% du budget total" },
    { id: uid(), bailleur: "Contrepartie locale", type: "fonds_propres", montant: 0, taux_interet: 0, duree_mois: 0, conditions: "Min 20% exigé AFD" },
  ],
  beneficiaires: [
    { id: uid(), categorie: "Femmes", nombre: 0, zone: "" },
    { id: uid(), categorie: "Jeunes (15-35 ans)", nombre: 0, zone: "" },
  ],
  recettes_services: [
    { id: uid(), service: "", unite: "bénéficiaire", volume_annuel: 0, tarif: 0 },
  ],
  reserve_imprevus_pct: 5,
  taux_croissance_beneficiaires: 15,
};

// ─────────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────────
function Badge({ children, color }: { children: React.ReactNode; color: "green" | "blue" | "amber" | "red" | "gray" | "purple" }) {
  const colors = {
    green: "bg-emerald-50 text-emerald-800 border-emerald-200",
    blue: "bg-blue-50 text-blue-800 border-blue-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    red: "bg-red-50 text-red-800 border-red-200",
    gray: "bg-gray-100 text-gray-700 border-gray-200",
    purple: "bg-purple-50 text-purple-800 border-purple-200",
  };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[color]}`}>{children}</span>;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white border border-gray-200 rounded-xl p-5 mb-3 ${className}`}>{children}</div>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-500">{label}</label>
      {hint && <span className="text-[10px] text-gray-400 italic">{hint}</span>}
      {children}
    </div>
  );
}

const inputCls = "w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-purple-500 bg-white";
const readonlyCls = "w-full px-2.5 py-1.5 text-sm border border-gray-100 rounded-lg bg-purple-50 font-medium text-purple-800";

function AddBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 mt-2">
      + {label}
    </button>
  );
}

function DelBtn({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick} className="px-2 text-gray-300 hover:text-red-500 text-lg leading-none">×</button>;
}

// ─────────────────────────────────────────────
// ONGLET 1 — ACTIVITÉS & BÉNÉFICIAIRES
// ─────────────────────────────────────────────
function Tab1({ state, setState }: { state: MoteurSocialState; setState: React.Dispatch<React.SetStateAction<MoteurSocialState>> }) {
  const totalActivites = state.activites.reduce((s, a) => s + a.quantite * a.cout_unitaire, 0);
  const totalBenef = state.beneficiaires.reduce((s, b) => s + b.nombre, 0);

  const updA = (id: string, f: keyof Activite, v: string | number) =>
    setState(s => ({ ...s, activites: s.activites.map(a => a.id === id ? { ...a, [f]: v } : a) }));
  const updB = (id: string, f: keyof BeneficiaireGroupe, v: string | number) =>
    setState(s => ({ ...s, beneficiaires: s.beneficiaires.map(b => b.id === id ? { ...b, [f]: v } : b) }));

  return (
    <div>
      {/* Activités */}
      <Card>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-medium">Activités du projet (max 15)</h3>
          <Badge color="purple">Total activités : {fmt(totalActivites)} FCFA</Badge>
        </div>
        <p className="text-xs text-gray-500 mb-3">Chaque activité = une composante livrée aux bénéficiaires. Le coût total alimente le budget global.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50">
                {["Activité", "Description courte", "Unité", "Quantité", "Coût unit. (FCFA)", "Coût total", "Mois début", "Durée (mois)", ""].map(h => (
                  <th key={h} className="border border-gray-200 px-2 py-1.5 text-left font-medium text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.activites.map((a, idx) => (
                <tr key={a.id}>
                  <td className="border border-gray-200 px-1 min-w-[160px]">
                    <input className={inputCls} value={a.nom} onChange={e => updA(a.id, "nom", e.target.value)} placeholder={`Ex : Formation en gestion`} />
                  </td>
                  <td className="border border-gray-200 px-1 min-w-[160px]">
                    <input className={inputCls} value={a.description} onChange={e => updA(a.id, "description", e.target.value)} placeholder="Détail…" />
                  </td>
                  <td className="border border-gray-200 px-1 w-28">
                    <input className={inputCls} value={a.unite} onChange={e => updA(a.id, "unite", e.target.value)} placeholder="session, kit, pers." />
                  </td>
                  <td className="border border-gray-200 px-1 w-20">
                    <input type="number" className={inputCls} value={a.quantite || ""} onChange={e => updA(a.id, "quantite", parseFloat(e.target.value) || 0)} />
                  </td>
                  <td className="border border-gray-200 px-1 w-32">
                    <input type="number" className={inputCls} value={a.cout_unitaire || ""} onChange={e => updA(a.id, "cout_unitaire", parseFloat(e.target.value) || 0)} />
                  </td>
                  <td className="border border-gray-200 px-2 text-right bg-gray-50 font-medium w-28">{fmt(a.quantite * a.cout_unitaire)}</td>
                  <td className="border border-gray-200 px-1 w-20">
                    <input type="number" className={inputCls} value={a.mois_debut} min={1} max={12} onChange={e => updA(a.id, "mois_debut", parseFloat(e.target.value) || 1)} />
                  </td>
                  <td className="border border-gray-200 px-1 w-24">
                    <input type="number" className={inputCls} value={a.duree_mois} min={1} max={36} onChange={e => updA(a.id, "duree_mois", parseFloat(e.target.value) || 12)} />
                  </td>
                  <td className="border border-gray-200 px-1">
                    <DelBtn onClick={() => setState(s => ({ ...s, activites: s.activites.filter(x => x.id !== a.id) }))} />
                  </td>
                </tr>
              ))}
              <tr className="bg-purple-50 font-medium text-purple-800">
                <td colSpan={5} className="border border-gray-200 px-2 py-1.5">Total coût des activités</td>
                <td className="border border-gray-200 px-2 text-right">{fmt(totalActivites)}</td>
                <td colSpan={3} className="border border-gray-200" />
              </tr>
            </tbody>
          </table>
        </div>
        {state.activites.length < 15 && (
          <AddBtn label="Ajouter une activité" onClick={() => setState(s => ({ ...s, activites: [...s.activites, { id: uid(), nom: "", description: "", unite: "bénéficiaire", quantite: 0, cout_unitaire: 0, mois_debut: 1, duree_mois: 12 }] }))} />
        )}
      </Card>

      {/* Bénéficiaires */}
      <Card>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-medium">Groupes de bénéficiaires cibles</h3>
          <Badge color="blue">Total : {fmt(totalBenef)} bénéficiaires</Badge>
        </div>
        <p className="text-xs text-gray-500 mb-3">Les bailleurs exigent une segmentation précise. Le coût par bénéficiaire est calculé automatiquement dans les ratios.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50">
                {["Catégorie", "Nombre", "Zone géographique", ""].map(h => (
                  <th key={h} className="border border-gray-200 px-2 py-1.5 text-left font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.beneficiaires.map(b => (
                <tr key={b.id}>
                  <td className="border border-gray-200 px-1 min-w-[200px]">
                    <input className={inputCls} value={b.categorie} onChange={e => updB(b.id, "categorie", e.target.value)} placeholder="Ex : Femmes agricultrices" />
                  </td>
                  <td className="border border-gray-200 px-1 w-24">
                    <input type="number" className={inputCls} value={b.nombre || ""} onChange={e => updB(b.id, "nombre", parseFloat(e.target.value) || 0)} />
                  </td>
                  <td className="border border-gray-200 px-1 min-w-[160px]">
                    <input className={inputCls} value={b.zone} onChange={e => updB(b.id, "zone", e.target.value)} placeholder="Ex : Département du Borgou" />
                  </td>
                  <td className="border border-gray-200 px-1">
                    <DelBtn onClick={() => setState(s => ({ ...s, beneficiaires: s.beneficiaires.filter(x => x.id !== b.id) }))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <AddBtn label="Ajouter un groupe" onClick={() => setState(s => ({ ...s, beneficiaires: [...s.beneficiaires, { id: uid(), categorie: "", nombre: 0, zone: "" }] }))} />

        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Taux de croissance bénéficiaires / an (%)">
            <input type="number" className={inputCls} value={state.taux_croissance_beneficiaires} onChange={e => setState(s => ({ ...s, taux_croissance_beneficiaires: parseFloat(e.target.value) || 0 }))} />
          </Field>
          <Field label="Durée du projet (ans)">
            <input type="number" className={inputCls} value={state.duree_projet_ans} min={1} max={5} onChange={e => setState(s => ({ ...s, duree_projet_ans: parseFloat(e.target.value) || 3 }))} />
          </Field>
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────
// ONGLET 2 — PERSONNEL & FONCTIONNEMENT
// ─────────────────────────────────────────────
function Tab2({ state, setState }: { state: MoteurSocialState; setState: React.Dispatch<React.SetStateAction<MoteurSocialState>> }) {
  const totalSal = state.personnel.reduce((s, p) => s + p.nbre * p.salaire_mensuel * p.mois * (p.type === "permanent" ? 1.2 : 1), 0);
  const totalFonct = state.charges_fonctionnement.reduce((s, c) => s + c.montant_mensuel * c.mois, 0);

  const updP = (id: string, f: keyof PostePersonnel, v: string | number) =>
    setState(s => ({ ...s, personnel: s.personnel.map(p => p.id === id ? { ...p, [f]: v } : p) }));
  const updC = (id: string, f: keyof ChargeFonctionnement, v: string | number) =>
    setState(s => ({ ...s, charges_fonctionnement: s.charges_fonctionnement.map(c => c.id === id ? { ...c, [f]: v } : c) }));

  return (
    <div>
      <Card>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-medium">Personnel du projet (max 20)</h3>
          <Badge color="amber">Masse salariale annuelle : {fmt(totalSal)} FCFA</Badge>
        </div>
        <p className="text-xs text-gray-500 mb-3">Permanents : charges sociales 20% incluses. Consultants : montant forfaitaire sans charges.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50">
                {["Poste", "Type", "Nbre", "Salaire mensuel (FCFA)", "Nbre mois", "Charges soc. (20%)", "Coût annuel total", ""].map(h => (
                  <th key={h} className="border border-gray-200 px-2 py-1.5 text-left font-medium text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.personnel.map(p => {
                const cs = p.type === "permanent" ? p.salaire_mensuel * 0.2 : 0;
                const cout = p.nbre * (p.salaire_mensuel + cs) * p.mois;
                return (
                  <tr key={p.id}>
                    <td className="border border-gray-200 px-1 min-w-[180px]">
                      <input className={inputCls} value={p.poste} onChange={e => updP(p.id, "poste", e.target.value)} />
                    </td>
                    <td className="border border-gray-200 px-1 w-32">
                      <select className={inputCls} value={p.type} onChange={e => updP(p.id, "type", e.target.value)}>
                        <option value="permanent">Permanent</option>
                        <option value="consultant">Consultant</option>
                      </select>
                    </td>
                    <td className="border border-gray-200 px-1 w-16">
                      <input type="number" className={inputCls} value={p.nbre} min={1} onChange={e => updP(p.id, "nbre", parseFloat(e.target.value) || 1)} />
                    </td>
                    <td className="border border-gray-200 px-1 w-36">
                      <input type="number" className={inputCls} value={p.salaire_mensuel || ""} onChange={e => updP(p.id, "salaire_mensuel", parseFloat(e.target.value) || 0)} />
                    </td>
                    <td className="border border-gray-200 px-1 w-20">
                      <input type="number" className={inputCls} value={p.mois} min={1} max={12} onChange={e => updP(p.id, "mois", parseFloat(e.target.value) || 12)} />
                    </td>
                    <td className="border border-gray-200 px-2 text-right bg-gray-50">{fmt(cs * p.nbre * p.mois)}</td>
                    <td className="border border-gray-200 px-2 text-right bg-gray-50 font-medium">{fmt(cout)}</td>
                    <td className="border border-gray-200 px-1">
                      <DelBtn onClick={() => setState(s => ({ ...s, personnel: s.personnel.filter(x => x.id !== p.id) }))} />
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-amber-50 font-medium text-amber-800">
                <td colSpan={6} className="border border-gray-200 px-2 py-1.5">Total personnel</td>
                <td className="border border-gray-200 px-2 text-right">{fmt(totalSal)}</td>
                <td className="border border-gray-200" />
              </tr>
            </tbody>
          </table>
        </div>
        {state.personnel.length < 20 && (
          <AddBtn label="Ajouter un poste" onClick={() => setState(s => ({ ...s, personnel: [...s.personnel, { id: uid(), poste: "", nbre: 1, salaire_mensuel: 0, mois: 12, type: "permanent" }] }))} />
        )}
      </Card>

      <Card>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-medium">Charges de fonctionnement (max 15)</h3>
          <Badge color="gray">Total fonctionnement : {fmt(totalFonct)} FCFA/an</Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50">
                {["Nature de la charge", "Montant mensuel (FCFA)", "Nbre mois", "Montant annuel", ""].map(h => (
                  <th key={h} className="border border-gray-200 px-2 py-1.5 text-left font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.charges_fonctionnement.map(c => (
                <tr key={c.id}>
                  <td className="border border-gray-200 px-1 min-w-[200px]">
                    <input className={inputCls} value={c.nature} onChange={e => updC(c.id, "nature", e.target.value)} />
                  </td>
                  <td className="border border-gray-200 px-1 w-36">
                    <input type="number" className={inputCls} value={c.montant_mensuel || ""} onChange={e => updC(c.id, "montant_mensuel", parseFloat(e.target.value) || 0)} />
                  </td>
                  <td className="border border-gray-200 px-1 w-20">
                    <input type="number" className={inputCls} value={c.mois} min={1} max={12} onChange={e => updC(c.id, "mois", parseFloat(e.target.value) || 12)} />
                  </td>
                  <td className="border border-gray-200 px-2 text-right bg-gray-50 font-medium">{fmt(c.montant_mensuel * c.mois)}</td>
                  <td className="border border-gray-200 px-1">
                    <DelBtn onClick={() => setState(s => ({ ...s, charges_fonctionnement: s.charges_fonctionnement.filter(x => x.id !== c.id) }))} />
                  </td>
                </tr>
              ))}
              <tr className="bg-gray-100 font-medium">
                <td colSpan={3} className="border border-gray-200 px-2 py-1.5">Total fonctionnement annuel</td>
                <td className="border border-gray-200 px-2 text-right">{fmt(totalFonct)}</td>
                <td className="border border-gray-200" />
              </tr>
            </tbody>
          </table>
        </div>
        {state.charges_fonctionnement.length < 15 && (
          <AddBtn label="Ajouter une charge" onClick={() => setState(s => ({ ...s, charges_fonctionnement: [...s.charges_fonctionnement, { id: uid(), nature: "", montant_mensuel: 0, mois: 12 }] }))} />
        )}
      </Card>

      <Card>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-medium">Recettes de services (si projet hybride)</h3>
          <span className="text-xs text-gray-400">Facultatif — améliore l'OSR</span>
        </div>
        <p className="text-xs text-gray-500 mb-3">Cotisations membres, frais d'adhésion, ventes de prestations, intérêts sur microcrédit... Ces recettes réduisent la dépendance aux subventions.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50">
                {["Service / Recette", "Unité", "Volume annuel", "Tarif unitaire (FCFA)", "Recette annuelle", ""].map(h => (
                  <th key={h} className="border border-gray-200 px-2 py-1.5 text-left font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.recettes_services.map(r => (
                <tr key={r.id}>
                  <td className="border border-gray-200 px-1 min-w-[180px]">
                    <input className={inputCls} value={r.service} onChange={e => setState(s => ({ ...s, recettes_services: s.recettes_services.map(x => x.id === r.id ? { ...x, service: e.target.value } : x) }))} placeholder="Ex : Cotisations membres" />
                  </td>
                  <td className="border border-gray-200 px-1 w-28">
                    <input className={inputCls} value={r.unite} onChange={e => setState(s => ({ ...s, recettes_services: s.recettes_services.map(x => x.id === r.id ? { ...x, unite: e.target.value } : x) }))} />
                  </td>
                  <td className="border border-gray-200 px-1 w-28">
                    <input type="number" className={inputCls} value={r.volume_annuel || ""} onChange={e => setState(s => ({ ...s, recettes_services: s.recettes_services.map(x => x.id === r.id ? { ...x, volume_annuel: parseFloat(e.target.value) || 0 } : x) }))} />
                  </td>
                  <td className="border border-gray-200 px-1 w-36">
                    <input type="number" className={inputCls} value={r.tarif || ""} onChange={e => setState(s => ({ ...s, recettes_services: s.recettes_services.map(x => x.id === r.id ? { ...x, tarif: parseFloat(e.target.value) || 0 } : x) }))} />
                  </td>
                  <td className="border border-gray-200 px-2 text-right bg-gray-50 font-medium">{fmt(r.volume_annuel * r.tarif)}</td>
                  <td className="border border-gray-200 px-1">
                    <DelBtn onClick={() => setState(s => ({ ...s, recettes_services: s.recettes_services.filter(x => x.id !== r.id) }))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <AddBtn label="Ajouter une recette" onClick={() => setState(s => ({ ...s, recettes_services: [...s.recettes_services, { id: uid(), service: "", unite: "bénéficiaire", volume_annuel: 0, tarif: 0 }] }))} />
      </Card>

      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
        <Field label="Provision pour imprévus (% du budget total activités)">
          <input type="number" className={inputCls} value={state.reserve_imprevus_pct} min={0} max={15} onChange={e => setState(s => ({ ...s, reserve_imprevus_pct: parseFloat(e.target.value) || 5 }))} />
        </Field>
        <p className="text-xs text-gray-400 mt-1">Standard AFD : 5-10% recommandé. UNICEF / BID : max 15%.</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ONGLET 3 — SOURCES DE FINANCEMENT
// ─────────────────────────────────────────────
function Tab3({ state, setState, budgetTotal }: { state: MoteurSocialState; setState: React.Dispatch<React.SetStateAction<MoteurSocialState>> ; budgetTotal: number }) {
  const totalFinancement = state.sources_financement.reduce((s, f) => s + f.montant, 0);
  const ecart = budgetTotal - totalFinancement;
  const pctSubventions = totalFinancement > 0 ? state.sources_financement.filter(f => f.type === "subvention").reduce((s, f) => s + f.montant, 0) / totalFinancement * 100 : 0;
  const pctFondsPropres = totalFinancement > 0 ? state.sources_financement.filter(f => f.type === "fonds_propres").reduce((s, f) => s + f.montant, 0) / totalFinancement * 100 : 0;

  const TYPES_FINANCEMENT = [
    { value: "subvention", label: "Subvention bailleur" },
    { value: "pret", label: "Prêt concessionnel" },
    { value: "fonds_propres", label: "Fonds propres / contrepartie" },
    { value: "recettes_services", label: "Recettes de services" },
  ];

  const updF = (id: string, f: keyof SourceFinancement, v: string | number) =>
    setState(s => ({ ...s, sources_financement: s.sources_financement.map(x => x.id === id ? { ...x, [f]: v } : x) }));

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className={`rounded-xl p-4 border ${Math.abs(ecart) < 1000 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
          <div className="text-xs text-gray-500 mb-1">Budget total à couvrir</div>
          <div className="text-base font-medium">{fmt(budgetTotal)} FCFA</div>
        </div>
        <div className={`rounded-xl p-4 border ${Math.abs(ecart) < 1000 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="text-xs text-gray-500 mb-1">Total financement</div>
          <div className="text-base font-medium">{fmt(totalFinancement)} FCFA</div>
        </div>
        <div className={`rounded-xl p-4 border ${Math.abs(ecart) < 1000 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
          <div className="text-xs text-gray-500 mb-1">Écart budget / financement</div>
          <div className={`text-base font-medium ${Math.abs(ecart) < 1000 ? 'text-emerald-700' : 'text-red-700'}`}>
            {ecart > 0 ? '−' : '+'}{fmt(Math.abs(ecart))} FCFA
          </div>
        </div>
      </div>

      <Card>
        <h3 className="text-sm font-medium mb-3">Sources de financement (max 8)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50">
                {["Bailleur / Source", "Type", "Montant (FCFA)", "Taux intérêt (%)", "Durée (mois)", "Conditions / Remarques", ""].map(h => (
                  <th key={h} className="border border-gray-200 px-2 py-1.5 text-left font-medium text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.sources_financement.map(f => (
                <tr key={f.id}>
                  <td className="border border-gray-200 px-1 min-w-[160px]">
                    <input className={inputCls} value={f.bailleur} onChange={e => updF(f.id, "bailleur", e.target.value)} placeholder="Ex : AFD, UNICEF, BOAD…" />
                  </td>
                  <td className="border border-gray-200 px-1 w-40">
                    <select className={inputCls} value={f.type} onChange={e => updF(f.id, "type", e.target.value)}>
                      {TYPES_FINANCEMENT.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </td>
                  <td className="border border-gray-200 px-1 w-36">
                    <input type="number" className={inputCls} value={f.montant || ""} onChange={e => updF(f.id, "montant", parseFloat(e.target.value) || 0)} />
                  </td>
                  <td className="border border-gray-200 px-1 w-28">
                    <input type="number" className={inputCls} value={f.taux_interet || ""} step={0.1} disabled={f.type === "subvention" || f.type === "fonds_propres"} onChange={e => updF(f.id, "taux_interet", parseFloat(e.target.value) || 0)} />
                  </td>
                  <td className="border border-gray-200 px-1 w-24">
                    <input type="number" className={inputCls} value={f.duree_mois || ""} disabled={f.type === "subvention" || f.type === "fonds_propres"} onChange={e => updF(f.id, "duree_mois", parseFloat(e.target.value) || 0)} />
                  </td>
                  <td className="border border-gray-200 px-1 min-w-[180px]">
                    <input className={inputCls} value={f.conditions} onChange={e => updF(f.id, "conditions", e.target.value)} placeholder="Ex : Max 80% budget" />
                  </td>
                  <td className="border border-gray-200 px-1">
                    <DelBtn onClick={() => setState(s => ({ ...s, sources_financement: s.sources_financement.filter(x => x.id !== f.id) }))} />
                  </td>
                </tr>
              ))}
              <tr className="bg-purple-50 font-medium text-purple-800">
                <td colSpan={2} className="border border-gray-200 px-2 py-1.5">Total financement</td>
                <td className="border border-gray-200 px-2 text-right">{fmt(totalFinancement)}</td>
                <td colSpan={4} className="border border-gray-200" />
              </tr>
            </tbody>
          </table>
        </div>
        {state.sources_financement.length < 8 && (
          <AddBtn label="Ajouter une source" onClick={() => setState(s => ({ ...s, sources_financement: [...s.sources_financement, { id: uid(), bailleur: "", type: "subvention", montant: 0, taux_interet: 0, duree_mois: 0, conditions: "" }] }))} />
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="text-xs font-medium text-blue-800 mb-2">Règle AFD — Subventions max 80%</div>
          <div className={`text-lg font-medium ${pctSubventions > 80 ? 'text-red-600' : 'text-blue-800'}`}>{fmtPct(pctSubventions)} subventions</div>
          {pctSubventions > 80 && <div className="text-xs text-red-600 mt-1">⚠️ Dépasse le plafond AFD de 80%</div>}
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <div className="text-xs font-medium text-emerald-800 mb-2">Contrepartie locale min 20%</div>
          <div className={`text-lg font-medium ${pctFondsPropres < 20 && totalFinancement > 0 ? 'text-red-600' : 'text-emerald-800'}`}>{fmtPct(pctFondsPropres)} fonds propres</div>
          {pctFondsPropres < 20 && totalFinancement > 0 && <div className="text-xs text-red-600 mt-1">⚠️ Insuffisant — min 20% requis</div>}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ONGLET 4 — BUDGET CONSOLIDÉ
// ─────────────────────────────────────────────
function Tab4({ state }: { state: MoteurSocialState }) {
  const totalActivites = state.activites.reduce((s, a) => s + a.quantite * a.cout_unitaire, 0);
  const totalPersonnel = state.personnel.reduce((s, p) => s + p.nbre * p.salaire_mensuel * p.mois * (p.type === "permanent" ? 1.2 : 1), 0);
  const totalFonct = state.charges_fonctionnement.reduce((s, c) => s + c.montant_mensuel * c.mois, 0);
  const sousTotal = totalActivites + totalPersonnel + totalFonct;
  const imprevus = sousTotal * state.reserve_imprevus_pct / 100;
  const budgetTotal = sousTotal + imprevus;
  const totalFinancement = state.sources_financement.reduce((s, f) => s + f.montant, 0);
  const pctPersonnel = budgetTotal > 0 ? totalPersonnel / budgetTotal * 100 : 0;

  const lignes = [
    { label: "Coût des activités programmatiques", val: totalActivites, pct: budgetTotal > 0 ? totalActivites / budgetTotal * 100 : 0, color: "bg-purple-50" },
    { label: "Masse salariale (charges sociales incluses)", val: totalPersonnel, pct: pctPersonnel, color: "bg-amber-50" },
    { label: "Charges de fonctionnement", val: totalFonct, pct: budgetTotal > 0 ? totalFonct / budgetTotal * 100 : 0, color: "bg-gray-50" },
    { label: `Provision imprévus (${state.reserve_imprevus_pct}%)`, val: imprevus, pct: state.reserve_imprevus_pct, color: "bg-gray-50" },
  ];

  return (
    <div>
      <Card>
        <h3 className="text-sm font-medium mb-4">Budget consolidé du projet</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50">
                {["Poste budgétaire", "Montant (FCFA)", "% du budget total", "Conformité bailleurs"].map(h => (
                  <th key={h} className="border border-gray-200 px-3 py-2 text-left font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lignes.map(l => (
                <tr key={l.label} className={l.color}>
                  <td className="border border-gray-200 px-3 py-2">{l.label}</td>
                  <td className="border border-gray-200 px-3 py-2 text-right font-medium">{fmt(l.val)}</td>
                  <td className="border border-gray-200 px-3 py-2 text-right">{fmtPct(l.pct)}</td>
                  <td className="border border-gray-200 px-3 py-2">
                    {l.label.includes("salariale") && (
                      <Badge color={pctPersonnel > 30 ? "red" : "green"}>
                        {pctPersonnel > 30 ? `⚠️ ${fmtPct(pctPersonnel)} > 30% plafond AFD` : `✅ ${fmtPct(pctPersonnel)} ≤ 30%`}
                      </Badge>
                    )}
                    {l.label.includes("imprévus") && (
                      <Badge color={state.reserve_imprevus_pct > 15 ? "red" : "green"}>
                        {state.reserve_imprevus_pct > 15 ? "⚠️ > 15% max UNICEF" : "✅ Dans les normes"}
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="bg-purple-100 font-medium text-purple-900">
                <td className="border border-gray-200 px-3 py-2">BUDGET TOTAL DU PROJET</td>
                <td className="border border-gray-200 px-3 py-2 text-right text-base">{fmt(budgetTotal)}</td>
                <td className="border border-gray-200 px-3 py-2 text-right">100%</td>
                <td className="border border-gray-200 px-3 py-2" />
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Répartition par année */}
      <Card>
        <h3 className="text-sm font-medium mb-3">Projection budgétaire pluriannuelle</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 px-3 py-2 text-left font-medium text-gray-500">Poste</th>
                {Array.from({ length: state.duree_projet_ans }, (_, i) => (
                  <th key={i} className="border border-gray-200 px-3 py-2 text-right font-medium text-gray-500">An {i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Activités", an1: totalActivites },
                { label: "Personnel", an1: totalPersonnel },
                { label: "Fonctionnement", an1: totalFonct },
                { label: "Imprévus", an1: imprevus },
              ].map(row => (
                <tr key={row.label}>
                  <td className="border border-gray-200 px-3 py-1.5">{row.label}</td>
                  {Array.from({ length: state.duree_projet_ans }, (_, i) => {
                    const facteur = i === 0 ? 1 : Math.pow(1 + state.taux_croissance_beneficiaires / 100, i);
                    return (
                      <td key={i} className="border border-gray-200 px-3 py-1.5 text-right">{fmt(row.an1 * facteur)}</td>
                    );
                  })}
                </tr>
              ))}
              <tr className="bg-purple-50 font-medium text-purple-800">
                <td className="border border-gray-200 px-3 py-1.5">TOTAL</td>
                {Array.from({ length: state.duree_projet_ans }, (_, i) => {
                  const facteur = i === 0 ? 1 : Math.pow(1 + state.taux_croissance_beneficiaires / 100, i);
                  return (
                    <td key={i} className="border border-gray-200 px-3 py-1.5 text-right">{fmt(budgetTotal * facteur)}</td>
                  );
                })}
              </tr>
              <tr className="bg-blue-50 font-medium text-blue-800">
                <td className="border border-gray-200 px-3 py-1.5">Financement disponible</td>
                {Array.from({ length: state.duree_projet_ans }, (_, i) => (
                  <td key={i} className="border border-gray-200 px-3 py-1.5 text-right">{i === 0 ? fmt(totalFinancement) : "—"}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────
// ONGLET 5 — RATIOS BAILLEURS
// ─────────────────────────────────────────────
function Tab5({ state }: { state: MoteurSocialState }) {
  const totalActivites = state.activites.reduce((s, a) => s + a.quantite * a.cout_unitaire, 0);
  const totalPersonnel = state.personnel.reduce((s, p) => s + p.nbre * p.salaire_mensuel * p.mois * (p.type === "permanent" ? 1.2 : 1), 0);
  const totalFonct = state.charges_fonctionnement.reduce((s, c) => s + c.montant_mensuel * c.mois, 0);
  const sousTotal = totalActivites + totalPersonnel + totalFonct;
  const imprevus = sousTotal * state.reserve_imprevus_pct / 100;
  const budgetTotal = sousTotal + imprevus;
  const totalBenef = state.beneficiaires.reduce((s, b) => s + b.nombre, 0);
  const totalRecettes = state.recettes_services.reduce((s, r) => s + r.volume_annuel * r.tarif, 0);
  const totalSubventions = state.sources_financement.filter(f => f.type === "subvention").reduce((s, f) => s + f.montant, 0);
  const totalFondsPropres = state.sources_financement.filter(f => f.type === "fonds_propres").reduce((s, f) => s + f.montant, 0);
  const totalFinancement = state.sources_financement.reduce((s, f) => s + f.montant, 0);

  // Ratios clés bailleurs
  const coutParBenef = totalBenef > 0 ? budgetTotal / totalBenef : 0;
  const pctPersonnel = budgetTotal > 0 ? totalPersonnel / budgetTotal * 100 : 0;
  const pctActivites = budgetTotal > 0 ? totalActivites / budgetTotal * 100 : 0;
  const pctSubventions = totalFinancement > 0 ? totalSubventions / totalFinancement * 100 : 0;
  const pctContrepartie = totalFinancement > 0 ? totalFondsPropres / totalFinancement * 100 : 0;
  // OSR : Operational Self-Reliance = recettes / charges opérationnelles
  const osr = (totalPersonnel + totalFonct) > 0 ? totalRecettes / (totalPersonnel + totalFonct) * 100 : 0;
  // FSS : Financial Self-Sufficiency (recettes / total charges)
  const fss = budgetTotal > 0 ? totalRecettes / budgetTotal * 100 : 0;
  // Taux d'absorption (financement / budget)
  const tauxAbsorption = budgetTotal > 0 ? totalFinancement / budgetTotal * 100 : 0;
  const ecartBudget = budgetTotal - totalFinancement;

  const ratios = [
    {
      label: "Coût par bénéficiaire direct",
      val: fmt(coutParBenef) + " FCFA",
      cible: "< 150 000 FCFA (AFD/BID standard PME sociale)",
      ok: coutParBenef < 150000 && coutParBenef > 0,
      explication: "Budget total ÷ nombre total de bénéficiaires. Ratio #1 examiné par tout comité de bailleur."
    },
    {
      label: "% charges de personnel / budget total",
      val: fmtPct(pctPersonnel),
      cible: "≤ 30% (plafond AFD standard)",
      ok: pctPersonnel <= 30 && pctPersonnel > 0,
      explication: "Si > 30%, le projet est perçu comme bureaucratique. Les bailleurs veulent voir l'argent aller aux activités."
    },
    {
      label: "% budget consacré aux activités directes",
      val: fmtPct(pctActivites),
      cible: "≥ 60% (standard impact bailleurs)",
      ok: pctActivites >= 60,
      explication: "Prouve que le cœur du projet bénéficie directement aux populations cibles."
    },
    {
      label: "% subventions / total financement",
      val: fmtPct(pctSubventions),
      cible: "≤ 80% (règle AFD I-OSC)",
      ok: pctSubventions <= 80,
      explication: "Au-delà de 80%, le projet n'est pas finançable par AFD. Le cofinancement prouve l'ancrage local."
    },
    {
      label: "% contrepartie locale / total financement",
      val: fmtPct(pctContrepartie),
      cible: "≥ 20% (exigence AFD / BID)",
      ok: pctContrepartie >= 20,
      explication: "Apport de l'ONG, de l'État local ou d'autres sources non-bailleur principal. Signe d'engagement."
    },
    {
      label: "OSR — Autonomie opérationnelle",
      val: fmtPct(osr),
      cible: "≥ 100% pour pérennité (vision long terme)",
      ok: osr >= 100,
      explication: "Recettes propres ÷ charges de personnel + fonctionnement. Mesure la capacité à survivre sans subvention."
    },
    {
      label: "FSS — Suffisance financière globale",
      val: fmtPct(fss),
      cible: "≥ 30% an 1 / ≥ 70% an 3 (trajectoire viabilité)",
      ok: fss >= 30,
      explication: "Recettes propres ÷ budget total. Trajectoire de sortie de dépendance aux bailleurs."
    },
    {
      label: "Taux de couverture budgétaire",
      val: fmtPct(tauxAbsorption),
      cible: "= 100% (budget équilibré)",
      ok: Math.abs(ecartBudget) < budgetTotal * 0.02,
      explication: "Financement total ÷ budget total. Doit être égal à 100% — tout écart doit être expliqué dans la note."
    },
  ];

  return (
    <div>
      <p className="text-xs text-gray-500 mb-4">
        Ces 8 ratios sont ceux que les comités AFD, BID, UNICEF, BAD et Fondations privées examinent en premier lors de l'instruction d'un dossier social.
        Chaque ratio hors cible génère une question de clarification ou un refus.
      </p>

      <div className="space-y-3">
        {ratios.map(r => (
          <div key={r.label} className={`rounded-xl border p-4 ${r.ok ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
            <div className="flex justify-between items-start mb-2">
              <div className="flex-1 min-w-0 pr-4">
                <div className="text-sm font-medium text-gray-800">{r.label}</div>
                <div className="text-xs text-gray-500 mt-0.5">Cible : {r.cible}</div>
                <div className="text-xs text-gray-400 mt-1 italic">{r.explication}</div>
              </div>
              <Badge color={r.ok ? "green" : "red"}>{r.val}</Badge>
            </div>
          </div>
        ))}
      </div>

      {/* Synthèse globale */}
      <div className="mt-4 bg-purple-50 border border-purple-200 rounded-xl p-5">
        <h4 className="text-sm font-medium text-purple-900 mb-3">Synthèse du projet social</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Budget total", val: fmt(budgetTotal) + " FCFA" },
            { label: "Bénéficiaires an 1", val: fmt(totalBenef) },
            { label: "Coût / bénéficiaire", val: fmt(coutParBenef) + " FCFA" },
            { label: "Recettes propres", val: fmt(totalRecettes) + " FCFA" },
            { label: "Subventions", val: fmt(totalSubventions) + " FCFA" },
            { label: "Contrepartie locale", val: fmt(totalFondsPropres) + " FCFA" },
            { label: "Ratio personnel", val: fmtPct(pctPersonnel) },
            { label: "Durée projet", val: state.duree_projet_ans + " ans" },
          ].map(item => (
            <div key={item.label} className="bg-white rounded-lg p-3">
              <div className="text-xs text-gray-500">{item.label}</div>
              <div className="text-sm font-medium mt-0.5">{item.val}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// COMPOSANT PRINCIPAL
// ─────────────────────────────────────────────
type TabKey = "1" | "2" | "3" | "4" | "5";

const TABS: { key: TabKey; label: string }[] = [
  { key: "1", label: "1 — Activités & Bénéficiaires" },
  { key: "2", label: "2 — Personnel & Fonctionnement" },
  { key: "3", label: "3 — Sources de financement" },
  { key: "4", label: "4 — Budget consolidé" },
  { key: "5", label: "5 — Ratios bailleurs" },
];

export default function MoteurSocialPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("1");
  const [state, setState] = useState<MoteurSocialState>(initialState);
  const [ctx, setCtx] = useState<{ nomProjet?: string; modele?: string; secteur?: string; zone?: string } | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('architect_context');
      if (raw) {
        const parsed = JSON.parse(raw);
        setCtx(parsed);
        setState(s => ({
          ...s,
          nom_projet: parsed.nomProjet || "",
          secteur: parsed.secteur || "",
          zone: parsed.zone || "Bénin",
          modele: parsed.modele || "",
        }));
      }
    } catch { }
  }, []);

  const totalActivites = state.activites.reduce((s, a) => s + a.quantite * a.cout_unitaire, 0);
  const totalPersonnel = state.personnel.reduce((s, p) => s + p.nbre * p.salaire_mensuel * p.mois * (p.type === "permanent" ? 1.2 : 1), 0);
  const totalFonct = state.charges_fonctionnement.reduce((s, c) => s + c.montant_mensuel * c.mois, 0);
  const sousTotal = totalActivites + totalPersonnel + totalFonct;
  const budgetTotal = sousTotal + sousTotal * state.reserve_imprevus_pct / 100;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium border border-purple-200">Modèle Social</span>
              {ctx?.modele && <span className="text-xs text-gray-500">{ctx.modele}</span>}
            </div>
            <h1 className="text-2xl font-medium text-gray-900">
              {state.nom_projet || "ARCHITECT — Moteur financier social"}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Budget ONG/projet · Ratios AFD / BID / UNICEF / BAD · Normes OHADA
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <a href="/eden/architect/moteur" className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg">⚙️ Moteur commercial</a>
            <a href="/eden/architect" className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg">← Retour sélecteur</a>
          </div>
        </div>

        {/* Barre budget live */}
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-3 mb-6 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div><span className="text-xs text-gray-500">Budget total : </span><span className="text-sm font-medium text-purple-800">{fmt(budgetTotal)} FCFA</span></div>
            <div><span className="text-xs text-gray-500">Activités : </span><span className="text-sm font-medium">{fmt(totalActivites)} FCFA</span></div>
            <div><span className="text-xs text-gray-500">Personnel : </span><span className="text-sm font-medium">{fmt(totalPersonnel)} FCFA</span></div>
            <div><span className="text-xs text-gray-500">Fonctionnement : </span><span className="text-sm font-medium">{fmt(totalFonct)} FCFA</span></div>
          </div>
          <Badge color={budgetTotal > 0 ? "purple" : "gray"}>
            {budgetTotal > 0 ? `${state.duree_projet_ans} ans · ${fmt(budgetTotal / (state.duree_projet_ans || 1))} FCFA/an` : "Saisir les données"}
          </Badge>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto pb-px">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2 text-sm whitespace-nowrap border-b-2 transition-colors ${activeTab === t.key ? "border-purple-600 text-purple-700 font-medium" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Contenu */}
        <div>
          {activeTab === "1" && <Tab1 state={state} setState={setState} />}
          {activeTab === "2" && <Tab2 state={state} setState={setState} />}
          {activeTab === "3" && <Tab3 state={state} setState={setState} budgetTotal={budgetTotal} />}
          {activeTab === "4" && <Tab4 state={state} />}
          {activeTab === "5" && <Tab5 state={state} />}
        </div>
      </div>
    </div>
  );
}
