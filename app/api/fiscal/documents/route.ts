import { createHash, randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/platform/auth'
import { getServiceClient } from '@/lib/platform/supabase-server'
import {
  DOCUMENT_BUCKET,
  DOCUMENT_MAX_BYTES,
  documentError,
  isUuid,
  safeFilename,
  validateDocumentFile,
} from '@/lib/fiscal/document-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const access = await requireAdmin()
    if (!access.ok) return access.response

    const params = new URL(request.url).searchParams
    const dossierId = params.get('dossier_id') || ''
    const includeArchived = params.get('include_archived') === 'true'

    if (!isUuid(dossierId)) return documentError('Identifiant de dossier invalide.')

    const client = getServiceClient()
    const { data: dossier, error: dossierError } = await client
      .from('fiscal_dossiers')
      .select('id')
      .eq('id', dossierId)
      .maybeSingle()

    if (dossierError) return documentError('Vérification du dossier impossible.', 500)
    if (!dossier) return documentError('Dossier introuvable.', 404)

    let query = client
      .from('fiscal_documents')
      .select('id, dossier_id, original_filename, mime_type, size_bytes, sha256, uploaded_by, created_at, status')
      .eq('dossier_id', dossierId)
      .order('created_at', { ascending: false })
      .limit(200)

    if (!includeArchived) query = query.eq('status', 'active')

    const { data, error } = await query
    if (error) return documentError('Chargement des documents impossible.', 500)

    return NextResponse.json(
      { data: data ?? [] },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return documentError('Erreur serveur lors du chargement des documents.', 500)
  }
}

export async function POST(request: Request) {
  let uploadedPath: string | null = null
  let insertedId: string | null = null

  try {
    const access = await requireAdmin()
    if (!access.ok) return access.response

    const form = await request.formData()
    const dossierId = String(form.get('dossier_id') || '')
    const file = form.get('file')

    if (!isUuid(dossierId)) return documentError('Identifiant de dossier invalide.')
    if (!(file instanceof File)) return documentError('Aucun fichier transmis.')
    if (!Number.isSafeInteger(file.size) || file.size <= 0) {
      return documentError('Le fichier est vide ou invalide.')
    }
    if (file.size > DOCUMENT_MAX_BYTES) {
      return documentError('Le fichier dépasse la limite autorisée de 20 Mo.', 413)
    }

    const filename = safeFilename(file.name)
    const mimeType = file.type.toLowerCase()
    const bytes = new Uint8Array(await file.arrayBuffer())
    const validationError = validateDocumentFile(filename, mimeType, file.size, bytes)
    if (validationError) return documentError(validationError)

    const client = getServiceClient()
    const { data: dossier, error: dossierError } = await client
      .from('fiscal_dossiers')
      .select('id')
      .eq('id', dossierId)
      .maybeSingle()

    if (dossierError) return documentError('Vérification du dossier impossible.', 500)
    if (!dossier) return documentError('Dossier introuvable.', 404)

    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const storagePath = `${dossierId}/${randomUUID()}-${filename}`

    const { error: uploadError } = await client.storage
      .from(DOCUMENT_BUCKET)
      .upload(storagePath, bytes, {
        contentType: mimeType,
        cacheControl: '0',
        upsert: false,
      })

    if (uploadError) return documentError('Échec du dépôt dans le stockage privé.', 500)
    uploadedPath = storagePath

    const { data: document, error: insertError } = await client
      .from('fiscal_documents')
      .insert({
        dossier_id: dossierId,
        storage_bucket: DOCUMENT_BUCKET,
        storage_path: storagePath,
        original_filename: filename,
        mime_type: mimeType,
        size_bytes: file.size,
        sha256,
        uploaded_by: access.session.sub,
        status: 'active',
      })
      .select('id, dossier_id, original_filename, mime_type, size_bytes, sha256, uploaded_by, created_at, status')
      .single()

    if (insertError || !document) {
      await client.storage.from(DOCUMENT_BUCKET).remove([storagePath])
      uploadedPath = null
      return documentError('Enregistrement des métadonnées du document impossible.', 500)
    }

    insertedId = document.id

    const { error: auditError } = await client.from('fiscal_audit_events').insert({
      actor_id: access.session.sub,
      action: 'document.uploaded',
      entity_type: 'fiscal_document',
      entity_id: document.id,
      metadata: {
        dossier_id: dossierId,
        original_filename: filename,
        mime_type: mimeType,
        size_bytes: file.size,
        sha256,
      },
    })

    if (auditError) {
      await client.from('fiscal_documents').delete().eq('id', document.id)
      await client.storage.from(DOCUMENT_BUCKET).remove([storagePath])
      uploadedPath = null
      insertedId = null
      return documentError('Journalisation du dépôt impossible : opération annulée.', 500)
    }

    return NextResponse.json(
      { data: document },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    if (uploadedPath) {
      try {
        const client = getServiceClient()
        if (insertedId) await client.from('fiscal_documents').delete().eq('id', insertedId)
        await client.storage.from(DOCUMENT_BUCKET).remove([uploadedPath])
      } catch {
        // Une éventuelle erreur de compensation sera traitée lors du contrôle serveur.
      }
    }
    return documentError('Erreur serveur pendant le dépôt du document.', 500)
  }
}
