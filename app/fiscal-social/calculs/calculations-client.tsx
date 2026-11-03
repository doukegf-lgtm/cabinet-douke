'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

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

type CalculationEvent = {
  calculation_id: string
  event_type: string
  details: Record<string, unknown>
  created_at: string
}

type Calculation = {
  id: string
  dossier_id: string
  engine_version: string
  workbook_version: string
  blockers: Array<{ code: string; message: string }>
  validation_status: string
  created_at: string
  events: CalculationEvent[]
}

const TYPES: Record<string, string> = {
  regularisation_fiscale: 'Régularisation fiscale',
  regularisation_sociale: 'Régularisation sociale',
  suivi_fiscal: 'Suivi fiscal',
  suivi_social: 'Suivi social',
}

const STATUSES: Record<string, string> = {
  blocked_unvalidated_rule: 'Bloqué · moteur non certifié',
  pending_review: 'En attente de revue',
  validated: 'Validé',
  rejected: 'Rejeté',
}

const EVENT_LABELS: Record<string, string> = {
  created_blocked: 'Demande créée et bloquée',
  review_requested: 'Revue demandée',
  validated: 'Calcul validé',
  rejected: 'Demande rejetée',
}

const inputClass =
  'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'

function dateLabel(value: string) {
  return new Date(value).toLocaleString('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export default function CalculationsClient() {
  const [dossiers, setDossiers] = useState<Dossier[]>([])
  const [calculations, setCalculations] = useState<Calculation[]>([])
  const [selectedDossier, setSelectedDossier] = useState('')
  const [description, setDescription] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [dossierResponse, calculationResponse] = await Promise.all([
        fetch('/api/fiscal/dossiers?page=1&pageSize=100&search=', { cache: 'no-store' }),
        fetch('/api/fiscal/calculations', { cache: 'no-store' }),
      ])

      const [dossierPayload, calculationPayload] = await Promise.all([
        dossierResponse.json(),
        calculationResponse.json(),
      ])

      if (!dossierResponse.ok) {
        throw new Error(dossierPayload.error || 'Chargement des dossiers impossible.')
      }
      if (!calculationResponse.ok) {
        throw new Error(calculationPayload.error || 'Chargement des demandes impossible.')
      }

      setDossiers(dossierPayload.data ?? [])
      setCalculations(calculationPayload.data ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const dossierById = useMemo(
    () => new Map(dossiers.map((dossier) => [dossier.id, dossier])),
    [dossiers],
  )

  const filtered = useMemo(() => calculations.filter((item) => {
    const dossier = dossierById.get(item.dossier_id)
    const searchText = [
      dossier?.client_name,
      dossier?.dossier_type,
      item.id,
      item.dossier_id,
    ].join(' ').toLowerCase()

    return (statusFilter === 'all' || item.validation_status === statusFilter)
      && (!search || searchText.includes(search.toLowerCase()))
  }), [calculations, dossierById, search, statusFilter])

  const blockedCount = calculations.filter(
    (item) => item.validation_status === 'blocked_unvalidated_rule',
  ).length
  const validatedCount = calculations.filter(
    (item) => item.validation_status === 'validated',
  ).length
  const rejectedCount = calculations.filter(
    (item) => item.validation_status === 'rejected',
  ).length

  function openCreate() {
    setSelectedDossier('')
    setDescription('')
    setError('')
    setNotice('')
    setPanelOpen(true)
  }

  async function createDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedDossier) {
      setError('Sélectionnez un dossier.')
      return
    }

    setSaving(true)
    setError('')
    setNotice('')

    try {
      const response = await fetch('/api/fiscal/calculations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dossier_id: selectedDossier,
          input_snapshot: {
            description: description.trim(),
            preparation_only: true,
          },
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Création impossible.')

      setPanelOpen(false)
      setNotice('Demande enregistrée. Elle est bloquée : aucun montant n’a été calculé.')
      await loadData()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Une erreur est survenue.')
    } finally {
      setSaving(false)
    }
  }

  async function rejectCalculation(calculation: Calculation) {
    const confirmed = window.confirm(
      'Confirmer le rejet de cette demande ? Cette action sera inscrite dans l’historique et ne pourra pas être annulée.',
    )
    if (!confirmed) return

    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/fiscal/calculations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calculation_id: calculation.id,
          status: 'rejected',
          note: 'Rejet demandé depuis l’interface de suivi.',
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Rejet impossible.')

      setNotice('Rejet enregistré dans l’historique.')
      await loadData()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Une erreur est survenue.')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-medium text-blue-700">SUIVI ET PRÉPARATION</div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
            Demandes de calcul
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Enregistrez les éléments d’un dossier, suivez les blocages et consultez l’historique.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800"
        >
          <span className="text-lg leading-none">+</span>
          Nouvelle demande
        </button>
      </div>

      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
        <div className="flex items-start gap-3">
          <span className="text-xl" aria-hidden="true">⚠</span>
          <div>
            <h3 className="font-bold text-amber-950">Moteur de calcul non certifié</h3>
            <p className="mt-1 text-sm leading-6 text-amber-900">
              Cette interface enregistre des demandes de préparation. Elle ne calcule aucun impôt,
              cotisation, pénalité, intérêt ou total à payer. Les résultats restent désactivés
              jusqu’à la certification du moteur et la validation des règles applicables.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-500">Demandes enregistrées</div>
          <div className="mt-2 text-3xl font-bold text-slate-950">{calculations.length}</div>
          <div className="mt-1 text-xs text-slate-400">Maximum affiché : 100</div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-500">Bloquées</div>
          <div className="mt-2 text-3xl font-bold text-amber-700">{blockedCount}</div>
          <div className="mt-1 text-xs text-slate-400">Moteur ou règles non certifiés</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-500">Validées / rejetées</div>
          <div className="mt-2 text-3xl font-bold text-slate-950">
            {validatedCount} / {rejectedCount}
          </div>
          <div className="mt-1 text-xs text-slate-400">Selon les événements enregistrés</div>
        </div>
      </div>

      {notice && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </div>
      )}
      {error && !panelOpen && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un client ou un identifiant..."
              maxLength={100}
              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700"
            >
              <option value="all">Tous les statuts</option>
              <option value="blocked_unvalidated_rule">Bloquées</option>
              <option value="pending_review">En revue</option>
              <option value="validated">Validées</option>
              <option value="rejected">Rejetées</option>
            </select>
            <button
              onClick={() => void loadData()}
              disabled={loading}
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Actualiser
            </button>
          </div>
          <div className="mt-4 text-sm font-semibold text-slate-700">
            Répertoire <span className="font-normal text-slate-400">· {filtered.length} demande(s)</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-4 font-semibold">Client / dossier</th>
                <th className="px-5 py-4 font-semibold">Date</th>
                <th className="px-5 py-4 font-semibold">Statut</th>
                <th className="px-5 py-4 font-semibold">Blocages</th>
                <th className="px-5 py-4 text-right font-semibold">Détails</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={5} className="px-5 py-14 text-center text-sm text-slate-500">Chargement des demandes...</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-14 text-center">
                    <div className="font-semibold text-slate-700">Aucune demande à afficher</div>
                    <p className="mt-1 text-sm text-slate-500">Créez une demande depuis un dossier existant.</p>
                  </td>
                </tr>
              ) : filtered.map((item) => {
                const dossier = dossierById.get(item.dossier_id)
                const isExpanded = expanded === item.id
                return (
                  <tr key={item.id} className="align-top transition hover:bg-slate-50/80">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-900">
                        {dossier?.client_name || 'Client non disponible'}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {dossier ? TYPES[dossier.dossier_type] || dossier.dossier_type : 'Dossier'}
                        {dossier && ` · ${dossier.period_start} → ${dossier.period_end}`}
                      </div>
                      <div className="mt-1 max-w-[260px] truncate font-mono text-[10px] text-slate-400">
                        {item.id}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">{dateLabel(item.created_at)}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        item.validation_status === 'rejected'
                          ? 'bg-red-100 text-red-800'
                          : item.validation_status === 'validated'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                      }`}>
                        {STATUSES[item.validation_status] || item.validation_status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">
                      {item.blockers?.length ?? 0}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => setExpanded(isExpanded ? null : item.id)}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                      >
                        {isExpanded ? 'Masquer' : 'Consulter'}
                      </button>
                    </td>
                    {false && <td />}
                    {isExpanded && (
                      <td colSpan={5} className="hidden" />
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {expanded && (() => {
          const item = filtered.find((entry) => entry.id === expanded)
          if (!item) return null
          return (
            <div className="border-t border-slate-200 bg-slate-50 p-5 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-bold text-slate-900">Détail de la demande</h3>
                  <p className="mt-1 break-all font-mono text-xs text-slate-500">{item.id}</p>
                </div>
                {['blocked_unvalidated_rule', 'pending_review'].includes(item.validation_status) && (
                  <button
                    onClick={() => void rejectCalculation(item)}
                    className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                  >
                    Rejeter la demande
                  </button>
                )}
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h4 className="text-sm font-bold text-slate-800">Blocages identifiés</h4>
                  <ul className="mt-3 space-y-3">
                    {(item.blockers ?? []).map((blocker) => (
                      <li key={blocker.code} className="border-l-2 border-amber-400 pl-3">
                        <div className="text-xs font-bold text-amber-800">{blocker.code}</div>
                        <p className="mt-1 text-sm text-slate-600">{blocker.message}</p>
                      </li>
                    ))}
                    {(item.blockers ?? []).length === 0 && (
                      <li className="text-sm text-slate-500">Aucun blocage déclaré.</li>
                    )}
                  </ul>
                  <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
                    Moteur : {item.engine_version} · Référentiel : {item.workbook_version}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h4 className="text-sm font-bold text-slate-800">Historique immuable</h4>
                  <ol className="mt-3 space-y-3">
                    {(item.events ?? []).map((event, index) => (
                      <li key={`${event.calculation_id}-${event.created_at}-${index}`} className="flex gap-3">
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-600" />
                        <div>
                          <div className="text-sm font-semibold text-slate-800">
                            {EVENT_LABELS[event.event_type] || event.event_type}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">{dateLabel(event.created_at)}</div>
                          {typeof event.details?.note === 'string' && event.details.note && (
                            <p className="mt-1 text-xs text-slate-600">{event.details.note}</p>
                          )}
                        </div>
                      </li>
                    ))}
                    {(item.events ?? []).length === 0 && (
                      <li className="text-sm text-slate-500">Aucun événement disponible.</li>
                    )}
                  </ol>
                </div>
              </div>

              <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                Aucun résultat financier n’est disponible. L’envoi en revue et la validation restent
                désactivés jusqu’à la certification du moteur et à la levée des blocages.
              </p>
            </div>
          )
        })()}
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
                <div className="text-xs font-semibold uppercase tracking-wider text-blue-700">Préparation</div>
                <h3 className="mt-1 text-xl font-bold text-slate-950">Nouvelle demande de calcul</h3>
                <p className="mt-1 text-sm text-slate-500">Aucun montant ne sera calculé.</p>
              </div>
              <button
                onClick={() => setPanelOpen(false)}
                aria-label="Fermer"
                className="rounded-lg px-3 py-2 text-xl text-slate-400 hover:bg-slate-100"
              >
                ×
              </button>
            </div>

            <form onSubmit={createDraft} className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
                {error && (
                  <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <label className="block text-sm font-medium text-slate-700">
                  Dossier concerné *
                  <select
                    required
                    value={selectedDossier}
                    onChange={(e) => setSelectedDossier(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Sélectionner un dossier</option>
                    {dossiers.filter((dossier) => !['validated', 'closed'].includes(dossier.status)).map((dossier) => (
                      <option key={dossier.id} value={dossier.id}>
                        {dossier.client_name} · {TYPES[dossier.dossier_type] || dossier.dossier_type} · {dossier.period_start} → {dossier.period_end}
                      </option>
                    ))}
                  </select>
                  {dossiers.length === 0 && (
                    <span className="mt-1 block text-xs text-amber-700">
                      Aucun dossier disponible. Créez d’abord un dossier dans l’espace Dossiers.
                    </span>
                  )}
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Éléments communiqués / contexte à examiner
                  <textarea
                    rows={7}
                    maxLength={10000}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Décrivez les éléments transmis, les périodes concernées, les pièces reçues ou les points à examiner..."
                    className={inputClass}
                  />
                  <span className="mt-1 block text-xs text-slate-400">{description.length}/10000 caractères</span>
                </label>

                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                  <strong>Information importante :</strong> cette opération crée uniquement une demande
                  de préparation. Elle ne calcule aucun montant, ne génère aucune déclaration et
                  ne constitue pas une validation fiscale ou sociale.
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
                  disabled={saving || !selectedDossier}
                  className="flex-1 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60"
                >
                  {saving ? 'Enregistrement...' : 'Enregistrer la demande'}
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}
    </div>
  )
}
