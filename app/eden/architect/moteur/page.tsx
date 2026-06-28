"use client";

import { useState, useCallback, useEffect } from "react";
import { createBrowserSupabaseClient } from '@/app/supabaseClient'

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

interface Terrain {
  id: string;
  nom: string;
  detail: string;
  prix: number;
  duree: number; // années amortissement (0 = non amortissable ex: terrain nu)
}

interface Equipement {
  id: string;
  nom: string;
  qte: number;
  pu: number;
  dateEntree: string;
  duree: number; // années
}

interface MatierePremiere {
  nom: string;
  cu: number; // coût unitaire
}

interface Produit {
  id: string;
  nom: string;
  unite: string; // ← NOUVEAU : unité de mesure
  pu: number; // prix de vente unitaire FCFA
  saisonnier: boolean;
  qteMois: number[]; // 12 valeurs
  // Coût de revient
  mp: MatierePremiere[]; // 3 MP
  mod: number; // main d'œuvre directe unitaire
  moi: number; // main d'œuvre indirecte unitaire
}

interface Salaire {
  id: string;
  poste: string;
  nbre: number;
  salaire: number; // base mensuelle
}

interface ChargeFix {
  id: string;
  nom: string;
  pu: number; // coût mensuel
  mois: number; // nombre de mois/an
}

interface Emprunt {
  id: string;
  nom: string;
  montant: number;
  taux: number; // % annuel
  duree: number; // mois
  differe: number; // mois
  type: "annuites" | "capital";
}

interface MoteurState {
  terrains: Terrain[];
  equips: Equipement[];
  produits: Produit[];
  salaires: Salaire[];
  chargesFix: ChargeFix[];
  emprunts: Emprunt[];
  bfrMoisFix: number;
  bfrMoisVar: number;
  apportPerso: number;
  tauxCroissance: number;
  // Données projet héritées d'ARCHITECT
  nomProjet?: string;
  secteur?: string;
  zone?: string;
  juridique?: string;
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 9);
const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR");
const fmtPct = (n: number) => (Math.round(n * 10) / 10).toFixed(1) + "%";

function calcEcheance(em: Emprunt) {
  const P = em.montant;
  const t = em.taux / 100 / 12;
  const n = em.duree - em.differe;
  let mensuelle = 0;
  let totalInterets = 0;
  if (em.type === "annuites" && t > 0 && n > 0) {
    mensuelle = (P * t * Math.pow(1 + t, n)) / (Math.pow(1 + t, n) - 1);
    totalInterets = mensuelle * n - P;
  } else if (em.type === "capital" && n > 0) {
    mensuelle = P / n + P * t;
    totalInterets = (P * t * (n + 1)) / 2;
  }
  return { mensuelle, totalInterets, coutTotal: P + totalInterets };
}

function getCAP(p: Produit) {
  return p.qteMois.reduce((s, q) => s + q, 0) * p.pu;
}

function getCRUnitaire(p: Produit) {
  return p.mp.reduce((s, m) => s + (m.cu || 0), 0) + (p.mod || 0) + (p.moi || 0);
}

// ─────────────────────────────────────────────
// ÉTAT INITIAL
// ─────────────────────────────────────────────

const emptyProduit = (): Produit => ({
  id: uid(),
  nom: "",
  unite: "",
  pu: 0,
  saisonnier: false,
  qteMois: Array(12).fill(0),
  mp: [
    { nom: "", cu: 0 },
    { nom: "", cu: 0 },
    { nom: "", cu: 0 },
  ],
  mod: 0,
  moi: 0,
});

const initialState: MoteurState = {
  terrains: [{ id: uid(), nom: "", detail: "", prix: 0, duree: 0 }],
  equips: [
    { id: uid(), nom: "", qte: 1, pu: 0, dateEntree: "", duree: 5 },
    { id: uid(), nom: "", qte: 1, pu: 0, dateEntree: "", duree: 5 },
  ],
  produits: [emptyProduit(), emptyProduit()],
  salaires: [
    { id: uid(), poste: "", nbre: 1, salaire: 0 },
    { id: uid(), poste: "", nbre: 1, salaire: 0 },
    { id: uid(), poste: "", nbre: 1, salaire: 0 },
  ],
  chargesFix: [
    { id: uid(), nom: "Loyer", pu: 0, mois: 12 },
    { id: uid(), nom: "Eau", pu: 0, mois: 12 },
    { id: uid(), nom: "Électricité", pu: 0, mois: 12 },
    { id: uid(), nom: "Téléphone", pu: 0, mois: 12 },
    { id: uid(), nom: "Connexion internet", pu: 0, mois: 12 },
  ],
  emprunts: [{ id: uid(), nom: "", montant: 0, taux: 10, duree: 60, differe: 0, type: "annuites" }],
  bfrMoisFix: 3,
  bfrMoisVar: 2,
  apportPerso: 0,
  tauxCroissance: 10,
};

// ─────────────────────────────────────────────
// SOUS-COMPOSANTS UI
// ─────────────────────────────────────────────

function Badge({ children, color }: { children: React.ReactNode; color: "green" | "blue" | "amber" | "red" | "gray" }) {
  const colors = {
    green: "bg-emerald-50 text-emerald-800 border-emerald-200",
    blue: "bg-blue-50 text-blue-800 border-blue-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    red: "bg-red-50 text-red-800 border-red-200",
    gray: "bg-gray-100 text-gray-700 border-gray-200",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[color]}`}>
      {children}
    </span>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white border border-gray-200 rounded-xl p-5 mb-3 ${className}`}>{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-500">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500 bg-white";
const readonlyCls = "w-full px-2.5 py-1.5 text-sm border border-gray-100 rounded-lg bg-gray-50 font-medium text-emerald-700";

function AddBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 mt-2"
    >
      + {label}
    </button>
  );
}

function DelBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="px-2 text-gray-300 hover:text-red-500 text-lg leading-none">
      ×
    </button>
  );
}

// ─────────────────────────────────────────────
// ONGLET A — INVESTISSEMENT
// ─────────────────────────────────────────────

function TabA({ state, setState }: { state: MoteurState; setState: React.Dispatch<React.SetStateAction<MoteurState>> }) {
  const totTerrain = state.terrains.reduce((s, t) => s + t.prix, 0);
  const totEquip = state.equips.reduce((s, e) => s + e.qte * e.pu, 0);
  const totSalMensuel = state.salaires.reduce((s, r) => s + r.nbre * r.salaire * 1.2, 0);
  const totChFix = state.chargesFix.reduce((s, c) => s + c.pu * c.mois, 0);
  const ca1 = state.produits.reduce((s, p) => s + getCAP(p), 0);
  const bfr =
    (totSalMensuel + totChFix / 12) * state.bfrMoisFix +
    ((ca1 / 12) * 0.4) * state.bfrMoisVar;
  const totalProjet = totTerrain + totEquip + bfr;

  const updTerrain = (id: string, field: keyof Terrain, val: string | number) =>
    setState((s) => ({ ...s, terrains: s.terrains.map((t) => (t.id === id ? { ...t, [field]: val } : t)) }));
  const updEquip = (id: string, field: keyof Equipement, val: string | number) =>
    setState((s) => ({ ...s, equips: s.equips.map((e) => (e.id === id ? { ...e, [field]: val } : e)) }));

  return (
    <div>
      {/* Terrains & bâtiments */}
      <Card>
        <h3 className="text-sm font-medium mb-3">Terrains et bâtiments</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50">
                {["Désignation", "Détail / superficie", "Prix (FCFA)", "Montant", "Durée amort. (ans)", ""].map((h) => (
                  <th key={h} className="border border-gray-200 px-2 py-1.5 text-left font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.terrains.map((t) => (
                <tr key={t.id}>
                  <td className="border border-gray-200 px-1">
                    <input className={inputCls} value={t.nom} onChange={(e) => updTerrain(t.id, "nom", e.target.value)} placeholder="Ex : Local commercial" />
                  </td>
                  <td className="border border-gray-200 px-1">
                    <input className={inputCls} value={t.detail} onChange={(e) => updTerrain(t.id, "detail", e.target.value)} placeholder="Ex : 120 m²" />
                  </td>
                  <td className="border border-gray-200 px-1">
                    <input type="number" className={inputCls} value={t.prix || ""} onChange={(e) => updTerrain(t.id, "prix", parseFloat(e.target.value) || 0)} />
                  </td>
                  <td className="border border-gray-200 px-2 text-right font-medium bg-gray-50">{fmt(t.prix)}</td>
                  <td className="border border-gray-200 px-1">
                    <input type="number" className={inputCls} value={t.duree || ""} placeholder="0=non amortissable" onChange={(e) => updTerrain(t.id, "duree", parseFloat(e.target.value) || 0)} />
                  </td>
                  <td className="border border-gray-200 px-1">
                    <DelBtn onClick={() => setState((s) => ({ ...s, terrains: s.terrains.filter((x) => x.id !== t.id) }))} />
                  </td>
                </tr>
              ))}
              <tr className="bg-emerald-50 font-medium text-emerald-800">
                <td colSpan={3} className="border border-gray-200 px-2 py-1.5">Sous-total</td>
                <td className="border border-gray-200 px-2 text-right">{fmt(totTerrain)}</td>
                <td colSpan={2} className="border border-gray-200" />
              </tr>
            </tbody>
          </table>
        </div>
        {state.terrains.length < 10 && (
          <AddBtn label="Ajouter terrain / bâtiment" onClick={() => setState((s) => ({ ...s, terrains: [...s.terrains, { id: uid(), nom: "", detail: "", prix: 0, duree: 0 }] }))} />
        )}
      </Card>

      {/* Équipements */}
      <Card>
        <h3 className="text-sm font-medium mb-3">Équipements et matériels (max 30)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50">
                {["Désignation", "Qté", "Prix unitaire", "Montant", "Date entrée", "Durée (ans)", "Amort./an", ""].map((h) => (
                  <th key={h} className="border border-gray-200 px-2 py-1.5 text-left font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.equips.map((e) => {
                const mt = e.qte * e.pu;
                const am = e.duree > 0 ? mt / e.duree : 0;
                return (
                  <tr key={e.id}>
                    <td className="border border-gray-200 px-1 min-w-[140px]">
                      <input className={inputCls} value={e.nom} onChange={(ev) => updEquip(e.id, "nom", ev.target.value)} placeholder="Ex : Groupe électrogène" />
                    </td>
                    <td className="border border-gray-200 px-1 w-16">
                      <input type="number" className={inputCls} value={e.qte} min={1} onChange={(ev) => updEquip(e.id, "qte", parseFloat(ev.target.value) || 1)} />
                    </td>
                    <td className="border border-gray-200 px-1 w-32">
                      <input type="number" className={inputCls} value={e.pu || ""} onChange={(ev) => updEquip(e.id, "pu", parseFloat(ev.target.value) || 0)} />
                    </td>
                    <td className="border border-gray-200 px-2 text-right bg-gray-50 font-medium">{fmt(mt)}</td>
                    <td className="border border-gray-200 px-1 w-32">
                      <input type="date" className={inputCls} value={e.dateEntree} onChange={(ev) => updEquip(e.id, "dateEntree", ev.target.value)} />
                    </td>
                    <td className="border border-gray-200 px-1 w-20">
                      <input type="number" className={inputCls} value={e.duree} min={1} max={50} onChange={(ev) => updEquip(e.id, "duree", parseFloat(ev.target.value) || 5)} />
                    </td>
                    <td className="border border-gray-200 px-2 text-right bg-gray-50 font-medium">{fmt(am)}</td>
                    <td className="border border-gray-200 px-1">
                      <DelBtn onClick={() => setState((s) => ({ ...s, equips: s.equips.filter((x) => x.id !== e.id) }))} />
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-emerald-50 font-medium text-emerald-800">
                <td colSpan={3} className="border border-gray-200 px-2 py-1.5">Sous-total équipements</td>
                <td className="border border-gray-200 px-2 text-right">{fmt(totEquip)}</td>
                <td colSpan={2} className="border border-gray-200" />
                <td className="border border-gray-200 px-2 text-right">
                  {fmt(state.equips.reduce((s, e) => s + (e.duree > 0 ? e.qte * e.pu / e.duree : 0), 0))}
                </td>
                <td className="border border-gray-200" />
              </tr>
            </tbody>
          </table>
        </div>
        {state.equips.length < 30 && (
          <AddBtn label="Ajouter un équipement" onClick={() => setState((s) => ({ ...s, equips: [...s.equips, { id: uid(), nom: "", qte: 1, pu: 0, dateEntree: "", duree: 5 }] }))} />
        )}
      </Card>

      {/* BFR */}
      <Card>
        <h3 className="text-sm font-medium mb-3">Besoin en fonds de roulement (BFR)</h3>
        <p className="text-xs text-gray-500 mb-3">Calculé automatiquement à partir des charges (section C) et du CA prévisionnel.</p>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Mois de couverture — charges fixes">
            <input type="number" className={inputCls} value={state.bfrMoisFix} min={1} max={12} onChange={(e) => setState((s) => ({ ...s, bfrMoisFix: parseFloat(e.target.value) || 3 }))} />
          </Field>
          <Field label="Mois de couverture — charges variables">
            <input type="number" className={inputCls} value={state.bfrMoisVar} min={1} max={12} onChange={(e) => setState((s) => ({ ...s, bfrMoisVar: parseFloat(e.target.value) || 2 }))} />
          </Field>
          <Field label="BFR estimé (FCFA)">
            <input className={readonlyCls} readOnly value={fmt(bfr)} />
          </Field>
        </div>
      </Card>

      {/* Total projet */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[["Terrains & bâtiments", totTerrain], ["Équipements", totEquip], ["BFR", bfr]].map(([l, v]) => (
            <div key={l as string} className="bg-white rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">{l as string}</div>
              <div className="text-base font-medium">{fmt(v as number)} FCFA</div>
            </div>
          ))}
        </div>
        <div className="flex justify-between items-center border-t border-emerald-200 pt-3">
          <span className="text-sm font-medium text-emerald-900">Total du projet</span>
          <span className="text-xl font-medium text-emerald-900">{fmt(totalProjet)} FCFA</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ONGLET B — CHIFFRE D'AFFAIRES
// ─────────────────────────────────────────────

const MOIS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

function TabB({ state, setState }: { state: MoteurState; setState: React.Dispatch<React.SetStateAction<MoteurState>> }) {
  const ca1 = state.produits.reduce((s, p) => s + getCAP(p), 0);
  const tc = state.tauxCroissance / 100;
  const ca2 = ca1 * (1 + tc);
  const ca3 = ca2 * (1 + tc);

  const updProduit = (id: string, field: keyof Produit, val: unknown) =>
    setState((s) => ({ ...s, produits: s.produits.map((p) => (p.id === id ? { ...p, [field]: val } : p)) }));

  const updQteMois = (id: string, mIdx: number, val: number) =>
    setState((s) => ({
      ...s,
      produits: s.produits.map((p) => {
        if (p.id !== id) return p;
        const qteMois = [...p.qteMois];
        qteMois[mIdx] = val;
        return { ...p, qteMois };
      }),
    }));

  const setQteUniforme = (id: string, val: number) =>
    setState((s) => ({
      ...s,
      produits: s.produits.map((p) => (p.id === id ? { ...p, qteMois: Array(12).fill(val) } : p)),
    }));

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-medium">Produits / services (max 10)</h3>
        {state.produits.length < 10 && (
          <AddBtn label="Ajouter un produit/service" onClick={() => setState((s) => ({ ...s, produits: [...s.produits, emptyProduit()] }))} />
        )}
      </div>

      {state.produits.map((p, idx) => {
        const caP = getCAP(p);
        return (
          <Card key={p.id}>
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-medium text-gray-500">Produit / Service {idx + 1}</span>
              <div className="flex items-center gap-2">
                <Badge color={caP > 0 ? "green" : "gray"}>CA an 1 : {fmt(caP)} FCFA</Badge>
                <DelBtn onClick={() => setState((s) => ({ ...s, produits: s.produits.filter((x) => x.id !== p.id) }))} />
              </div>
            </div>

            {/* Ligne principale : nom, unité, prix */}
            <div className="grid grid-cols-4 gap-3 mb-3">
              <div className="col-span-2">
                <Field label="Désignation">
                  <input className={inputCls} value={p.nom} onChange={(e) => updProduit(p.id, "nom", e.target.value)} placeholder="Ex : Sacs de ciment" />
                </Field>
              </div>
              <Field label="Unité de mesure">
                <input className={inputCls} value={p.unite} onChange={(e) => updProduit(p.id, "unite", e.target.value)} placeholder="Ex : kg, sac, litre, m², pièce…" />
              </Field>
              <Field label="Prix de vente unitaire (FCFA)">
                <input type="number" className={inputCls} value={p.pu || ""} onChange={(e) => updProduit(p.id, "pu", parseFloat(e.target.value) || 0)} />
              </Field>
            </div>

            {/* Saisonnalité */}
            <label className="flex items-center gap-2 text-xs text-gray-600 mb-3 cursor-pointer">
              <input
                type="checkbox"
                checked={p.saisonnier}
                onChange={(e) => updProduit(p.id, "saisonnier", e.target.checked)}
              />
              Ventes saisonnières — saisir les quantités mois par mois
            </label>

            {!p.saisonnier ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label={`Quantité vendue par mois (${p.unite || "unité"})`}>
                  <input
                    type="number"
                    className={inputCls}
                    value={p.qteMois[0] || ""}
                    onChange={(e) => setQteUniforme(p.id, parseFloat(e.target.value) || 0)}
                  />
                </Field>
                <Field label="CA annuel calculé">
                  <input className={readonlyCls} readOnly value={fmt(caP) + " FCFA"} />
                </Field>
              </div>
            ) : (
              <div>
                <div className="text-xs text-gray-500 mb-2">Quantités par mois (en {p.unite || "unité"})</div>
                <div className="grid grid-cols-6 gap-2">
                  {MOIS.map((m, i) => (
                    <Field key={m} label={m}>
                      <input
                        type="number"
                        className={inputCls}
                        value={p.qteMois[i] || ""}
                        onChange={(e) => updQteMois(p.id, i, parseFloat(e.target.value) || 0)}
                      />
                    </Field>
                  ))}
                </div>
                <div className="mt-2 text-right">
                  <Badge color="green">Total annuel : {fmt(p.qteMois.reduce((s, q) => s + q, 0))} {p.unite} — CA : {fmt(caP)} FCFA</Badge>
                </div>
              </div>
            )}
          </Card>
        );
      })}

      {/* Récap CA */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-white rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">CA total an 1</div>
            <div className="text-base font-medium">{fmt(ca1)} FCFA</div>
          </div>
          <div className="bg-white rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">CA total an 2</div>
            <div className="text-base font-medium">{fmt(ca2)} FCFA</div>
          </div>
          <div className="bg-white rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">CA total an 3</div>
            <div className="text-base font-medium">{fmt(ca3)} FCFA</div>
          </div>
          <div>
            <Field label="Taux de croissance annuel (%)">
              <input
                type="number"
                className={inputCls}
                value={state.tauxCroissance}
                min={0}
                max={100}
                onChange={(e) => setState((s) => ({ ...s, tauxCroissance: parseFloat(e.target.value) || 0 }))}
              />
            </Field>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ONGLET C — CHARGES
// ─────────────────────────────────────────────

function TabC({ state, setState }: { state: MoteurState; setState: React.Dispatch<React.SetStateAction<MoteurState>> }) {
  const [subTab, setSubTab] = useState<"sal" | "fix">("sal");

  const totSalMensuel = state.salaires.reduce((s, r) => s + r.nbre * r.salaire * 1.2, 0);
  const totChFix = state.chargesFix.reduce((s, c) => s + c.pu * c.mois, 0);

  const updSal = (id: string, field: keyof Salaire, val: string | number) =>
    setState((s) => ({ ...s, salaires: s.salaires.map((r) => (r.id === id ? { ...r, [field]: val } : r)) }));
  const updChFix = (id: string, field: keyof ChargeFix, val: string | number) =>
    setState((s) => ({ ...s, chargesFix: s.chargesFix.map((c) => (c.id === id ? { ...c, [field]: val } : c)) }));

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {(["sal", "fix"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`px-3 py-1 text-xs rounded-full border ${subTab === t ? "bg-emerald-600 text-white border-emerald-600" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}
          >
            {t === "sal" ? "Masse salariale" : "Autres charges fixes"}
          </button>
        ))}
      </div>

      {subTab === "sal" && (
        <Card>
          <h3 className="text-sm font-medium mb-3">Masse salariale (max 15 postes)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  {["Poste", "Nbre", "Salaire de base", "Charges sociales (20%)", "Coût mensuel total", ""].map((h) => (
                    <th key={h} className="border border-gray-200 px-2 py-1.5 text-left font-medium text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.salaires.map((r) => {
                  const cs = r.salaire * 0.2;
                  const cout = r.nbre * (r.salaire + cs);
                  return (
                    <tr key={r.id}>
                      <td className="border border-gray-200 px-1 min-w-[160px]">
                        <input className={inputCls} value={r.poste} onChange={(e) => updSal(r.id, "poste", e.target.value)} placeholder="Ex : Directeur commercial" />
                      </td>
                      <td className="border border-gray-200 px-1 w-16">
                        <input type="number" className={inputCls} value={r.nbre} min={1} onChange={(e) => updSal(r.id, "nbre", parseFloat(e.target.value) || 1)} />
                      </td>
                      <td className="border border-gray-200 px-1 w-36">
                        <input type="number" className={inputCls} value={r.salaire || ""} onChange={(e) => updSal(r.id, "salaire", parseFloat(e.target.value) || 0)} />
                      </td>
                      <td className="border border-gray-200 px-2 text-right bg-gray-50">{fmt(cs * r.nbre)}</td>
                      <td className="border border-gray-200 px-2 text-right bg-gray-50 font-medium">{fmt(cout)}</td>
                      <td className="border border-gray-200 px-1">
                        <DelBtn onClick={() => setState((s) => ({ ...s, salaires: s.salaires.filter((x) => x.id !== r.id) }))} />
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-emerald-50 font-medium text-emerald-800">
                  <td colSpan={4} className="border border-gray-200 px-2 py-1.5">Total mensuel</td>
                  <td className="border border-gray-200 px-2 text-right">{fmt(totSalMensuel)}</td>
                  <td className="border border-gray-200" />
                </tr>
              </tbody>
            </table>
          </div>
          {state.salaires.length < 15 && (
            <AddBtn label="Ajouter un poste" onClick={() => setState((s) => ({ ...s, salaires: [...s.salaires, { id: uid(), poste: "", nbre: 1, salaire: 0 }] }))} />
          )}
          <div className="mt-3 bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-500">Masse salariale annuelle</div>
            <div className="text-base font-medium mt-0.5">{fmt(totSalMensuel * 12)} FCFA</div>
          </div>
        </Card>
      )}

      {subTab === "fix" && (
        <Card>
          <h3 className="text-sm font-medium mb-3">Autres charges fixes (max 20)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  {["Nature de la charge", "Coût mensuel (FCFA)", "Nbre mois/an", "Montant annuel", ""].map((h) => (
                    <th key={h} className="border border-gray-200 px-2 py-1.5 text-left font-medium text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.chargesFix.map((c) => {
                  const ann = c.pu * c.mois;
                  return (
                    <tr key={c.id}>
                      <td className="border border-gray-200 px-1 min-w-[180px]">
                        <input className={inputCls} value={c.nom} onChange={(e) => updChFix(c.id, "nom", e.target.value)} />
                      </td>
                      <td className="border border-gray-200 px-1 w-36">
                        <input type="number" className={inputCls} value={c.pu || ""} onChange={(e) => updChFix(c.id, "pu", parseFloat(e.target.value) || 0)} />
                      </td>
                      <td className="border border-gray-200 px-1 w-24">
                        <input type="number" className={inputCls} value={c.mois} min={1} max={12} onChange={(e) => updChFix(c.id, "mois", parseFloat(e.target.value) || 12)} />
                      </td>
                      <td className="border border-gray-200 px-2 text-right bg-gray-50 font-medium">{fmt(ann)}</td>
                      <td className="border border-gray-200 px-1">
                        <DelBtn onClick={() => setState((s) => ({ ...s, chargesFix: s.chargesFix.filter((x) => x.id !== c.id) }))} />
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-emerald-50 font-medium text-emerald-800">
                  <td colSpan={3} className="border border-gray-200 px-2 py-1.5">Total annuel</td>
                  <td className="border border-gray-200 px-2 text-right">{fmt(totChFix)}</td>
                  <td className="border border-gray-200" />
                </tr>
              </tbody>
            </table>
          </div>
          {state.chargesFix.length < 20 && (
            <AddBtn label="Ajouter une charge" onClick={() => setState((s) => ({ ...s, chargesFix: [...s.chargesFix, { id: uid(), nom: "", pu: 0, mois: 12 }] }))} />
          )}
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// ONGLET COÛT DE REVIENT
// ─────────────────────────────────────────────

function TabCR({ state, setState }: { state: MoteurState; setState: React.Dispatch<React.SetStateAction<MoteurState>> }) {
  const tc = state.tauxCroissance / 100;

  const updMP = (pid: string, mpIdx: number, field: keyof MatierePremiere, val: string | number) =>
    setState((s) => ({
      ...s,
      produits: s.produits.map((p) => {
        if (p.id !== pid) return p;
        const mp = [...p.mp];
        mp[mpIdx] = { ...mp[mpIdx], [field]: val };
        return { ...p, mp };
      }),
    }));

  const updProduitCR = (id: string, field: "mod" | "moi", val: number) =>
    setState((s) => ({ ...s, produits: s.produits.map((p) => (p.id === id ? { ...p, [field]: val } : p)) }));

  const totCA = state.produits.reduce((s, p) => s + getCAP(p), 0);
  const totMB = state.produits.reduce((p_s, p) => {
    const cr = getCRUnitaire(p);
    const mb = p.pu > 0 ? (p.pu - cr) / p.pu : 0;
    return p_s + getCAP(p) * mb;
  }, 0);
  const txMBGlobal = totCA > 0 ? totMB / totCA : 0;

  return (
    <div>
      <p className="text-xs text-gray-500 mb-4">
        Décomposez le coût de revient unitaire de chaque produit/service saisi en section B.
        Les marges se calculent automatiquement et alimentent le compte de résultat.
      </p>

      {state.produits.length === 0 && (
        <div className="text-sm text-gray-400 text-center py-8">Aucun produit saisi — ajoutez-en dans l'onglet B d'abord.</div>
      )}

      {state.produits.map((p, idx) => {
        const cr = getCRUnitaire(p);
        const mb = p.pu - cr;
        const tmb = p.pu > 0 ? (mb / p.pu) * 100 : 0;
        const ca1P = getCAP(p);
        const mbAn1 = ca1P * (p.pu > 0 ? mb / p.pu : 0);
        return (
          <Card key={p.id}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-medium">{p.nom || "Produit / Service " + (idx + 1)}</h3>
              <div className="flex gap-2">
                <Badge color="blue">PV : {fmt(p.pu)} FCFA / {p.unite || "unité"}</Badge>
                <Badge color={tmb >= 40 ? "green" : tmb >= 20 ? "amber" : "red"}>
                  Marge : {fmtPct(tmb)}
                </Badge>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-2 py-1.5 text-left font-medium text-gray-500">Composante</th>
                    <th className="border border-gray-200 px-2 py-1.5 text-left font-medium text-gray-500">Désignation</th>
                    <th className="border border-gray-200 px-2 py-1.5 text-left font-medium text-gray-500">Coût unitaire (FCFA / {p.unite || "unité"})</th>
                  </tr>
                </thead>
                <tbody>
                  {p.mp.map((m, i) => (
                    <tr key={i}>
                      <td className="border border-gray-200 px-2 text-gray-500">Matière première {i + 1}</td>
                      <td className="border border-gray-200 px-1">
                        <input className={inputCls} value={m.nom} onChange={(e) => updMP(p.id, i, "nom", e.target.value)} placeholder={`MP ${i + 1}`} />
                      </td>
                      <td className="border border-gray-200 px-1 w-40">
                        <input type="number" className={inputCls} value={m.cu || ""} onChange={(e) => updMP(p.id, i, "cu", parseFloat(e.target.value) || 0)} />
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td className="border border-gray-200 px-2 text-gray-500">Main d'œuvre directe (MOD)</td>
                    <td className="border border-gray-200 px-2 text-gray-400 text-xs italic">Coût MO directement imputable à l'unité</td>
                    <td className="border border-gray-200 px-1 w-40">
                      <input type="number" className={inputCls} value={p.mod || ""} onChange={(e) => updProduitCR(p.id, "mod", parseFloat(e.target.value) || 0)} />
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-2 text-gray-500">Main d'œuvre indirecte (MOI)</td>
                    <td className="border border-gray-200 px-2 text-gray-400 text-xs italic">Quote-part charges générales de personnel</td>
                    <td className="border border-gray-200 px-1 w-40">
                      <input type="number" className={inputCls} value={p.moi || ""} onChange={(e) => updProduitCR(p.id, "moi", parseFloat(e.target.value) || 0)} />
                    </td>
                  </tr>
                  <tr className="bg-gray-50 font-medium">
                    <td colSpan={2} className="border border-gray-200 px-2 py-1.5">Coût de revient unitaire total</td>
                    <td className="border border-gray-200 px-2 text-right">{fmt(cr)} FCFA</td>
                  </tr>
                  <tr className="bg-emerald-50 font-medium text-emerald-800">
                    <td colSpan={2} className="border border-gray-200 px-2 py-1.5">Marge brute unitaire</td>
                    <td className="border border-gray-200 px-2 text-right">{fmt(mb)} FCFA</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500">CA an 1</div>
                <div className="text-sm font-medium">{fmt(ca1P)} FCFA</div>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3">
                <div className="text-xs text-gray-500">Marge brute an 1</div>
                <div className="text-sm font-medium text-emerald-800">{fmt(mbAn1)} FCFA</div>
              </div>
            </div>
          </Card>
        );
      })}

      {/* Synthèse */}
      {state.produits.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 mt-2">
          <h4 className="text-xs font-medium text-emerald-900 mb-3">Synthèse des marges — An 1</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-emerald-100">
                  {["Produit/Service", "Unité", "PV unit.", "Coût de revient", "Marge brute unit.", "Taux marge", "CA an 1", "Marge brute an 1"].map((h) => (
                    <th key={h} className="border border-emerald-200 px-2 py-1.5 text-left font-medium text-emerald-800">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.produits.map((p, idx) => {
                  const cr = getCRUnitaire(p);
                  const mb = p.pu - cr;
                  const tmb = p.pu > 0 ? (mb / p.pu) * 100 : 0;
                  const ca1P = getCAP(p);
                  const mbA1 = ca1P * (p.pu > 0 ? mb / p.pu : 0);
                  return (
                    <tr key={p.id}>
                      <td className="border border-emerald-200 px-2 py-1">{p.nom || "Produit " + (idx + 1)}</td>
                      <td className="border border-emerald-200 px-2">{p.unite || "—"}</td>
                      <td className="border border-emerald-200 px-2 text-right">{fmt(p.pu)}</td>
                      <td className="border border-emerald-200 px-2 text-right">{fmt(cr)}</td>
                      <td className="border border-emerald-200 px-2 text-right">{fmt(mb)}</td>
                      <td className="border border-emerald-200 px-2 text-right">
                        <Badge color={tmb >= 40 ? "green" : tmb >= 20 ? "amber" : "red"}>{fmtPct(tmb)}</Badge>
                      </td>
                      <td className="border border-emerald-200 px-2 text-right">{fmt(ca1P)}</td>
                      <td className="border border-emerald-200 px-2 text-right font-medium">{fmt(mbA1)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-emerald-200 font-medium text-emerald-900">
                  <td colSpan={5} className="border border-emerald-300 px-2 py-1.5">Marge brute globale an 1</td>
                  <td className="border border-emerald-300 px-2 text-right">{fmtPct(txMBGlobal * 100)}</td>
                  <td className="border border-emerald-300 px-2 text-right">{fmt(totCA)}</td>
                  <td className="border border-emerald-300 px-2 text-right">{fmt(totMB)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// ONGLET D — FINANCEMENT
// ─────────────────────────────────────────────

function TabD({ state, setState }: { state: MoteurState; setState: React.Dispatch<React.SetStateAction<MoteurState>> }) {
  const totTerrain = state.terrains.reduce((s, t) => s + t.prix, 0);
  const totEquip = state.equips.reduce((s, e) => s + e.qte * e.pu, 0);
  const totSalMensuel = state.salaires.reduce((s, r) => s + r.nbre * r.salaire * 1.2, 0);
  const totChFix = state.chargesFix.reduce((s, c) => s + c.pu * c.mois, 0);
  const ca1 = state.produits.reduce((s, p) => s + getCAP(p), 0);
  const bfr = (totSalMensuel + totChFix / 12) * state.bfrMoisFix + ((ca1 / 12) * 0.4) * state.bfrMoisVar;
  const totalProjet = totTerrain + totEquip + bfr;
  const pctApport = totalProjet > 0 ? (state.apportPerso / totalProjet) * 100 : 0;
  const totEmprunts = state.emprunts.reduce((s, e) => s + e.montant, 0);

  const updEmprunt = (id: string, field: keyof Emprunt, val: string | number) =>
    setState((s) => ({ ...s, emprunts: s.emprunts.map((e) => (e.id === id ? { ...e, [field]: val } : e)) }));

  return (
    <div>
      <Card>
        <h3 className="text-sm font-medium mb-3">Apport personnel</h3>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Total projet (calculé)">
            <input className={readonlyCls} readOnly value={fmt(totalProjet) + " FCFA"} />
          </Field>
          <Field label="Apport personnel (FCFA)">
            <input
              type="number"
              className={inputCls}
              value={state.apportPerso || ""}
              onChange={(e) => setState((s) => ({ ...s, apportPerso: parseFloat(e.target.value) || 0 }))}
            />
          </Field>
          <Field label="% apport / total projet">
            <input className={pctApport < 20 && state.apportPerso > 0 ? "w-full px-2.5 py-1.5 text-sm border border-red-300 rounded-lg bg-red-50 font-medium text-red-700" : readonlyCls} readOnly value={fmtPct(pctApport)} />
          </Field>
        </div>
        {pctApport < 20 && state.apportPerso > 0 && (
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            ⚠️ Apport personnel inférieur à 20% du total projet — seuil bancaire standard UEMOA généralement requis.
          </div>
        )}
        <div className="mt-3 bg-gray-50 rounded-lg p-3 grid grid-cols-3 gap-3 text-xs">
          <div><div className="text-gray-500">Total projet</div><div className="font-medium">{fmt(totalProjet)} FCFA</div></div>
          <div><div className="text-gray-500">Apport personnel</div><div className="font-medium">{fmt(state.apportPerso)} FCFA</div></div>
          <div><div className="text-gray-500">Total emprunts</div><div className="font-medium">{fmt(totEmprunts)} FCFA</div></div>
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-medium mb-3">Emprunts bancaires / subventions (max 5)</h3>
        {state.emprunts.map((em, idx) => {
          const ec = calcEcheance(em);
          return (
            <div key={em.id} className="mb-4 p-4 border border-gray-100 rounded-xl">
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs font-medium text-gray-500">Emprunt {idx + 1}</span>
                <DelBtn onClick={() => setState((s) => ({ ...s, emprunts: s.emprunts.filter((x) => x.id !== em.id) }))} />
              </div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <Field label="Objet / Bailleur">
                  <input className={inputCls} value={em.nom} onChange={(e) => updEmprunt(em.id, "nom", e.target.value)} placeholder="Ex : BRS, I&P, BOAD…" />
                </Field>
                <Field label="Montant (FCFA)">
                  <input type="number" className={inputCls} value={em.montant || ""} onChange={(e) => updEmprunt(em.id, "montant", parseFloat(e.target.value) || 0)} />
                </Field>
                <Field label="Taux annuel (%)">
                  <input type="number" className={inputCls} value={em.taux} step={0.1} onChange={(e) => updEmprunt(em.id, "taux", parseFloat(e.target.value) || 0)} />
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <Field label="Durée (mois)">
                  <input type="number" className={inputCls} value={em.duree} onChange={(e) => updEmprunt(em.id, "duree", parseFloat(e.target.value) || 60)} />
                </Field>
                <Field label="Différé (mois)">
                  <input type="number" className={inputCls} value={em.differe} onChange={(e) => updEmprunt(em.id, "differe", parseFloat(e.target.value) || 0)} />
                </Field>
                <Field label="Type de remboursement">
                  <select className={inputCls} value={em.type} onChange={(e) => updEmprunt(em.id, "type", e.target.value as "annuites" | "capital")}>
                    <option value="annuites">Annuités constantes</option>
                    <option value="capital">Capital constant</option>
                  </select>
                </Field>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Badge color="blue">Échéance mensuelle : {fmt(ec.mensuelle)} FCFA</Badge>
                <Badge color="amber">Total intérêts : {fmt(ec.totalInterets)} FCFA</Badge>
                <Badge color="gray">Coût total du crédit : {fmt(ec.coutTotal)} FCFA</Badge>
              </div>
            </div>
          );
        })}
        {state.emprunts.length < 5 && (
          <AddBtn label="Ajouter un emprunt" onClick={() => setState((s) => ({ ...s, emprunts: [...s.emprunts, { id: uid(), nom: "", montant: 0, taux: 10, duree: 60, differe: 0, type: "annuites" }] }))} />
        )}
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────
// ONGLET E — PLAN FINANCIER
// ─────────────────────────────────────────────

function TabE({ state }: { state: MoteurState }) {
  const [subTab, setSubTab] = useState<"cr" | "amort" | "echeancier" | "ratios">("cr");

  // Calculs agrégés
  const ca1 = state.produits.reduce((s, p) => s + getCAP(p), 0);
  const tc = state.tauxCroissance / 100;
  const ca2 = ca1 * (1 + tc);
  const ca3 = ca2 * (1 + tc);

  const totMBval = state.produits.reduce((s, p) => {
    const cr = getCRUnitaire(p);
    const mb = p.pu > 0 ? (p.pu - cr) / p.pu : 0;
    return s + getCAP(p) * mb;
  }, 0);
  const txMB = ca1 > 0 ? totMBval / ca1 : 0;
  const mb1 = totMBval;
  const mb2 = ca2 * txMB;
  const mb3 = ca3 * txMB;

  const salAnn = state.salaires.reduce((s, r) => s + r.nbre * r.salaire * 1.2, 0) * 12;
  const chFix = state.chargesFix.reduce((s, c) => s + c.pu * c.mois, 0);
  const totFixAnn = salAnn + chFix;

  const totAmort = [
    ...state.equips.map((e) => (e.duree > 0 ? (e.qte * e.pu) / e.duree : 0)),
    ...state.terrains.filter((t) => t.duree > 0).map((t) => t.prix / t.duree),
  ].reduce((s, a) => s + a, 0);

  const ebe1 = mb1 - totFixAnn;
  const ebe2 = mb2 - totFixAnn;
  const ebe3 = mb3 - totFixAnn;
  const ebit1 = ebe1 - totAmort;
  const ebit2 = ebe2 - totAmort;
  const ebit3 = ebe3 - totAmort;

  // Intérêts décroissants année par année
  const int1 = state.emprunts.reduce((s, e) => {
    const t = e.taux / 100 / 12;
    return s + e.montant * t * 12;
  }, 0);
  const int2 = int1 * 0.82;
  const int3 = int1 * 0.65;

  const rex1 = ebit1 - int1;
  const rex2 = ebit2 - int2;
  const rex3 = ebit3 - int3;
  const is1 = Math.max(0, rex1 * 0.25);
  const is2 = Math.max(0, rex2 * 0.25);
  const is3 = Math.max(0, rex3 * 0.25);
  const rn1 = rex1 - is1;
  const rn2 = rex2 - is2;
  const rn3 = rex3 - is3;
  const caf1 = rn1 + totAmort;
  const caf2 = rn2 + totAmort;
  const caf3 = rn3 + totAmort;

  const totRemb = state.emprunts.reduce((s, e) => s + calcEcheance(e).mensuelle * 12, 0);
  const dscr = totRemb > 0 ? caf1 / totRemb : 0;

  const totEmprunts = state.emprunts.reduce((s, e) => s + e.montant, 0);
  const totFinancement = state.apportPerso + totEmprunts;
  const autoFin = totFinancement > 0 ? (state.apportPerso / totFinancement) * 100 : 100;
  const levier = state.apportPerso > 0 ? totEmprunts / state.apportPerso : 0;

  const txMBpct = txMB * 100;
  const txEBE1 = ca1 > 0 ? (ebe1 / ca1) * 100 : 0;
  const txEBIT1 = ca1 > 0 ? (ebit1 / ca1) * 100 : 0;
  const txRN1 = ca1 > 0 ? (rn1 / ca1) * 100 : 0;

  // Lignes compte de résultat
  type CRRow = { label: string; an1: number | string; an2: number | string; an3: number | string; type: "normal" | "subtotal" | "total" | "pct" };
  const crRows: CRRow[] = [
    { label: "Chiffre d'affaires (CA) net", an1: ca1, an2: ca2, an3: ca3, type: "total" },
    { label: "(−) Coût des matières / MOD / MOI", an1: ca1 - mb1, an2: ca2 - mb2, an3: ca3 - mb3, type: "normal" },
    { label: "= Marge brute sur marchandises / services", an1: mb1, an2: mb2, an3: mb3, type: "subtotal" },
    { label: "Taux de marge brute", an1: fmtPct(txMBpct), an2: fmtPct(txMBpct), an3: fmtPct(txMBpct), type: "pct" },
    { label: "(−) Masse salariale annuelle", an1: salAnn, an2: salAnn, an3: salAnn, type: "normal" },
    { label: "(−) Autres charges fixes annuelles", an1: chFix, an2: chFix, an3: chFix, type: "normal" },
    { label: "= Excédent brut d'exploitation (EBE)", an1: ebe1, an2: ebe2, an3: ebe3, type: "subtotal" },
    { label: "Taux EBE / CA", an1: fmtPct(txEBE1), an2: ca2 > 0 ? fmtPct((ebe2 / ca2) * 100) : "—", an3: ca3 > 0 ? fmtPct((ebe3 / ca3) * 100) : "—", type: "pct" },
    { label: "(−) Dotations aux amortissements", an1: totAmort, an2: totAmort, an3: totAmort, type: "normal" },
    { label: "= Résultat d'exploitation (EBIT / REX)", an1: ebit1, an2: ebit2, an3: ebit3, type: "subtotal" },
    { label: "Taux EBIT / CA", an1: fmtPct(txEBIT1), an2: ca2 > 0 ? fmtPct((ebit2 / ca2) * 100) : "—", an3: ca3 > 0 ? fmtPct((ebit3 / ca3) * 100) : "—", type: "pct" },
    { label: "(−) Charges financières (intérêts)", an1: int1, an2: int2, an3: int3, type: "normal" },
    { label: "= Résultat avant impôt", an1: rex1, an2: rex2, an3: rex3, type: "subtotal" },
    { label: "(−) Impôt sur les bénéfices (IS 25% OHADA)", an1: is1, an2: is2, an3: is3, type: "normal" },
    { label: "= Résultat net", an1: rn1, an2: rn2, an3: rn3, type: "total" },
    { label: "Taux de marge nette", an1: fmtPct(txRN1), an2: ca2 > 0 ? fmtPct((rn2 / ca2) * 100) : "—", an3: ca3 > 0 ? fmtPct((rn3 / ca3) * 100) : "—", type: "pct" },
    { label: "Capacité d'autofinancement (CAF = RN + Amort.)", an1: caf1, an2: caf2, an3: caf3, type: "subtotal" },
  ];

  const rowStyle = (type: CRRow["type"]) => {
    if (type === "total") return "bg-emerald-100 font-medium text-emerald-900";
    if (type === "subtotal") return "bg-gray-100 font-medium";
    if (type === "pct") return "bg-gray-50 text-gray-500 italic text-xs";
    return "";
  };
  const fmtCell = (v: number | string) => (typeof v === "string" ? v : fmt(v));

  // Ratios
  const ratios = [
    { label: "DSCR — couverture service de la dette", val: dscr.toFixed(2) + "x", target: "≥ 1,25x (bancable)", ok: dscr >= 1.25 },
    { label: "Marge brute", val: fmtPct(txMBpct), target: "≥ 30% commerce / ≥ 50% services", ok: txMBpct >= 30 },
    { label: "Marge EBE", val: fmtPct(txEBE1), target: "≥ 10% cible UEMOA", ok: txEBE1 >= 10 },
    { label: "Marge EBIT", val: fmtPct(txEBIT1), target: "≥ 5% minimum", ok: txEBIT1 >= 5 },
    { label: "Marge nette", val: fmtPct(txRN1), target: "≥ 5% bancable", ok: txRN1 >= 5 },
    { label: "Autonomie financière (apport / total financement)", val: fmtPct(autoFin), target: "≥ 30% apport min. UEMOA", ok: autoFin >= 30 },
    { label: "Levier financier (dettes / apport personnel)", val: levier.toFixed(2) + "x", target: "≤ 3x recommandé", ok: levier <= 3 },
    { label: "CAF an 1 (capacité d'autofinancement)", val: fmt(caf1) + " FCFA", target: "Positive & supérieure au service de la dette", ok: caf1 > 0 },
  ];

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {(["cr", "amort", "echeancier", "ratios"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`px-3 py-1 text-xs rounded-full border ${subTab === t ? "bg-emerald-600 text-white border-emerald-600" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}
          >
            {{ cr: "Compte de résultat", amort: "Amortissements", echeancier: "Échéancier emprunts", ratios: "Ratios bancaires" }[t]}
          </button>
        ))}
      </div>

      {subTab === "cr" && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-200 px-3 py-2 text-left font-medium text-gray-600">Indicateur</th>
                  <th className="border border-gray-200 px-3 py-2 text-right font-medium text-gray-600">An 1</th>
                  <th className="border border-gray-200 px-3 py-2 text-right font-medium text-gray-600">An 2</th>
                  <th className="border border-gray-200 px-3 py-2 text-right font-medium text-gray-600">An 3</th>
                </tr>
              </thead>
              <tbody>
                {crRows.map((r) => (
                  <tr key={r.label} className={rowStyle(r.type)}>
                    <td className="border border-gray-200 px-3 py-1.5">{r.label}</td>
                    <td className="border border-gray-200 px-3 py-1.5 text-right">{fmtCell(r.an1)}</td>
                    <td className="border border-gray-200 px-3 py-1.5 text-right">{fmtCell(r.an2)}</td>
                    <td className="border border-gray-200 px-3 py-1.5 text-right">{fmtCell(r.an3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {subTab === "amort" && (
        <Card>
          <h4 className="text-sm font-medium mb-3">Tableau des amortissements par bien</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  {["Bien", "Valeur brute", "Durée (ans)", "Amort./an", "Cumul an 1", "Cumul an 2", "Cumul an 3", "VNC fin an 3"].map((h) => (
                    <th key={h} className="border border-gray-200 px-2 py-1.5 text-left font-medium text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ...state.equips.map((e) => ({ nom: e.nom, val: e.qte * e.pu, duree: e.duree })),
                  ...state.terrains.filter((t) => t.duree > 0).map((t) => ({ nom: t.nom, val: t.prix, duree: t.duree })),
                ].map((item, i) => {
                  const amAn = item.duree > 0 ? item.val / item.duree : 0;
                  return (
                    <tr key={i}>
                      <td className="border border-gray-200 px-2 py-1">{item.nom || "—"}</td>
                      <td className="border border-gray-200 px-2 text-right">{fmt(item.val)}</td>
                      <td className="border border-gray-200 px-2 text-right">{item.duree}</td>
                      <td className="border border-gray-200 px-2 text-right">{fmt(amAn)}</td>
                      <td className="border border-gray-200 px-2 text-right">{fmt(amAn)}</td>
                      <td className="border border-gray-200 px-2 text-right">{fmt(amAn * 2)}</td>
                      <td className="border border-gray-200 px-2 text-right">{fmt(amAn * 3)}</td>
                      <td className="border border-gray-200 px-2 text-right">{fmt(Math.max(0, item.val - amAn * 3))}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-emerald-50 font-medium text-emerald-800">
                  <td colSpan={3} className="border border-gray-200 px-2 py-1.5">Total</td>
                  <td className="border border-gray-200 px-2 text-right">{fmt(totAmort)}</td>
                  <td className="border border-gray-200 px-2 text-right">{fmt(totAmort)}</td>
                  <td className="border border-gray-200 px-2 text-right">{fmt(totAmort * 2)}</td>
                  <td className="border border-gray-200 px-2 text-right">{fmt(totAmort * 3)}</td>
                  <td className="border border-gray-200 px-2" />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {subTab === "echeancier" && (
        <div>
          {state.emprunts.length === 0 && (
            <div className="text-sm text-gray-400 text-center py-8">Aucun emprunt saisi.</div>
          )}
          {state.emprunts.map((em, idx) => {
            const ec = calcEcheance(em);
            const rows: { an: number; capDeb: number; ech: number; int: number; capR: number; capFin: number }[] = [];
            let cap = em.montant;
            const t = em.taux / 100;
            const nAns = Math.ceil(em.duree / 12);
            for (let y = 1; y <= Math.min(nAns, 10); y++) {
              const int_y = cap * t;
              let capR = ec.mensuelle * 12 - int_y;
              capR = Math.min(capR, cap);
              const capFin = Math.max(0, cap - capR);
              rows.push({ an: y, capDeb: cap, ech: ec.mensuelle * 12, int: int_y, capR, capFin });
              cap = capFin;
              if (cap <= 0) break;
            }
            return (
              <Card key={em.id}>
                <h4 className="text-sm font-medium mb-3">{em.nom || "Emprunt " + (idx + 1)} — {fmt(em.montant)} FCFA @ {em.taux}% / {em.duree} mois</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-50">
                        {["Année", "Capital début", "Échéances annuelles", "Intérêts", "Capital remboursé", "Capital restant"].map((h) => (
                          <th key={h} className="border border-gray-200 px-2 py-1.5 text-left font-medium text-gray-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.an}>
                          <td className="border border-gray-200 px-2 py-1 font-medium">An {r.an}</td>
                          <td className="border border-gray-200 px-2 text-right">{fmt(r.capDeb)}</td>
                          <td className="border border-gray-200 px-2 text-right">{fmt(r.ech)}</td>
                          <td className="border border-gray-200 px-2 text-right text-amber-700">{fmt(r.int)}</td>
                          <td className="border border-gray-200 px-2 text-right">{fmt(r.capR)}</td>
                          <td className="border border-gray-200 px-2 text-right font-medium">{fmt(r.capFin)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {subTab === "ratios" && (
        <div className="grid grid-cols-2 gap-4">
          {[ratios.slice(0, 4), ratios.slice(4)].map((group, gi) => (
            <Card key={gi}>
              <h4 className="text-xs font-medium text-gray-500 mb-3">
                {gi === 0 ? "Ratios de rentabilité & remboursement" : "Ratios de structure financière"}
              </h4>
              {group.map((r) => (
                <div
                  key={r.label}
                  className={`flex justify-between items-start p-3 rounded-lg mb-2 ${r.ok ? "bg-emerald-50" : "bg-red-50"}`}
                >
                  <div>
                    <div className="text-xs font-medium">{r.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">Cible : {r.target}</div>
                  </div>
                  <Badge color={r.ok ? "green" : "red"}>{r.val}</Badge>
                </div>
              ))}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// COMPOSANT PRINCIPAL
// ─────────────────────────────────────────────

type TabKey = "A" | "B" | "C" | "CR" | "D" | "E";

const TABS: { key: TabKey; label: string }[] = [
  { key: "A", label: "A — Investissement" },
  { key: "B", label: "B — Chiffre d'affaires" },
  { key: "C", label: "C — Charges" },
  { key: "CR", label: "Coût de revient" },
  { key: "D", label: "D — Financement" },
  { key: "E", label: "E — Plan financier" },
];

export default function MoteurFinancierPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("A");
  const [state, setState] = useState<MoteurState>(initialState);
  const [ctx, setCtx] = useState<{ nomProjet?: string; modele?: string; secteur?: string; zone?: string } | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('architect_context');
      if (raw) {
        const parsed = JSON.parse(raw);
        setCtx(parsed);
        if (parsed.tauxCroissance) setState((s) => ({ ...s, tauxCroissance: parsed.tauxCroissance }));
      }
    } catch { /* sessionStorage indisponible */ }
  }, []);

  // Sync automatique des données financières vers sessionStorage à chaque modification
  useEffect(() => {
    try {
      const ca1 = state.produits.reduce((s, p) => s + getCAP(p), 0);
      const tc = state.tauxCroissance / 100;
      const totTerrain = state.terrains.reduce((s, t) => s + t.prix, 0);
      const totEquip = state.equips.reduce((s, e) => s + e.qte * e.pu, 0);
      const salAnn = state.salaires.reduce((s, r) => s + r.nbre * r.salaire * 1.2, 0) * 12;
      const chFix = state.chargesFix.reduce((s, c) => s + c.pu * c.mois, 0);
      const totFixAnn = salAnn + chFix;
      const totMBval = state.produits.reduce((s, p) => {
        const cr = getCRUnitaire(p);
        const mb = p.pu > 0 ? (p.pu - cr) / p.pu : 0;
        return s + getCAP(p) * mb;
      }, 0);
      const txMB = ca1 > 0 ? totMBval / ca1 : 0;
      const totAmortAnn = [
        ...state.equips.map((e) => (e.duree > 0 ? (e.qte * e.pu) / e.duree : 0)),
        ...state.terrains.filter((t) => t.duree > 0).map((t) => t.prix / t.duree),
      ].reduce((s, v) => s + v, 0);
      const totSalMensuel = state.salaires.reduce((s, r) => s + r.nbre * r.salaire * 1.2, 0);
      const bfr = (totSalMensuel + totFixAnn / 12) * state.bfrMoisFix + ((ca1 / 12) * 0.4) * state.bfrMoisVar;
      const totalProjet = totTerrain + totEquip + bfr;
      const empruntTotal = state.emprunts.reduce((s, e) => s + e.montant, 0);
      const apport = state.apportPerso;
      const financial = {
        ca_an1: Math.round(ca1),
        ca_an2: Math.round(ca1 * (1 + tc)),
        ca_an3: Math.round(ca1 * Math.pow(1 + tc, 2)),
        taux_marge_brute: Math.round(txMB * 100),
        charges_fixes_annuelles: Math.round(totFixAnn),
        amortissements_annuels: Math.round(totAmortAnn),
        total_immobilisations: Math.round(totTerrain + totEquip),
        bfr: Math.round(bfr),
        total_projet: Math.round(totalProjet),
        apport_personnel: Math.round(apport),
        emprunt_total: Math.round(empruntTotal),
        pct_apport: totalProjet > 0 ? Math.round(apport / totalProjet * 100) : 0,
        nb_produits: state.produits.filter(p => p.nom).length,
        nb_emplois: state.salaires.reduce((s, r) => s + r.nbre, 0),
      };
      sessionStorage.setItem('architect_financial_data', JSON.stringify(financial));
      // Persistance Supabase non bloquante
      const sbPersist = createBrowserSupabaseClient()
      const ctxRaw = sessionStorage.getItem('architect_context')
      if (ctxRaw) {
        try {
          const ctxParsed = JSON.parse(ctxRaw)
          if (ctxParsed && ctxParsed.dossierId) {
            sbPersist.from('dossiers_eden').update({ plan_financier: financial, updated_at: new Date().toISOString() }).eq('id', ctxParsed.dossierId).then(() => {})
          }
        } catch {}
      }
    } catch { /* sessionStorage indisponible */ }
  }, [state]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-medium text-gray-900">ARCHITECT — Moteur financier</h1>
          <p className="text-sm text-gray-500 mt-1">Business plan bancable · Normes OHADA / UEMOA</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto pb-px">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2 text-sm whitespace-nowrap border-b-2 transition-colors ${
                activeTab === t.key
                  ? "border-emerald-600 text-emerald-700 font-medium"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Contenu */}
        <div>
          {activeTab === "A" && <TabA state={state} setState={setState} />}
          {activeTab === "B" && <TabB state={state} setState={setState} />}
          {activeTab === "C" && <TabC state={state} setState={setState} />}
          {activeTab === "CR" && <TabCR state={state} setState={setState} />}
          {activeTab === "D" && <TabD state={state} setState={setState} />}
          {activeTab === "E" && <TabE state={state} />}
        </div>
      </div>
    </div>
  );
}
