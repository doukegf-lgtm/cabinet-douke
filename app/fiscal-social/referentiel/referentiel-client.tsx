'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type Entry = {
  id: string
  entry_type: 'legal_source' | 'parameter' | 'obligation'
  code: string
  title: string
  description: string | null
  document_type: string | null
  authority: string | null
  reference_number: string | null
  publication_date: string | null
  official_url: string | null
  article_reference: string | null
  parameter_category: string | null
  numeric_value: number | null
  text_value: string | null
  unit: string | null
  currency: string | null
  obligation_category: string | null
  periodicity: string | null
  due_rule: string | null
  target_group: string | null
  source_entry_id: string | null
  effective_from: string | null
  effective_to: string | null
  verification_status: string
  validation_note: string | null
}

const TABS = [
  { id: 'legal_source', label: 'Textes officiels' },
  { id: 'parameter', label: 'Paramètres' },
  { id: 'obligation', label: 'Obligations' },
] as const

const STATUS_LABELS: Record<string, string> = {
  to_verify: 'À vérifier',
  in_review: 'En validation',
  validated: 'Validé',
  replaced: 'Remplacé',
  repealed: 'Abrogé',
}

export default function ReferentialClient() {
  const [tab, setTab] = useState<Entry['entry_type']>('legal_source')
  const [entries, setEntries] = useState<Entry[]>([])
  const [sourceEntries, setSourceEntries] = useState<Entry[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState<Entry | null>(null)
  const [form, setForm] = useState<Record<string, string>>({
    code: '', title: '', description: '', document_type: '',
    authority: '', reference_number: '', publication_date: '',
    official_url: '', article_reference: '', parameter_category: '',
    numeric_value: '', text_value: '', unit: '', currency: 'XOF',
    obligation_category: '', periodicity: '', due_rule: '',
    target_group: '', source_entry_id: '', effective_from: '',
    effective_to: '', verification_status: 'to_verify',
    validation_note: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ type: tab })
      if (search.trim()) params.set('search', search.trim())
      const [response, sourceResponse] = await Promise.all([
        fetch(`/api/fiscal/referentiel?${params}`, { cache: 'no-store' }),
        tab === 'legal_source'
          ? Promise.resolve(null)
          : fetch('/api/fiscal/referentiel?type=legal_source', { cache: 'no-store' }),
      ])
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Chargement impossible.')
      setEntries(result.data || [])

      if (sourceResponse) {
        const sourceResult = await sourceResponse.json()
        if (!sourceResponse.ok) throw new Error(sourceResult.error || 'Chargement des textes sources impossible.')
        setSourceEntries(sourceResult.data || [])
      } else {
        setSourceEntries(result.data || [])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chargement impossible.')
    } finally {
      setLoading(false)
    }
  }, [tab, search])

  useEffect(() => { void load() }, [load])

  function resetForm() {
    setEditing(null)
    setForm({
      code: '', title: '', description: '', document_type: '',
      authority: '', reference_number: '', publication_date: '',
      official_url: '', article_reference: '', parameter_category: '',
      numeric_value: '', text_value: '', unit: '', currency: 'XOF',
      obligation_category: '', periodicity: '', due_rule: '',
      target_group: '', source_entry_id: '', effective_from: '',
      effective_to: '', verification_status: 'to_verify',
      validation_note: '',
    })
  }

  function editEntry(entry: Entry) {
    setEditing(entry)
    setForm(current => {
      const next: Record<string, string> = {}
      for (const key of Object.keys(current)) {
        const value = (entry as unknown as Record<string, unknown>)[key]
        next[key] = value === null || value === undefined ? '' : String(value)
      }
      return next
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function field(name: string, label: string, type = 'text', required = false) {
    return (
      <label className="block space-y-1 text-sm" key={name}>
        <span className="font-medium">{label}{required ? ' *' : ''}</span>
        <input
          type={type}
          required={required}
          value={form[name] ?? ''}
          onChange={event => setForm(current => ({ ...current, [name]: event.target.value }))}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2"
        />
      </label>
    )
  }

  function selectField(name: string, label: string, options: { value: string; label: string }[]) {
    return (
      <label className="block space-y-1 text-sm" key={name}>
        <span className="font-medium">{label}</span>
        <select
          value={form[name] ?? ''}
          onChange={event => setForm(current => ({ ...current, [name]: event.target.value }))}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2"
        >
          {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
    )
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')

    const payload: Record<string, unknown> = { ...form }
    for (const key of Object.keys(payload)) {
      if (payload[key] === '') payload[key] = null
    }
    if (payload.numeric_value !== null) payload.numeric_value = Number(payload.numeric_value)
    if (payload.currency === 'XOF' && tab !== 'parameter') payload.currency = null

    if (!editing) payload.entry_type = tab
    if (tab !== 'legal_source' && !payload.source_entry_id) payload.source_entry_id = null

    try {
      const response = await fetch(
        editing ? `/api/fiscal/referentiel/${editing.id}` : '/api/fiscal/referentiel',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Enregistrement impossible.')
      setMessage(editing ? 'Fiche mise à jour.' : 'Fiche créée.')
      resetForm()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        <strong>Règle de sécurité :</strong> aucune règle ne doit alimenter un calcul tant que son statut
        n’est pas « Validé » et que sa source juridique, son article et sa date d’effet ne sont pas renseignés.
        Aucun taux ou seuil n’est prérempli.
      </div>

      <div className="flex flex-wrap gap-2 border-b pb-3">
        {TABS.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => { resetForm(); setTab(item.id) }}
            className={`rounded-md px-4 py-2 text-sm ${tab === item.id ? 'bg-slate-900 text-white' : 'border hover:bg-gray-50'}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <form onSubmit={save} className="space-y-4 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            {editing ? 'Modifier la fiche' : `Ajouter : ${TABS.find(item => item.id === tab)?.label}`}
          </h2>
          {editing && <button type="button" onClick={resetForm} className="text-sm underline">Annuler</button>}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {field('code', 'Code interne', 'text', true)}
          {field('title', 'Intitulé', 'text', true)}
          {field('description', 'Description')}
          {field('effective_from', 'Date de début d’application', 'date')}
          {field('effective_to', 'Date de fin d’application', 'date')}

          {tab === 'legal_source' && <>
            {field('document_type', 'Type de texte (loi, décret, arrêté...)')}
            {field('authority', 'Autorité émettrice')}
            {field('reference_number', 'Numéro / référence officielle')}
            {field('publication_date', 'Date de publication', 'date')}
            {field('official_url', 'Lien officiel', 'url')}
          </>}

          {tab === 'parameter' && <>
            {field('parameter_category', 'Catégorie (taux, seuil, plafond, montant...)')}
            {field('numeric_value', 'Valeur numérique', 'number')}
            {field('text_value', 'Valeur textuelle')}
            {field('unit', 'Unité (%, XOF, jours...)')}
            {selectField('currency', 'Devise', [
              { value: 'XOF', label: 'XOF' },
              { value: '', label: 'Sans devise' },
            ])}
          </>}

          {tab === 'obligation' && <>
            {field('obligation_category', 'Catégorie (déclaration, paiement...)')}
            {field('periodicity', 'Périodicité')}
            {field('due_rule', 'Règle d’échéance')}
            {field('target_group', 'Population concernée')}
          </>}

          {tab !== 'legal_source' && <>
            <label className="block space-y-1 text-sm md:col-span-2">
              <span className="font-medium">Texte juridique source</span>
              <select
                value={form.source_entry_id ?? ''}
                onChange={event => setForm(current => ({ ...current, source_entry_id: event.target.value }))}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2"
              >
                <option value="">Sélectionner ultérieurement</option>
                {sourceEntries.map(source => (
                  <option key={source.id} value={source.id}>{source.code} — {source.title}</option>
                ))}
              </select>
              <span className="text-xs text-gray-500">Crée d’abord le texte officiel dans l’onglet correspondant.</span>
            </label>
            {field('article_reference', 'Article / disposition de référence')}
          </>}

          {selectField('verification_status', 'Statut de vérification', [
            { value: 'to_verify', label: 'À vérifier' },
            { value: 'in_review', label: 'En validation' },
            ...(editing ? [{ value: 'validated', label: 'Validé' }] : []),
            { value: 'replaced', label: 'Remplacé' },
            { value: 'repealed', label: 'Abrogé' },
          ])}
          <label className="block space-y-1 text-sm md:col-span-2">
            <span className="font-medium">Note de validation / commentaire</span>
            <textarea
              rows={3}
              value={form.validation_note ?? ''}
              onChange={event => setForm(current => ({ ...current, validation_note: event.target.value }))}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2"
            />
          </label>
        </div>

        <p className="text-xs text-gray-500">Les champs marqués * sont obligatoires. Toute nouvelle fiche commence « À vérifier ». La validation intervient après contrôle de la source, de l’article et de la date d’effet.</p>
        <div className="flex flex-wrap gap-2">
          <button disabled={saving} className="rounded-md bg-slate-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50">
            {saving ? 'Enregistrement…' : editing ? 'Enregistrer les modifications' : 'Créer la fiche'}
          </button>
          {editing && <button type="button" onClick={resetForm} className="rounded-md border px-4 py-2 text-sm">Annuler</button>}
        </div>
      </form>

      {error && <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {message && <p role="status" className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800">{message}</p>}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Fiches enregistrées</h2>
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Rechercher par code ou intitulé"
            className="w-full max-w-sm rounded-md border px-3 py-2 text-sm"
          />
        </div>

        {loading ? <p className="text-sm text-gray-500">Chargement…</p>
          : entries.length === 0 ? <p className="rounded-lg border p-5 text-sm text-gray-500">Aucune fiche dans cette catégorie. Tu peux créer la première ci-dessus.</p>
          : <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-3">Code / intitulé</th>
                  <th className="p-3">Période d’application</th>
                  <th className="p-3">Statut</th>
                  <th className="p-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(entry => (
                  <tr key={entry.id} className="border-t align-top">
                    <td className="p-3">
                      <strong>{entry.code}</strong>
                      <p className="mt-1">{entry.title}</p>
                      {entry.official_url && <a href={entry.official_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-blue-700 underline">Consulter le texte officiel</a>}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {entry.effective_from || 'Non définie'} – {entry.effective_to || 'En cours / non précisée'}
                    </td>
                    <td className="p-3">{STATUS_LABELS[entry.verification_status] || entry.verification_status}</td>
                    <td className="p-3">
                      <button type="button" onClick={() => editEntry(entry)} className="rounded border px-3 py-1.5 hover:bg-gray-50">Modifier</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
      </section>
    </div>
  )
}
