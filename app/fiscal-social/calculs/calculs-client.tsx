'use client'

import { useCallback, useEffect, useState } from 'react'

type Dossier = {
  id: string
  client_name: string
  dossier_type: string
  period_start: string
  period_end: string
  status: string
}

type Event = {
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
  events: Event[]
}

const TYPES: Record<string, string> = {
  regularisation_fiscale: 'Régularisation fiscale',
  regularisation_sociale: 'Régularisation sociale',
  suivi_fiscal: 'Suivi fiscal',
  suivi_social: 'Suivi social',
}

const STATUS: Record<string, string> = {
  blocked_unvalidated_rule: 'Bloqué · règles à valider',
  pending_review: 'En attente de revue',
  validated: 'Validé',
  rejected: 'Rejeté',
}

const inputClass =
  'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'

function date(value: string) {
  return new Date(value).toLocaleString('fr-FR')
}

export default function CalculsClient() {
  const [dossiers, setDossiers] = useState<Dossier[]>([])
  const [calculations, setCalculations] = useState<Calculation[]>([])
  const [dossierId, setDossierId] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [filter, setFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [dossierResponse, calculationResponse] = await Promise.all([
        fetch('/api/fiscal/dossiers?page=1&pageSize=100&search=', { cache: 'no-store' }),
        fetch('/api/fiscal/calculations', { cache: 'no-store' }),
      ])

      const dossierPayload = await dossierResponse.json()
      const calculationPayload = await calculationResponse.json()

      if (!dossierResponse.ok) throw new Error(dossierPayload.error || 'Chargement des dossiers impossible.')
      if (!calculationResponse.ok) throw new Error(calculationPayload.error || 'Chargement des demandes impossible.')

      setDossiers(dossierPayload.data ?? [])
      setCalculations(calculationPayload.data ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function createCalculation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!dossierId) {
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
          dossier_id: dossierId,
          input_snapshot: {
            preparation_note: notes.trim(),
            preparation_only: true,
          },
        }),
      })

      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Création impossible.')

      setNotes('')
      setNotice(payload.message || 'Demande enregistrée.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Une erreur est survenue.')
    } finally {
      setSaving(false)
    }
  }

  const visible = calculations.filter((item) => !filter || item.dossier_id === filter)

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-blue-700">PRÉPARATION DES CALCULS</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Suivi des demandes</h2>
        <p className="mt-1 text-sm text-slate-500">
          Enregistrez une demande et consultez ses blocages et son historique.
        </p>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-bold text-amber-900">Attention : aucun montant n’est calculé.</p>
        <p className="mt-1 text-sm leading-6 text-amber-800">
          Le moteur n’est pas certifié. Chaque demande reste bloquée jusqu’à la vérification des règles et barèmes applicables.
        </p>
      </div>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}

      <form onSubmit={createCalculation} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900">Nouvelle demande</h3>
        <p className="mt-1 text-sm text-slate-500">Choisissez un dossier et ajoutez une note de préparation facultative.</p>

        <label className="mt-5 block text-sm font-semibold text-slate-700">
          Dossier concerné
          <select className={inputClass} value={dossierId} onChange={(e) => setDossierId(e.target.value)} required>
            <option value="">Sélectionner un dossier</option>
            {dossiers.filter((d) => !['validated', 'closed'].includes(d.status)).map((d) => (
              <option key={d.id} value={d.id}>
                {d.client_name} · {TYPES[d.dossier_type] || d.dossier_type} · {d.period_start} – {d.period_end}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-4 block text-sm font-semibold text-slate-700">
          Note de préparation
          <textarea
            className={inputClass}
            rows={3}
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Informations utiles sur la demande (facultatif)"
          />
        </label>

        <button
          type="submit"
          disabled={saving || loading || dossiers.filter((d) => !['validated', 'closed'].includes(d.status)).length === 0}
          className="mt-4 rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Enregistrement…' : 'Enregistrer la demande'}
        </button>
      </form>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Historique des demandes</h3>
          <p className="text-sm text-slate-500">{calculations.length} demande(s) enregistrée(s), maximum 100 affichées.</p>
        </div>
        <select className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Tous les dossiers</option>
          {dossiers.map((d) => <option key={d.id} value={d.id}>{d.client_name}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Chargement…</p>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="font-semibold text-slate-800">Aucune demande enregistrée</p>
          <p className="mt-1 text-sm text-slate-500">Les nouvelles demandes apparaîtront ici.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((item) => {
            const dossier = dossiers.find((d) => d.id === item.dossier_id)
            return (
              <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h4 className="font-bold text-slate-900">{dossier?.client_name || 'Dossier'}</h4>
                    <p className="mt-1 text-sm text-slate-500">
                      {dossier ? TYPES[dossier.dossier_type] || dossier.dossier_type : item.dossier_id}
                      {dossier ? ` · ${dossier.period_start} – ${dossier.period_end}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">Créée le {date(item.created_at)}</p>
                  </div>
                  <span className="w-fit rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-800">
                    {STATUS[item.validation_status] || item.validation_status}
                  </span>
                </div>

                <div className="mt-4 rounded-xl bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Blocages</p>
                  <ul className="mt-2 space-y-2">
                    {(item.blockers || []).map((blocker, index) => (
                      <li key={`${blocker.code}-${index}`} className="flex gap-2 text-sm text-slate-700">
                        <span className="text-amber-600">●</span>
                        <span>{blocker.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
                  <span>Moteur : {item.engine_version}</span>
                  <span>Référentiel : {item.workbook_version}</span>
                  <span>{item.events?.length || 0} événement(s) d’historique</span>
                </div>

                {item.events?.length > 0 && (
                  <details className="mt-4 border-t border-slate-100 pt-3">
                    <summary className="cursor-pointer text-sm font-semibold text-blue-700">Consulter l’historique</summary>
                    <ol className="mt-3 space-y-3">
                      {item.events.map((event, index) => (
                        <li key={`${event.created_at}-${index}`} className="border-l-2 border-blue-200 pl-3">
                          <p className="text-sm font-semibold text-slate-800">{event.event_type}</p>
                          <p className="text-xs text-slate-500">{date(event.created_at)}</p>
                          {typeof event.details?.note === 'string' && (
                            <p className="mt-1 text-sm text-slate-600">{event.details.note}</p>
                          )}
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
