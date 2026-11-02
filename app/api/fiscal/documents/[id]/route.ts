import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/platform/auth'
import { getServiceClient } from '@/lib/platform/supabase-server'
import { DOCUMENT_BUCKET, documentError, isUuid } from '@/lib/fiscal/document-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Context = { params: { id: string } }

export async function GET(_request: Request, { params }: Context) {
  try {
    const access = await requireAdmin()
    if (!access.ok) return access.response
    if (!isUuid(params.id)) return documentError('Identifiant de document invalide.')

    const client = getServiceClient()
    const { data: document, error } = await client
      .from('fiscal_documents')
      .select('id, storage_bucket, storage_path, original_filename, status')
      .eq('id', params.id)
      .maybeSingle()

    if (error) return documentError('Lecture du document impossible.', 500)
    if (!document || document.status !== 'active') {
      return documentError('Document introuvable ou archivé.', 404)
    }
    if (document.storage_bucket !== DOCUMENT_BUCKET) {
      return documentError('Référentiel de stockage non autorisé.', 500)
    }

    const { data, error: signedError } = await client.storage
      .from(DOCUMENT_BUCKET)
      .createSignedUrl(document.storage_path, 60, {
        download: document.original_filename,
      })

    if (signedError || !data?.signedUrl) {
      return documentError('Création du lien temporaire impossible.', 500)
    }

    return NextResponse.json(
      { url: data.signedUrl, expires_in: 60 },
      { headers: { 'Cache-Control': 'no-store, private' } },
    )
  } catch {
    return documentError('Erreur serveur pendant la préparation du téléchargement.', 500)
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const access = await requireAdmin()
    if (!access.ok) return access.response
    if (!isUuid(params.id)) return documentError('Identifiant de document invalide.')

    const body = await request.json().catch(() => null)
    if (body?.status !== 'archived') {
      return documentError('Seule l’archive logique est autorisée.')
    }

    const client = getServiceClient()
    const { data: current, error: readError } = await client
      .from('fiscal_documents')
      .select('id, dossier_id, original_filename, status')
      .eq('id', params.id)
      .maybeSingle()

    if (readError) return documentError('Lecture du document impossible.', 500)
    if (!current) return documentError('Document introuvable.', 404)
    if (current.status === 'archived') {
      return NextResponse.json({ data: current }, { headers: { 'Cache-Control': 'no-store' } })
    }
    if (current.status !== 'active') {
      return documentError('Ce document ne peut pas être archivé dans son état actuel.', 409)
    }

    const { data: updated, error: updateError } = await client
      .from('fiscal_documents')
      .update({ status: 'archived' })
      .eq('id', params.id)
      .eq('status', 'active')
      .select('id, dossier_id, original_filename, status')
      .maybeSingle()

    if (updateError) return documentError('Archivage impossible.', 500)
    if (!updated) return documentError('Le document a été modifié simultanément. Rechargez la liste.', 409)

    const { error: auditError } = await client.from('fiscal_audit_events').insert({
      actor_id: access.session.sub,
      action: 'document.archived',
      entity_type: 'fiscal_document',
      entity_id: current.id,
      metadata: {
        dossier_id: current.dossier_id,
        original_filename: current.original_filename,
        storage_retained: true,
      },
    })

    if (auditError) {
      await client.from('fiscal_documents')
        .update({ status: 'active' })
        .eq('id', params.id)
        .eq('status', 'archived')
      return documentError('Journalisation de l’archivage impossible : statut restauré.', 500)
    }

    return NextResponse.json(
      { data: updated },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return documentError('Erreur serveur pendant l’archivage.', 500)
  }
}
