'use client'

import { useCallback, useEffect, useState } from 'react'

type Profile = {
  legal_form: string
  tax_regime_code: string
  vat_status: string
  tax_center: string
  effective_date: string
  reference_note: string
}

type SectionInput = {
  id: string
  section_code: string
  fiscal_year: number
  payload: {
    source_mode?: 'actual' | 'estimated' | 'mixed'
    source_note?: string | null
    data?: Record<string, unknown>
  }
  status: 'draft' | 'submitted' | 'needs_changes' | 'validated'
  version: number
  validation_note?: string | null
  updated_at?: string
}

const EMPTY: Profile = {
  legal_form: '',
  tax_regime_code: '',
  vat_status: '',
  tax_center: '',
  effective_date: '',
  reference_note: '',
}

const FIELDS: Array<{
  key: keyof Profile
  label: string
  placeholder: string
  required?: boolean
}> = [
  { key: 'legal_form', label: 'Forme juridique', placeholder: 'Ex. : SARL, SA, entreprise individuelle', required: true },
  { key: 'tax_regime_code', label: 'Régime fiscal applicable', placeholder: 'Code ou intitulé exact du régime', required: true },
  { key: 'vat_status', label: 'Situation au regard de la TVA', placeholder: 'Régime, assujettissement ou exonération' },
  { key: 'tax_center', label: 'Centre des impôts compétent', placeholder: 'Centre ou service fiscal' },
  { key: 'effective_date', label: "Date d'effet du profil", placeholder: 'AAAA-MM-JJ' },
  { key: 'reference_note', label: 'Référence ou précision', placeholder: 'Référence documentaire, décision ou précision utile' },
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export default function TaxProfileClient({ dossierId }: { dossierId: string }) {
  const [year, setYear] = useState(new Date().getFullYear())
  const [profile, setProfile] = useState<Profile>(EMPTY)
  const [sourceMode, setSourceMode] = useState<'actual' | 'estimated' | 'mixed'>('actual')
  const [sourceNote, setSourceNote] = useState('')
  const [input, setInput] = useState<SectionInput | null>(null)
  const [dossierStatus, setDossierStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [reviewNote, setReviewNote] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(
        `/api/fiscal/dossiers/${dossierId}/sections?history=0`,
        { cache: 'no-store' },
      )
      const result: unknown = await response.json()
      if (!response.ok) {
        throw new Error(isRecord(result) && typeof result.error === 'string'
          ? result.error : 'Impossible de charger le profil fiscal.')
      }
      if (!isRecord(result) || !Array.isArray(result.data)) {
        throw new Error('Réponse serveur invalide.')
      }

      setDossierStatus(typeof result.dossier_status === 'string' ? result.dossier_status : '')

      const startYear = typeof result.period_start === 'string'
        ? new Date(result.period_start).getUTCFullYear()
        : NaN
      const endYear = typeof result.period_end === 'string'
        ? new Date(result.period_end).getUTCFullYear()
        : NaN

      if (
        Number.isInteger(startYear) &&
        Number.isInteger(endYear) &&
        (year < startYear || year > endYear)
      ) {
        setYear(startYear)
        return
      }

      const found = result.data.find((item: unknown) =>
        isRecord(item) &&
        item.section_code === 'tax_profile' &&
        item.fiscal_year === year,
      ) as SectionInput | undefined

      setInput(found || null)

      if (found && isRecord(found.payload)) {
        const data = isRecord(found.payload.data) ? found.payload.data : {}
        const next: Profile = { ...EMPTY }
        for (const key of Object.keys(EMPTY) as Array<keyof Profile>) {
          const value = data[key]
          if (typeof value === 'string') next[key] = value
        }
        setProfile(next)
        if (
          found.payload.source_mode === 'actual' ||
          found.payload.source_mode === 'estimated' ||
          found.payload.source_mode === 'mixed'
        ) setSourceMode(found.payload.source_mode)
        setSourceNote(typeof found.payload.source_note === 'string' ? found.payload.source_note : '')
      } else {
        setProfile(EMPTY)
        setSourceMode('actual')
        setSourceNote('')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.')
    } finally {
      setLoading(false)
    }
  }, [dossierId, year])

  useEffect(() => {
    void load()
  }, [load])

  const editable = !input || input.status === 'draft' || input.status === 'needs_changes'
  const locked = dossierStatus === 'validated' || dossierStatus === 'closed'

  function updateField(key: keyof Profile, value: string) {
    setProfile((current) => ({ ...current, [key]: value }))
  }

  async function save(submit: boolean) {
    if (locked) {
      setError('Le dossier est verrouillé.')
      return
    }
    if (submit && (!profile.legal_form.trim() || !profile.tax_regime_code.trim())) {
      setError('La forme juridique et le régime fiscal sont obligatoires avant soumission.')
      return
    }

    setSaving(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch(`/api/fiscal/dossiers/${dossierId}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section_code: 'tax_profile',
          fiscal_year: year,
          submit,
          payload: {
            source_mode: sourceMode,
            source_note: sourceNote.trim() || null,
            data: profile,
            provenance: {
              capture: 'cabinet',
              fields: Object.fromEntries(
                Object.keys(profile).map((key) => [
                  key,
                  profile[key as keyof Profile].trim() ? 'cabinet_input' : 'not_provided',
                ]),
              ),
            },
          },
        }),
      })
      const result: unknown = await response.json()
      if (!response.ok) {
        throw new Error(isRecord(result) && typeof result.error === 'string'
          ? result.error : 'Échec de sauvegarde.')
      }
      setMessage(submit ? 'Profil soumis à la validation du Cabinet.' : 'Brouillon enregistré.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de sauvegarde.')
    } finally {
      setSaving(false)
    }
  }

  async function transition(status: 'validated' | 'needs_changes') {
    if (!input) return
    if (status === 'needs_changes' && !reviewNote.trim()) {
      setError('Le motif du retour pour correction est obligatoire.')
      return
    }

    setSaving(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch(
        `/api/fiscal/dossiers/${dossierId}/sections/${input.id}/transition`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, note: reviewNote.trim() || null }),
        },
      )
      const result: unknown = await response.json()
      if (!response.ok) {
        throw new Error(isRecord(result) && typeof result.error === 'string'
          ? result.error : 'Échec de la transition.')
      }
      setMessage(status === 'validated' ? 'Profil fiscal validé.' : 'Profil retourné pour correction.')
      setReviewNote('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de validation.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Identification fiscale</p>
          <h2 className="mt-1 text-xl font-bold text-slate-950">Profil fiscal du dossier</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Informations de référence à contrôler par le Cabinet avant tout traitement fiscal.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="tax-profile-year" className="text-sm font-medium text-slate-600">Exercice</label>
          <input
            id="tax-profile-year"
            type="number"
            min={2000}
            max={2100}
            value={year}
            disabled={saving}
            onChange={(e) => setYear(Number(e.target.value))}
            className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
          {input ? `Version ${input.version}` : 'Nouvelle fiche'}
        </span>
        {input && (
          <span className="rounded-full bg-blue-50 px-3 py-1 font-semibold text-blue-800">
            {({
              draft: 'Brouillon',
              submitted: 'Soumis · en revue',
              needs_changes: 'À corriger',
              validated: 'Validé',
            })[input.status]}
          </span>
        )}
        {locked && <span className="rounded-full bg-red-50 px-3 py-1 font-semibold text-red-700">Dossier verrouillé</span>}
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-slate-500">Chargement du profil fiscal…</p>
      ) : (
        <>
          {input?.validation_note && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <strong>Note de revue :</strong> {input.validation_note}
            </div>
          )}

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {FIELDS.map((field) => (
              <label key={field.key} className="block">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                  {field.label}{field.required ? ' *' : ''}
                </span>
                <input
                  value={profile[field.key]}
                  disabled={!editable || locked || saving}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  maxLength={500}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 disabled:bg-slate-100"
                />
              </label>
            ))}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Nature des informations</span>
              <select
                value={sourceMode}
                disabled={!editable || locked || saving}
                onChange={(e) => setSourceMode(e.target.value as typeof sourceMode)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm disabled:bg-slate-100"
              >
                <option value="actual">Réelles / justifiées</option>
                <option value="estimated">Estimées</option>
                <option value="mixed">Mixtes</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Note sur la provenance</span>
              <input
                value={sourceNote}
                disabled={!editable || locked || saving}
                onChange={(e) => setSourceNote(e.target.value)}
                maxLength={2000}
                placeholder="Documents consultés, déclarations du client…"
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm disabled:bg-slate-100"
              />
            </label>
          </div>

          {editable && !locked && (
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={() => void save(false)}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Enregistrer le brouillon
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save(true)}
                className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
              >
                Soumettre pour validation
              </button>
            </div>
          )}

          {input?.status === 'submitted' && !locked && (
            <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
              <h3 className="font-semibold text-slate-900">Revue par le Cabinet</h3>
              <label className="mt-3 block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Note de validation ou motif de correction</span>
                <textarea
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  maxLength={2000}
                  rows={3}
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm"
                  placeholder="Précisez les vérifications effectuées ou les corrections attendues…"
                />
              </label>
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void transition('validated')}
                  className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Valider le profil
                </button>
                <button
                  type="button"
                  disabled={saving || !reviewNote.trim()}
                  onClick={() => void transition('needs_changes')}
                  className="rounded-xl border border-amber-400 px-4 py-2.5 text-sm font-semibold text-amber-900 disabled:opacity-50"
                >
                  Retourner pour correction
                </button>
              </div>
            </div>
          )}

          {input?.status === 'validated' && (
            <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              Ce profil est validé et verrouillé. Toute modification devra passer par une procédure de réouverture auditée.
            </p>
          )}
        </>
      )}

      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {saving && <p className="mt-3 text-sm text-slate-500">Traitement en cours…</p>}
    </section>
  )
}
