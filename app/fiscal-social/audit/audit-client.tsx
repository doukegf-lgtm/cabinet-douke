'use client'

import { useCallback, useEffect, useState } from 'react'

type AuditEvent = {
  id: number
  actor_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

type Pagination = {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

const actions = [
  ['client.created', 'Création client'],
  ['client.updated', 'Modification client'],
  ['dossier.created', 'Création dossier'],
  ['dossier.updated', 'Modification dossier'],
  ['document.uploaded', 'Dépôt document'],
  ['document.archived', 'Archivage document'],
]

const entities = [
  ['fiscal_client', 'Client'],
  ['fiscal_dossier', 'Dossier'],
  ['fiscal_document', 'Document'],
]

function dateLabel(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('fr-FR', {
        dateStyle: 'short',
        timeStyle: 'medium',
      }).format(date)
}

function metadataLabel(metadata: Record<string, unknown>) {
  const entries = Object.entries(metadata)
  if (!entries.length) return 'Aucune métadonnée affichable'

  return entries.map(([key, value]) => {
    const label = key.replaceAll('_', ' ')
    const display = Array.isArray(value)
      ? value.join(', ')
      : typeof value === 'boolean'
        ? value ? 'Oui' : 'Non'
        : String(value)
    return `${label} : ${display}`
  }).join(' · ')
}

export default function AuditClient() {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [pagination, setPagination] = useState<Pagination>({
    page: 1, pageSize: 25, total: 0, totalPages: 0,
  })
  const [action, setAction] = useState('')
  const [entityType, setEntityType] = useState('')
  const [actorId, setActorId] = useState('')
  const [entityId, setEntityId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<number | null>(null)

  const load = useCallback(async (page = 1) => {
    setLoading(true)
    setError('')

    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '25',
      })
      if (action) params.set('action', action)
      if (entityType) params.set('entity_type', entityType)
      if (actorId.trim()) params.set('actor_id', actorId.trim())
      if (entityId.trim()) params.set('entity_id', entityId.trim())
      if (from) params.set('from', from)
      if (to) params.set('to', to)

      const response = await fetch(`/api/fiscal/audit?${params}`, {
        cache: 'no-store',
      })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Chargement impossible.')
      }

      setEvents(result.data ?? [])
      setPagination(result.pagination)
      setSelected(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement.')
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [action, entityType, actorId, entityId, from, to])

  useEffect(() => {
    void load(1)
  }, [load])

  function resetFilters() {
    setAction('')
    setEntityType('')
    setActorId('')
    setEntityId('')
    setFrom('')
    setTo('')
  }

  return (
    <section className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Événements trouvés</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{pagination.total}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Page actuelle</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{pagination.totalPages ? pagination.page : 0} / {pagination.totalPages}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Taille de page</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">25</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Mode</p>
          <p className="mt-2 text-sm font-bold text-emerald-700">Lecture seule · Append-only</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-bold text-slate-900">Filtres de recherche</h2>
            <p className="mt-1 text-xs text-slate-500">Les identifiants doivent être des UUID complets.</p>
          </div>
          <button type="button" onClick={resetFilters} className="text-sm font-semibold text-slate-600 underline">
            Réinitialiser
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-medium text-slate-700">
            Action
            <select value={action} onChange={e => setAction(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5">
              <option value="">Toutes les actions</option>
              {actions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Type d’entité
            <select value={entityType} onChange={e => setEntityType(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5">
              <option value="">Tous les types</option>
              {entities.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Acteur (UUID)
            <input value={actorId} onChange={e => setActorId(e.target.value)} placeholder="UUID de l’administrateur" className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 font-mono text-xs" />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Entité (UUID)
            <input value={entityId} onChange={e => setEntityId(e.target.value)} placeholder="UUID du client, dossier ou document" className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 font-mono text-xs" />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Du
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5" />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Au
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5" />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => void load(1)} disabled={loading} className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {loading ? 'Chargement…' : 'Appliquer les filtres'}
          </button>
          <button type="button" onClick={() => void load(pagination.page)} disabled={loading} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">
            Actualiser
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
          <h2 className="font-bold text-slate-900">Historique des opérations</h2>
          <span className="text-xs text-slate-500">{events.length} événement(s) affiché(s)</span>
        </div>

        {loading ? (
          <p className="p-8 text-center text-sm text-slate-500">Chargement du journal…</p>
        ) : events.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">Aucun événement correspondant aux filtres.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Entité</th>
                  <th className="px-4 py-3">Acteur</th>
                  <th className="px-4 py-3">Identifiant événement</th>
                  <th className="px-4 py-3">Détail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {events.map(event => (
                  <tr key={event.id} className="align-top hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{dateLabel(event.created_at)}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{event.action}</td>
                    <td className="px-4 py-3 text-slate-600">{event.entity_type}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{event.actor_id ?? 'Système'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{event.id}</td>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => setSelected(selected === event.id ? null : event.id)} className="font-semibold text-blue-700 underline">
                        {selected === event.id ? 'Fermer' : 'Consulter'}
                      </button>
                      {selected === event.id && (
                        <div className="mt-2 max-w-sm whitespace-normal break-words rounded-lg bg-slate-100 p-3 text-xs leading-5 text-slate-700">
                          <p><strong>UUID entité :</strong> {event.entity_id ?? 'Non renseigné'}</p>
                          <p className="mt-2"><strong>Métadonnées autorisées :</strong></p>
                          <p>{metadataLabel(event.metadata)}</p>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
          <p className="text-xs text-slate-500">
            {pagination.total} résultat(s) · Page {pagination.totalPages ? pagination.page : 0} sur {pagination.totalPages}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => void load(pagination.page - 1)} disabled={loading || pagination.page <= 1} className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-40">
              Précédent
            </button>
            <button type="button" onClick={() => void load(pagination.page + 1)} disabled={loading || pagination.page >= pagination.totalPages} className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-40">
              Suivant
            </button>
          </div>
        </div>
      </div>

      <p className="text-xs leading-5 text-slate-500">
        Le journal est consultable uniquement par les administrateurs. Cette interface ne permet aucune modification ni suppression. Les métadonnées brutes, noms de fichiers et empreintes de documents ne sont pas affichés.
      </p>
    </section>
  )
}
