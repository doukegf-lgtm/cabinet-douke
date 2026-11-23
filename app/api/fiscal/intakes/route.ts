import { NextResponse } from 'next/server'
import { requireModuleAccess } from '@/lib/platform/module-access'
import { getServiceClient } from '@/lib/platform/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const REF = /^DKI-\d{6}-[A-F0-9]{6}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const reply = (data: Record<string, unknown>, status = 200) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })

// Suivi anti-doublon des souscriptions web : claim (avant import) puis complete (après import).
export async function POST(request: Request) {
  try {
    const access = await requireModuleAccess('fiscal')
    if (!access.ok) return access.response

    const raw = await request.text()
    if (raw.length > 2000) return reply({ error: 'Requête trop volumineuse.' }, 413)
    let body: unknown
    try { body = JSON.parse(raw) } catch { return reply({ error: 'JSON invalide.' }, 400) }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return reply({ error: 'Corps invalide.' }, 400)

    const b = body as Record<string, unknown>
    const ref = typeof b.intake_ref === 'string' ? b.intake_ref : ''
    if (!REF.test(ref)) return reply({ error: 'Référence de souscription invalide.' }, 400)
    const db = getServiceClient()

    if (b.action === 'claim') {
      const { data: row, error } = await db.from('fiscal_web_intakes').select('id,status,imported_dossier_id').eq('intake_ref', ref).maybeSingle()
      if (error) return reply({ error: 'Lecture de la souscription impossible.' }, 500)
      if (!row) return reply({ tracked: false })
      if (row.status === 'imported') {
        return reply({ error: 'Cette souscription a déjà été importée' + (row.imported_dossier_id ? ' (dossier ' + row.imported_dossier_id + ').' : '.'), dossier_id: row.imported_dossier_id ?? null }, 409)
      }
      if (row.status === 'rejected' || row.status === 'spam') return reply({ error: 'Cette souscription est marquée comme rejetée.' }, 409)
      if (row.status === 'in_review') return reply({ tracked: true, resumed: true })
      const { data: upd, error: e2 } = await db.from('fiscal_web_intakes').update({ status: 'in_review' }).eq('id', row.id).eq('status', 'new').select('id')
      if (e2 || !upd || upd.length === 0) return reply({ error: 'Cette souscription vient d’être prise en charge par un autre utilisateur.' }, 409)
      return reply({ tracked: true, resumed: false })
    }

    if (b.action === 'complete') {
      const dossierId = typeof b.dossier_id === 'string' ? b.dossier_id : ''
      if (!UUID.test(dossierId)) return reply({ error: 'Identifiant de dossier invalide.' }, 400)
      const { error } = await db.from('fiscal_web_intakes').update({
        status: 'imported', imported_dossier_id: dossierId, imported_by: access.session.sub, imported_at: new Date().toISOString(),
      }).eq('intake_ref', ref).in('status', ['new', 'in_review'])
      if (error) return reply({ error: 'Le suivi de la souscription n’a pas pu être finalisé.' }, 500)
      return reply({ ok: true })
    }

    return reply({ error: 'Action inconnue.' }, 400)
  } catch {
    return reply({ error: 'Erreur serveur.' }, 500)
  }
}