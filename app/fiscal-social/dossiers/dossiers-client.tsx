'use client'

import { useCallback, useEffect, useState } from 'react'

type Client = {
  id: string
  legal_name: string
  status: 'active' | 'archived'
}

type Dossier = {
  id: string
  client_id: string
  client_name: string
  dossier_type: string
  period_start: string
  period_end: string
  status: string
  currency: string
  notes: string | null
  created_at: string
}

type PageResult = {
  data: Dossier[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

type FormState = {
  client_id: string
  dossier_type: string
  period_start: string
  period_end: string
  notes: string
  status: string
}

const EMPTY: FormState = {
  client_id: '',
  dossier_type: 'regularisation_fiscale',
  period_start: '',
  period_end: '',
  notes: '',
  status: 'draft',
}

const TYPES: Record<string, string> = {
  regularisation_fiscale: 'Régularisation fiscale',
  regularisation_sociale: 'Régularisation sociale',
  suivi_fiscal: 'Suivi fiscal',
  suivi_social: 'Suivi social',
}

const STATUSES: Record<string, string> = {
  draft: 'Brouillon',
  pending_review: 'En attente de revue',
  blocked_unvalidated_rule: 'Bloqué · règle à valider',
  validated: 'Validé',
  closed: 'Clôturé',
}

const inputClass =
  'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'

export default function DossiersClient() {
  const [result, setResult] = useState<PageResult>({
    data: [], total: 0, page: 1, pageSize: 20, totalPages: 0,
  })
  const [clients, setClients] = useState<Client[]>([])
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)
  const [selected, setSelected] = useState<Dossier | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)

  const loadDossiers = useCallback(async (page = 1, query = search, status = statusFilter) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '20',
        search: query,
      })
      if (status !== 'all') params.set('status', status)

      const response = await fetch(`/api/fiscal/dossiers?${params}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Chargement des dossiers impossible.')
      setResult(payload)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.')
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter])

  const loadClients = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: '1', pageSize: '100', search: '' })
      const response = await fetch(`/api/fiscal/clients?${params}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Chargement des clients impossible.')
      setClients((payload.data as Client[]).filter((client) => client.status === 'active'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de charger les clients.')
    }
  }, [])

  useEffect(() => {
    void loadDossiers(1, '', 'all')
    void loadClients()
  }, [loadDossiers, loadClients])

  function openCreate() {
    setSelected(null)
    setForm(EMPTY)
    setError('')
    setPanelOpen(true)
  }

  function openEdit(dossier: Dossier) {
    setSelected(dossier)
    setForm({
      client_id: dossier.client_id,
      dossier_type: dossier.dossier_type,
      period_start: dossier.period_start,
      period_end: dossier.period_end,
      notes: dossier.notes || '',
      status: dossier.status,
    })
    setError('')
    setPanelOpen(true)
  }

  function updateField(key: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function saveDossier(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')

    try {
      const payload = {
        client_id: form.client_id,
        dossier_type: form.dossier_type,
        period_start: form.period_start,
        period_end: form.period_end,
        notes: form.notes.trim() || null,
        ...(selected ? { status: form.status } : {}),
      }

      const response = await fetch(
        selected ? `/api/fiscal/dossiers/${selected.id}` : '/api/fiscal/dossiers',
        {
          method: selected ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Enregistrement impossible.')

      setPanelOpen(false)
      setNotice(selected ? 'Dossier mis à jour.' : 'Dossier créé avec succès.')
      await loadDossiers(1, search, statusFilter)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Une erreur est survenue.')
    } finally {
      setSaving(false)
    }
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = searchInput.trim()
    setSearch(query)
    void loadDossiers(1, query, statusFilter)
  }

  function changeFilter(value: string) {
    setStatusFilter(value)
    void loadDossiers(1, search, value)
  }

  const canEdit = (status: string) =>
    ['draft', 'pending_review', 'blocked_unvalidated_rule'].includes(status)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-medium text-blue-700">SUIVI DES MISSIONS</div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
            Gestion des dossiers
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Ouvrez et suivez les missions fiscales et sociales du cabinet.
          </p>
        </div>
        <button
          onClick={openCreate}
          disabled={clients.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="text-lg leading-none">+</span>
          Nouveau dossier
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-500">Dossiers trouvés</div>
          <div className="mt-2 text-3xl font-bold text-slate-950">{result.total}</div>
          <div className="mt-1 text-xs text-slate-400">Selon les filtres appliqués</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-500">En attente de revue</div>
          <div className="mt-2 text-3xl font-bold text-amber-700">
            {result.data.filter((d) => d.status === 'pending_review').length}
          </div>
          <div className="mt-1 text-xs text-slate-400">Sur la page courante</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-500">Bloqués par une règle</div>
          <div className="mt-2 text-3xl font-bold text-red-700">
            {result.data.filter((d) => d.status === 'blocked_unvalidated_rule').length}
          </div>
          <div className="mt-1 text-xs text-slate-400">Sur la page courante</div>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4 sm:p-5">
          <form onSubmit={submitSearch} className="flex flex-col gap-3 sm:flex-row">
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Rechercher un client, un type ou une note..."
              maxLength={100}
              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white"
            />
            <button type="submit" className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700">
              Rechercher
            </button>
            <button
              type="button"
              onClick={() => {
                setSearchInput('')
                setSearch('')
                setStatusFilter('all')
                void loadDossiers(1, '', 'all')
              }}
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Réinitialiser
            </button>
          </form>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-700">
              Répertoire <span className="font-normal text-slate-400">· {result.total} résultat(s)</span>
            </div>
            <select
              value={statusFilter}
              onChange={(e) => changeFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            >
              <option value="all">Tous les statuts</option>
              <option value="draft">Brouillons</option>
              <option value="pending_review">En attente de revue</option>
              <option value="blocked_unvalidated_rule">Bloqués</option>
              <option value="validated">Validés</option>
              <option value="closed">Clôturés</option>
            </select>
          </div>
        </div>

        {notice && <div role="status" className="mx-4 mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}
        {error && !panelOpen && <div role="alert" className="mx-4 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-4 font-semibold">Client / mission</th>
                <th className="px-5 py-4 font-semibold">Période</th>
                <th className="px-5 py-4 font-semibold">Statut</th>
                <th className="px-5 py-4 font-semibold">Devise</th>
                <th className="px-5 py-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={5} className="px-5 py-14 text-center text-sm text-slate-500">Chargement des dossiers...</td></tr>
              ) : result.data.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-14 text-center">
                    <div className="font-semibold text-slate-700">Aucun dossier à afficher</div>
                    <p className="mt-1 text-sm text-slate-500">Modifiez les filtres ou créez un nouveau dossier.</p>
                  </td>
                </tr>
              ) : result.data.map((dossier) => (
                <tr key={dossier.id} className="transition hover:bg-slate-50/80">
                  <td className="px-5 py-4">
                    <div className="font-semibold text-slate-900">{dossier.client_name}</div>
                    <div className="mt-1 text-xs text-slate-500">{TYPES[dossier.dossier_type] || dossier.dossier_type}</div>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-600">
                    {dossier.period_start} → {dossier.period_end}
                  </td>
                  <td className="px-5 py-4">
                    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {STATUSES[dossier.status] || dossier.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-600">{dossier.currency}</td>
                  <td className="px-5 py-4 text-right">
                    {canEdit(dossier.status) ? (
                      <button
                        onClick={() => openEdit(dossier)}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                      >
                        Modifier
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">Verrouillé</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            Page {result.page} sur {Math.max(result.totalPages, 1)} · {result.pageSize} lignes par page
          </p>
          <div className="flex gap-2">
            <button
              disabled={loading || result.page <= 1}
              onClick={() => void loadDossiers(result.page - 1)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 disabled:opacity-40"
            >
              ← Précédent
            </button>
            <button
              disabled={loading || result.page >= result.totalPages}
              onClick={() => void loadDossiers(result.page + 1)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 disabled:opacity-40"
            >
              Suivant →
            </button>
          </div>
        </div>
      </section>

      {panelOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-[2px]">
          <button aria-label="Fermer le panneau" onClick={() => setPanelOpen(false)} className="absolute inset-0 cursor-default" />
          <aside className="relative z-10 flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-blue-700">Suivi des missions</div>
                <h3 className="mt-1 text-xl font-bold text-slate-950">{selected ? 'Modifier le dossier' : 'Créer un dossier'}</h3>
                <p className="mt-1 text-sm text-slate-500">Les champs marqués d'un * sont obligatoires.</p>
              </div>
              <button onClick={() => setPanelOpen(false)} aria-label="Fermer" className="rounded-lg px-3 py-2 text-xl text-slate-400 hover:bg-slate-100">×</button>
            </div>

            <form onSubmit={saveDossier} className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
                {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

                <label className="block text-sm font-medium text-slate-700">
                  Client *
                  <select required value={form.client_id} onChange={(e) => updateField('client_id', e.target.value)} className={inputClass}>
                    <option value="">Sélectionner un client actif</option>
                    {clients.map((client) => <option key={client.id} value={client.id}>{client.legal_name}</option>)}
                  </select>
                  {clients.length === 0 && <span className="mt-1 block text-xs text-amber-700">Aucun client actif trouvé. Créez ou réactivez un client avant d'ouvrir un dossier.</span>}
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Nature de la mission *
                  <select required value={form.dossier_type} onChange={(e) => updateField('dossier_type', e.target.value)} className={inputClass}>
                    {Object.entries(TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-slate-700">
                    Début de période *
                    <input required type="date" value={form.period_start} onChange={(e) => updateField('period_start', e.target.value)} className={inputClass} />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Fin de période *
                    <input required type="date" min={form.period_start || undefined} value={form.period_end} onChange={(e) => updateField('period_end', e.target.value)} className={inputClass} />
                  </label>
                </div>

                {selected && (
                  <label className="block text-sm font-medium text-slate-700">
                    Statut de suivi
                    <select value={form.status} onChange={(e) => updateField('status', e.target.value)} className={inputClass}>
                      <option value="draft">Brouillon</option>
                      <option value="pending_review">En attente de revue</option>
                      <option value="blocked_unvalidated_rule">Bloqué · règle à valider</option>
                    </select>
                    <span className="mt-1 block text-xs text-slate-500">La validation définitive et la clôture sont réservées à des procédures dédiées.</span>
                  </label>
                )}

                <label className="block text-sm font-medium text-slate-700">
                  Notes de suivi
                  <textarea rows={5} maxLength={5000} value={form.notes} onChange={(e) => updateField('notes', e.target.value)} placeholder="Contexte, pièces attendues, observations..." className={inputClass} />
                  <span className="mt-1 block text-xs text-slate-400">{form.notes.length}/5000 caractères</span>
                </label>

                <div className="rounded-xl bg-blue-50 p-4 text-xs leading-5 text-blue-800">
                  Devise de référence : XOF. La création et les modifications sont journalisées. Aucun calcul fiscal ou social définitif n'est déclenché par cette opération.
                </div>
              </div>

              <div className="flex gap-3 border-t border-slate-100 bg-white px-6 py-4">
                <button type="button" onClick={() => setPanelOpen(false)} className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  Annuler
                </button>
                <button type="submit" disabled={saving || clients.length === 0} className="flex-1 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60">
                  {saving ? 'Enregistrement...' : selected ? 'Enregistrer' : 'Créer le dossier'}
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}
    </div>
  )
}
