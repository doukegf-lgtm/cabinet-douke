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

type DocumentItem = {
  id: string
  dossier_id: string
  original_filename: string
  mime_type: string | null
  size_bytes: number | null
  sha256: string | null
  created_at: string
  status: string
}

const TYPE_LABELS: Record<string, string> = {
  regularisation_fiscale: 'Régularisation fiscale',
  regularisation_sociale: 'Régularisation sociale',
  suivi_fiscal: 'Suivi fiscal',
  suivi_social: 'Suivi social',
}

function formatSize(bytes: number | null) {
  if (bytes === null) return 'Taille inconnue'
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`
}

export default function DocumentsClient() {
  const [dossiers, setDossiers] = useState<Dossier[]>([])
  const [dossierId, setDossierId] = useState('')
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadDossiers = useCallback(async () => {
    try {
      const response = await fetch('/api/fiscal/dossiers?page=1&pageSize=100', { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Chargement des dossiers impossible.')
      const rows = (payload.data || []) as Dossier[]
      setDossiers(rows)
      if (!dossierId && rows.length) setDossierId(rows[0].id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement des dossiers.')
    } finally {
      setLoading(false)
    }
  }, [dossierId])

  const loadDocuments = useCallback(async () => {
    if (!dossierId) {
      setDocuments([])
      return
    }
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ dossier_id: dossierId })
      if (includeArchived) params.set('include_archived', 'true')
      const response = await fetch(`/api/fiscal/documents?${params}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Chargement des documents impossible.')
      setDocuments(payload.data || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement des documents.')
    } finally {
      setLoading(false)
    }
  }, [dossierId, includeArchived])

  useEffect(() => {
    void loadDossiers()
  }, [loadDossiers])

  useEffect(() => {
    void loadDocuments()
  }, [loadDocuments])

  async function uploadDocument(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!dossierId || !file) {
      setError('Sélectionnez un dossier et un fichier.')
      return
    }

    setUploading(true)
    setError('')
    setNotice('')
    try {
      const form = new FormData()
      form.set('dossier_id', dossierId)
      form.set('file', file)
      const response = await fetch('/api/fiscal/documents', {
        method: 'POST',
        body: form,
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Dépôt impossible.')
      setFile(null)
      const input = document.getElementById('fiscal-document-file') as HTMLInputElement | null
      if (input) input.value = ''
      setNotice('Document déposé et journalisé avec succès.')
      await loadDocuments()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur pendant le dépôt.')
    } finally {
      setUploading(false)
    }
  }

  async function downloadDocument(item: DocumentItem) {
    setBusyId(item.id)
    setError('')
    try {
      const response = await fetch(`/api/fiscal/documents/${item.id}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Téléchargement indisponible.')
      window.location.assign(payload.url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de téléchargement.')
    } finally {
      setBusyId('')
    }
  }

  async function archiveDocument(item: DocumentItem) {
    if (!window.confirm(`Archiver « ${item.original_filename} » ? Le fichier restera conservé dans le stockage privé.`)) return
    setBusyId(item.id)
    setError('')
    setNotice('')
    try {
      const response = await fetch(`/api/fiscal/documents/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Archivage impossible.')
      setNotice('Document archivé. Le fichier original est conservé.')
      await loadDocuments()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur pendant l’archivage.')
    } finally {
      setBusyId('')
    }
  }

  const selectedDossier = dossiers.find((dossier) => dossier.id === dossierId)

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm font-medium text-blue-700">GESTION DES PIÈCES</div>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Documents des dossiers</h2>
        <p className="mt-1 text-sm text-slate-500">
          Dépôt contrôlé, téléchargement temporaire et archivage logique des justificatifs.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label htmlFor="fiscal-dossier-select" className="block text-sm font-semibold text-slate-800">
          Dossier concerné
        </label>
        <select
          id="fiscal-dossier-select"
          value={dossierId}
          onChange={(event) => setDossierId(event.target.value)}
          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none focus:border-blue-500 sm:max-w-2xl"
        >
          <option value="">Sélectionner un dossier</option>
          {dossiers.map((dossier) => (
            <option key={dossier.id} value={dossier.id}>
              {dossier.client_name} · {TYPE_LABELS[dossier.dossier_type] || dossier.dossier_type} · {dossier.period_start} → {dossier.period_end}
            </option>
          ))}
        </select>
        {selectedDossier && (
          <p className="mt-2 text-xs text-slate-500">
            Statut du dossier : {selectedDossier.status}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-bold text-slate-900">Déposer une pièce</h3>
        <p className="mt-1 text-sm text-slate-500">
          Formats : PDF, XLSX, XLS, DOCX, CSV, JPG et PNG. Taille maximale : 20 Mo.
        </p>
        <form onSubmit={uploadDocument} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label htmlFor="fiscal-document-file" className="block text-sm font-medium text-slate-700">
              Fichier à déposer
            </label>
            <input
              id="fiscal-document-file"
              type="file"
              accept=".pdf,.xlsx,.xls,.docx,.csv,.jpg,.jpeg,.png"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
              className="mt-2 block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={!dossierId || !file || uploading}
            className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? 'Dépôt en cours…' : 'Déposer le document'}
          </button>
        </form>
      </section>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-bold text-slate-900">Pièces du dossier</h3>
            <p className="mt-1 text-xs text-slate-500">{documents.length} document(s) affiché(s), maximum 200.</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(event) => setIncludeArchived(event.target.checked)}
              className="rounded border-slate-300"
            />
            Inclure les documents archivés
          </label>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Chargement…</div>
        ) : !dossierId ? (
          <div className="p-8 text-center text-sm text-slate-500">Sélectionnez un dossier pour afficher ses documents.</div>
        ) : documents.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">Aucun document pour ce dossier.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {documents.map((item) => (
              <div key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="break-words text-sm font-semibold text-slate-900">{item.original_filename}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {formatSize(item.size_bytes)} · {item.mime_type || 'Type inconnu'} · {new Date(item.created_at).toLocaleString('fr-FR')}
                  </div>
                  {item.sha256 && (
                    <div className="mt-1 break-all font-mono text-[10px] text-slate-400">
                      SHA-256 : {item.sha256}
                    </div>
                  )}
                  {item.status === 'archived' && (
                    <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
                      ARCHIVÉ · CONSERVÉ
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  {item.status === 'active' && (
                    <>
                      <button
                        type="button"
                        onClick={() => void downloadDocument(item)}
                        disabled={busyId === item.id}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Télécharger
                      </button>
                      <button
                        type="button"
                        onClick={() => void archiveDocument(item)}
                        disabled={busyId === item.id}
                        className="rounded-lg border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                      >
                        Archiver
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
