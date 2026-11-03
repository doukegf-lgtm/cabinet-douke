'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type Payload = {
  source_mode: 'actual' | 'estimated'
  source_note: string | null
  ca_fiscal_ht: number | null
  charges_comptables: number | null
  charges_deductibles_justifiees: number | null
  reintegrations_fiscales: number | null
  deductions_fiscales: number | null
  acomptes_is_justifies: number | null
  credits_is_valides: number | null
}

type Revision = {
  id: number
  version: number
  payload: Payload
  actor_id: string
  created_at: string
}

type Event = {
  id: number
  actor_id: string
  event_type: string
  details: Record<string, unknown>
  created_at: string
}

type AnnualInput = {
  id: string
  fiscal_year: number
  payload: Payload
  status: 'draft' | 'submitted' | 'needs_changes' | 'validated'
  version: number
  validation_note: string | null
  validated_at: string | null
  updated_at: string
  revisions: Revision[]
  events: Event[]
}

type Result = {
  dossier_id: string
  period_start: string
  period_end: string
  dossier_status: string
  data: AnnualInput[]
}

type Field = {
  key: keyof Pick<Payload,
    | 'ca_fiscal_ht'
    | 'charges_comptables'
    | 'charges_deductibles_justifiees'
    | 'reintegrations_fiscales'
    | 'deductions_fiscales'
    | 'acomptes_is_justifies'
    | 'credits_is_valides'
  >
  label: string
  help: string
}

const FIELDS: Field[] = [
  { key: 'ca_fiscal_ht', label: 'Chiffre d’affaires fiscal HT', help: 'Chiffre d’affaires retenu pour l’exercice, hors TVA.' },
  { key: 'charges_comptables', label: 'Charges comptables', help: 'Total des charges comptabilisées pour l’exercice.' },
  { key: 'charges_deductibles_justifiees', label: 'Charges déductibles justifiées', help: 'Charges dont la déductibilité et les justificatifs ont été vérifiés.' },
  { key: 'reintegrations_fiscales', label: 'Réintégrations fiscales', help: 'Montants à réintégrer selon l’analyse fiscale du cabinet.' },
  { key: 'deductions_fiscales', label: 'Déductions fiscales', help: 'Déductions identifiées et documentées.' },
  { key: 'acomptes_is_justifies', label: 'Acomptes IS justifiés', help: 'Acomptes d’impôt sur les sociétés appuyés par des preuves.' },
  { key: 'credits_is_valides', label: 'Crédits IS validés', help: 'Crédits dont l’existence et l’imputation ont été vérifiées.' },
]

const EMPTY: Payload = {
  source_mode: 'actual',
  source_note: null,
  ca_fiscal_ht: null,
  charges_comptables: null,
  charges_deductibles_justifiees: null,
  reintegrations_fiscales: null,
  deductions_fiscales: null,
  acomptes_is_justifies: null,
  credits_is_valides: null,
}

const STATUS: Record<string, string> = {
  draft: 'Brouillon',
  submitted: 'Soumise à revue',
  needs_changes: 'Corrections demandées',
  validated: 'Validée par le cabinet',
}

const inputClass =
  'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'

function dateLabel(value: string) {
  return new Date(value).toLocaleString('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function formatAmount(value: number | null | undefined) {
  if (value === null || value === undefined) return 'Non renseigné'
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value) + ' XOF'
}

export default function AnnualInputClient({ dossierId }: { dossierId: string }) {
  const [result, setResult] = useState<Result | null>(null)
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [form, setForm] = useState<Payload>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reviewNote, setReviewNote] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)

  const years = useMemo(() => {
    if (!result) return []
    const start = Number(result.period_start.slice(0, 4))
    const end = Number(result.period_end.slice(0, 4))
    if (!Number.isInteger(start) || !Number.isInteger(end) || end < start || end - start > 100) return []
    return Array.from({ length: end - start + 1 }, (_, index) => start + index)
  }, [result])

  const current = useMemo(
    () => result?.data.find((item) => item.fiscal_year === selectedYear) ?? null,
    [result, selectedYear],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/fiscal/dossiers/${dossierId}/inputs`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Chargement des saisies impossible.')
      const parsed = data as Result
      setResult(parsed)
      setSelectedYear((previous) =>
        previous !== null && parsed.data.some((item) => item.fiscal_year === previous)
          ? previous
          : Number(parsed.period_end.slice(0, 4)),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.')
    } finally {
      setLoading(false)
    }
  }, [dossierId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setForm(current ? { ...EMPTY, ...current.payload } : EMPTY)
    setReviewNote(current?.validation_note ?? '')
    setHistoryOpen(false)
  }, [current])

  const locked = !result || ['validated', 'closed'].includes(result.dossier_status)
  const editable = !locked && (!current || ['draft', 'needs_changes'].includes(current.status))
  const canReview = !locked && current?.status === 'submitted'

  function setAmount(key: Field['key'], raw: string) {
    setForm((previous) => ({
      ...previous,
      [key]: raw.trim() === '' ? null : Number(raw),
    }))
  }

  async function save(submit: boolean) {
    if (selectedYear === null) return
    setSaving(true)
    setError('')
    setNotice('')

    try {
      if (submit) {
        const missing = FIELDS.filter((field) => form[field.key] === null)
        if (missing.length) {
          throw new Error(
            `Avant soumission, renseignez ou confirmez explicitement chaque rubrique. Rubriques manquantes : ${missing.map((field) => field.label).join(', ')}.`,
          )
        }
      }

      const response = await fetch(`/api/fiscal/dossiers/${dossierId}/inputs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fiscal_year: selectedYear,
          payload: form,
          submit,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Enregistrement impossible.')

      setNotice(submit ? 'Fiche soumise à la revue du cabinet.' : 'Brouillon enregistré.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Une erreur est survenue.')
    } finally {
      setSaving(false)
    }
  }

  async function transition(status: 'validated' | 'needs_changes') {
    if (!current) return
    setSaving(true)
    setError('')
    setNotice('')

    try {
      if (status === 'needs_changes' && !reviewNote.trim()) {
        throw new Error('Un motif est obligatoire pour demander une correction.')
      }

      const response = await fetch(
        `/api/fiscal/dossiers/${dossierId}/inputs/${current.id}/transition`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, note: reviewNote.trim() || null }),
        },
      )
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Transition impossible.')

      setNotice(status === 'validated' ? 'Fiche annuelle validée.' : 'Fiche retournée pour correction.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Une erreur est survenue.')
    } finally {
      setSaving(false)
    }
  }

  if (loading && !result) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Chargement de la fiche annuelle...</div>
  }

  if (!result) {
    return <div className="rounded-2xl border border-red-200 bg-white p-6 text-sm text-red-700">{error || 'Dossier introuvable ou inaccessible.'}</div>
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-blue-700">Données annuelles · XOF</div>
            <h2 className="mt-1 text-xl font-bold text-slate-950">Exercices du dossier</h2>
            <p className="mt-1 text-sm text-slate-500">
              Période : {result.period_start} → {result.period_end}
            </p>
          </div>
          <label className="text-sm font-semibold text-slate-700">
            Exercice fiscal
            <select
              value={selectedYear ?? ''}
              onChange={(event) => setSelectedYear(Number(event.target.value))}
              className={`${inputClass} min-w-40`}
            >
              {years.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </label>
        </div>
        {locked && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Le dossier est validé ou clôturé. La saisie et les transitions sont verrouillées.
          </div>
        )}
      </section>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-bold text-slate-950">Fiche de l’exercice {selectedYear}</h3>
            <p className="mt-1 text-xs text-slate-500">
              {current ? `Version ${current.version} · ${STATUS[current.status]}` : 'Aucune fiche enregistrée pour cet exercice.'}
            </p>
          </div>
          {current && (
            <span className="inline-flex w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {STATUS[current.status]}
            </span>
          )}
        </div>

        <div className="space-y-6 p-5">
          {current?.validation_note && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-sm font-semibold text-amber-900">Observation du cabinet</div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-amber-800">{current.validation_note}</p>
            </div>
          )}

          <fieldset disabled={!editable || saving} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-slate-700">
                Nature des données
                <select
                  value={form.source_mode}
                  onChange={(event) => setForm((previous) => ({
                    ...previous,
                    source_mode: event.target.value as Payload['source_mode'],
                  }))}
                  className={inputClass}
                >
                  <option value="actual">Données réelles / justifiées</option>
                  <option value="estimated">Données estimées / provisoires</option>
                </select>
              </label>
              <div className="rounded-xl bg-blue-50 p-3 text-xs leading-5 text-blue-800">
                Les données estimées restent explicitement identifiées. Elles ne constituent pas une déclaration certifiée ni une liquidation fiscale.
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              {FIELDS.map((field) => (
                <label key={field.key} className="block text-sm font-semibold text-slate-700">
                  {field.label}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form[field.key] ?? ''}
                    onChange={(event) => setAmount(field.key, event.target.value)}
                    placeholder="Montant en XOF"
                    className={inputClass}
                  />
                  <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">{field.help}</span>
                </label>
              ))}
            </div>

            <label className="block text-sm font-semibold text-slate-700">
              Source, justificatifs et observations
              <textarea
                rows={4}
                maxLength={2000}
                value={form.source_note ?? ''}
                onChange={(event) => setForm((previous) => ({
                  ...previous,
                  source_note: event.target.value || null,
                }))}
                placeholder="Références des états financiers, balances, déclarations, reçus, réserves ou explications..."
                className={inputClass}
              />
              <span className="mt-1 block text-xs font-normal text-slate-400">{(form.source_note ?? '').length}/2000 caractères</span>
            </label>
          </fieldset>

          {!editable && current && (
            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              Cette fiche n’est pas modifiable dans son état actuel. Une fiche soumise doit être revue par le cabinet ; une fiche validée est conservée comme référence.
            </div>
          )}

          {editable && (
            <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={saving}
                onClick={() => void save(false)}
                className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {saving ? 'Traitement...' : 'Enregistrer le brouillon'}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save(true)}
                className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
              >
                Soumettre à la revue
              </button>
            </div>
          )}

          {canReview && (
            <div className="space-y-4 border-t border-slate-100 pt-5">
              <div>
                <h4 className="font-bold text-slate-900">Revue du cabinet</h4>
                <p className="mt-1 text-sm text-slate-500">
                  La validation confirme la revue de cette fiche. Le retour pour correction exige un motif.
                </p>
              </div>
              <label className="block text-sm font-semibold text-slate-700">
                Note de revue
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={reviewNote}
                  onChange={(event) => setReviewNote(event.target.value)}
                  placeholder="Motif de retour ou observation de validation..."
                  className={inputClass}
                />
              </label>
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={saving || !reviewNote.trim()}
                  onClick={() => void transition('needs_changes')}
                  className="rounded-xl border border-amber-300 px-5 py-3 text-sm font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                >
                  Demander une correction
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void transition('validated')}
                  className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  Valider la fiche
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {current && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setHistoryOpen((value) => !value)}
            className="flex w-full items-center justify-between px-5 py-4 text-left"
          >
            <span>
              <span className="block font-bold text-slate-950">Historique et traçabilité</span>
              <span className="mt-1 block text-xs text-slate-500">
                {current.revisions.length} version(s) · {current.events.length} événement(s)
              </span>
            </span>
            <span className="text-sm font-semibold text-blue-700">{historyOpen ? 'Masquer' : 'Afficher'}</span>
          </button>

          {historyOpen && (
            <div className="space-y-5 border-t border-slate-100 p-5">
              <div>
                <h4 className="mb-3 text-sm font-bold text-slate-800">Versions conservées</h4>
                <div className="space-y-3">
                  {current.revisions.map((revision) => (
                    <details key={revision.id} className="rounded-xl border border-slate-200 p-3">
                      <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                        Version {revision.version} · {dateLabel(revision.created_at)}
                      </summary>
                      <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                        {FIELDS.map((field) => (
                          <div key={field.key}>
                            {field.label} : <strong>{formatAmount(revision.payload[field.key])}</strong>
                          </div>
                        ))}
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        Source : {revision.payload.source_mode === 'estimated' ? 'Estimée' : 'Réelle'}
                      </p>
                    </details>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="mb-3 text-sm font-bold text-slate-800">Journal des événements</h4>
                <div className="space-y-3">
                  {current.events.map((event) => (
                    <div key={event.id} className="border-l-2 border-blue-200 pl-3">
                      <div className="text-sm font-semibold text-slate-800">
                        {{
                          created: 'Création',
                          updated: 'Modification',
                          submitted: 'Soumission à revue',
                          validated: 'Validation',
                          returned_for_changes: 'Retour pour correction',
                        }[event.event_type] || event.event_type}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{dateLabel(event.created_at)}</div>
                      {typeof event.details?.note === 'string' && (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{event.details.note}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
        <strong>Limite fonctionnelle :</strong> cette interface collecte et trace les données annuelles. Elle ne calcule pas l’IS, la TVA, l’ITS, la VPS, les pénalités ou un solde fiscal. Les montants doivent être rapprochés des pièces justificatives et des règles réglementaires validées par le cabinet.
      </div>
    </div>
  )
}
