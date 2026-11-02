'use client'

import { useCallback, useEffect, useState } from 'react'

type Client = {
  id: string
  legal_name: string
  ifu: string | null
  rccm: string | null
  phone: string | null
  email: string | null
  address: string | null
  status: 'active' | 'archived'
  created_at?: string
  updated_at?: string
}

type ClientForm = {
  legal_name: string
  ifu: string
  rccm: string
  phone: string
  email: string
  address: string
}

type ListResult = {
  data: Client[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

const emptyForm: ClientForm = {
  legal_name: '',
  ifu: '',
  rccm: '',
  phone: '',
  email: '',
  address: '',
}

const inputClass =
  'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'

export default function ClientsClient() {
  const [result, setResult] = useState<ListResult>({
    data: [],
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 0,
  })
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)
  const [selected, setSelected] = useState<Client | null>(null)
  const [form, setForm] = useState<ClientForm>(emptyForm)

  const loadClients = useCallback(async (page = 1, query = search) => {
    setLoading(true)
    setError('')

    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '20',
        search: query,
      })

      const response = await fetch(`/api/fiscal/clients?${params}`, {
        method: 'GET',
        cache: 'no-store',
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Impossible de charger les clients.')
      }

      setResult(payload)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.')
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    void loadClients(1, '')
  }, [loadClients])

  function openCreate() {
    setSelected(null)
    setForm(emptyForm)
    setError('')
    setPanelOpen(true)
  }

  function openEdit(client: Client) {
    setSelected(client)
    setForm({
      legal_name: client.legal_name || '',
      ifu: client.ifu || '',
      rccm: client.rccm || '',
      phone: client.phone || '',
      email: client.email || '',
      address: client.address || '',
    })
    setError('')
    setPanelOpen(true)
  }

  function updateField(field: keyof ClientForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function saveClient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')

    try {
      const payload = {
        legal_name: form.legal_name.trim(),
        ifu: form.ifu.trim() || null,
        rccm: form.rccm.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
      }

      const response = await fetch(
        selected
          ? `/api/fiscal/clients/${selected.id}`
          : '/api/fiscal/clients',
        {
          method: selected ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Enregistrement impossible.')
      }

      setPanelOpen(false)
      setNotice(selected ? 'Fiche client mise à jour.' : 'Nouveau client créé.')
      await loadClients(1, search)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Une erreur est survenue.')
    } finally {
      setSaving(false)
    }
  }

  async function changeStatus(client: Client) {
    const archived = client.status === 'active'
    const action = archived ? 'archiver' : 'réactiver'

    if (!window.confirm(`Voulez-vous vraiment ${action} « ${client.legal_name} » ?`)) {
      return
    }

    setError('')
    setNotice('')

    try {
      const response = await fetch(`/api/fiscal/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: archived ? 'archived' : 'active' }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || `Impossible de ${action} ce client.`)
      }

      setNotice(archived ? 'Client archivé.' : 'Client réactivé.')
      await loadClients(result.page, search)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Une erreur est survenue.')
    }
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSearch(searchInput.trim())
    void loadClients(1, searchInput.trim())
  }

  const visibleClients = result.data.filter((client) => {
    if (statusFilter === 'active') return client.status === 'active'
    if (statusFilter === 'archived') return client.status === 'archived'
    return true
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-medium text-blue-700">RÉFÉRENTIEL CLIENTS</div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
            Gestion des clients
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Centralisez les informations administratives de vos clients.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-200"
        >
          <span className="text-lg leading-none">+</span>
          Nouveau client
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-500">Clients référencés</div>
          <div className="mt-2 text-3xl font-bold text-slate-950">{result.total}</div>
          <div className="mt-1 text-xs text-slate-400">Total retourné par la base</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-500">Clients actifs affichés</div>
          <div className="mt-2 text-3xl font-bold text-emerald-700">
            {result.data.filter((c) => c.status === 'active').length}
          </div>
          <div className="mt-1 text-xs text-slate-400">Sur la page courante</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-500">Clients archivés affichés</div>
          <div className="mt-2 text-3xl font-bold text-slate-600">
            {result.data.filter((c) => c.status === 'archived').length}
          </div>
          <div className="mt-1 text-xs text-slate-400">Sur la page courante</div>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4 sm:p-5">
          <form onSubmit={submitSearch} className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Rechercher par raison sociale, IFU ou RCCM..."
                maxLength={100}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
              />
            </div>
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Rechercher
            </button>
            <button
              type="button"
              onClick={() => {
                setSearchInput('')
                setSearch('')
                setStatusFilter('all')
                void loadClients(1, '')
              }}
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
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
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
            >
              <option value="all">Tous les statuts</option>
              <option value="active">Actifs affichés</option>
              <option value="archived">Archivés affichés</option>
            </select>
          </div>
        </div>

        {notice && (
          <div role="status" className="mx-4 mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {notice}
          </div>
        )}

        {error && !panelOpen && (
          <div role="alert" className="mx-4 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-4 font-semibold">Client</th>
                <th className="px-5 py-4 font-semibold">IFU</th>
                <th className="px-5 py-4 font-semibold">RCCM</th>
                <th className="px-5 py-4 font-semibold">Contact</th>
                <th className="px-5 py-4 font-semibold">Statut</th>
                <th className="px-5 py-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center text-sm text-slate-500">
                    Chargement du répertoire...
                  </td>
                </tr>
              ) : visibleClients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center">
                    <div className="text-3xl text-slate-300">⌕</div>
                    <div className="mt-2 font-semibold text-slate-700">Aucun client à afficher</div>
                    <p className="mt-1 text-sm text-slate-500">
                      Modifiez votre recherche ou créez une nouvelle fiche client.
                    </p>
                  </td>
                </tr>
              ) : visibleClients.map((client) => (
                <tr key={client.id} className="transition hover:bg-slate-50/80">
                  <td className="px-5 py-4">
                    <div className="font-semibold text-slate-900">{client.legal_name}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {client.email || client.phone || 'Coordonnées non renseignées'}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-600">{client.ifu || '—'}</td>
                  <td className="px-5 py-4 text-sm text-slate-600">{client.rccm || '—'}</td>
                  <td className="px-5 py-4 text-sm text-slate-600">{client.phone || '—'}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                      client.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {client.status === 'active' ? 'Actif' : 'Archivé'}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEdit(client)}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                      >
                        Modifier
                      </button>
                      <button
                        onClick={() => void changeStatus(client)}
                        className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                      >
                        {client.status === 'active' ? 'Archiver' : 'Réactiver'}
                      </button>
                    </div>
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
              onClick={() => void loadClients(result.page - 1)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← Précédent
            </button>
            <button
              disabled={loading || result.page >= result.totalPages}
              onClick={() => void loadClients(result.page + 1)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Suivant →
            </button>
          </div>
        </div>
      </section>

      {panelOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-[2px]">
          <button
            aria-label="Fermer le panneau"
            onClick={() => setPanelOpen(false)}
            className="absolute inset-0 cursor-default"
          />
          <aside className="relative z-10 flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-blue-700">
                  Référentiel clients
                </div>
                <h3 className="mt-1 text-xl font-bold text-slate-950">
                  {selected ? 'Modifier la fiche client' : 'Créer un client'}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Les champs marqués d'un * sont obligatoires.
                </p>
              </div>
              <button
                onClick={() => setPanelOpen(false)}
                aria-label="Fermer"
                className="rounded-lg px-3 py-2 text-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ×
              </button>
            </div>

            <form onSubmit={saveClient} className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
                {error && (
                  <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <div>
                  <h4 className="text-sm font-bold text-slate-900">Identification</h4>
                  <div className="mt-4">
                    <label className="text-sm font-medium text-slate-700">
                      Raison sociale *
                      <input
                        required
                        maxLength={200}
                        autoFocus
                        value={form.legal_name}
                        onChange={(e) => updateField('legal_name', e.target.value)}
                        placeholder="Nom officiel de l'entreprise"
                        className={inputClass}
                      />
                    </label>
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-medium text-slate-700">
                      IFU
                      <input maxLength={50} value={form.ifu} onChange={(e) => updateField('ifu', e.target.value)} placeholder="Identifiant fiscal" className={inputClass}/>
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      RCCM
                      <input maxLength={100} value={form.rccm} onChange={(e) => updateField('rccm', e.target.value)} placeholder="Référence RCCM" className={inputClass}/>
                    </label>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-5">
                  <h4 className="text-sm font-bold text-slate-900">Coordonnées</h4>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-medium text-slate-700">
                      Téléphone
                      <input maxLength={40} value={form.phone} onChange={(e) => updateField('phone', e.target.value)} placeholder="+229 ..." className={inputClass}/>
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Adresse e-mail
                      <input type="email" maxLength={254} value={form.email} onChange={(e) => updateField('email', e.target.value)} placeholder="contact@entreprise.bj" className={inputClass}/>
                    </label>
                  </div>
                  <div className="mt-4">
                    <label className="text-sm font-medium text-slate-700">
                      Adresse géographique
                      <textarea
                        rows={3}
                        maxLength={500}
                        value={form.address}
                        onChange={(e) => updateField('address', e.target.value)}
                        placeholder="Ville, quartier, rue, repère..."
                        className={inputClass}
                      />
                    </label>
                  </div>
                </div>

                <div className="rounded-xl bg-blue-50 p-4 text-xs leading-5 text-blue-800">
                  Les informations seront enregistrées dans le référentiel sécurisé du module Fiscal & Social. Toute création ou modification est tracée dans l'historique d'audit.
                </div>
              </div>

              <div className="flex gap-3 border-t border-slate-100 bg-white px-6 py-4">
                <button
                  type="button"
                  onClick={() => setPanelOpen(false)}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60"
                >
                  {saving ? 'Enregistrement...' : selected ? 'Enregistrer les modifications' : 'Créer le client'}
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}
    </div>
  )
}
