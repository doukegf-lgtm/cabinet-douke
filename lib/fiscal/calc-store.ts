import type { SupabaseClient } from '@supabase/supabase-js'
import { CalcBlockedError } from './engine/penalty-core'
import type { CalcKind, StoredCalculation } from './engine/debt-adapter'

/**
 * Lecture SERVEUR des calculs enregistrés d'un dossier (table fiscal_calculations, client service_role).
 * Aucune donnée issue du navigateur n'est crédible : seuls les identifiants sont reçus, les montants sont relus ici.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const KINDS = ['cnss', 'its_vps', 'tva', 'aib', 'retenues']

export async function loadStoredCalculations(client: SupabaseClient, dossierId: string, ids: string[]): Promise<StoredCalculation[]> {
  if (!UUID_RE.test(dossierId)) throw new CalcBlockedError(['Identifiant de dossier invalide.'])
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 50) throw new CalcBlockedError(['1 à 50 identifiants de calcul attendus.'])
  const uniq = Array.from(new Set(ids))
  if (uniq.length !== ids.length) throw new CalcBlockedError(['Identifiants de calcul en doublon.'])
  uniq.forEach(i => { if (typeof i !== 'string' || !UUID_RE.test(i)) throw new CalcBlockedError(['Identifiant de calcul invalide.']) })

  const { data, error } = await client.from('fiscal_calculations')
    .select('id,dossier_id,validation_status,blockers,input_snapshot,result_snapshot')
    .eq('dossier_id', dossierId).in('id', uniq)
  if (error) throw new CalcBlockedError(['Lecture des calculs impossible.'])
  const rows = (data || []) as Array<Record<string, unknown>>
  const found: Record<string, Record<string, unknown>> = {}
  rows.forEach(r => { found[String(r.id)] = r })
  const missing = uniq.filter(i => !found[i])
  if (missing.length) throw new CalcBlockedError(['Calcul(s) introuvable(s) dans ce dossier : ' + missing.join(', ')])

  return uniq.map(id => {
    const r = found[id]
    const snap = r.input_snapshot
    const inputs = snap && typeof snap === 'object' ? (snap as Record<string, unknown>).inputs : undefined
    const kind = inputs && typeof inputs === 'object' ? (inputs as Record<string, unknown>).kind : undefined
    const year = inputs && typeof inputs === 'object' ? (inputs as Record<string, unknown>).fiscal_year : undefined
    if (typeof kind !== 'string' || KINDS.indexOf(kind) < 0) throw new CalcBlockedError(['Calcul ' + id + ' : type inconnu ou non lié à un moteur (kind absent de l\'instantané).'])
    if (!Number.isInteger(year)) throw new CalcBlockedError(['Calcul ' + id + ' : exercice absent de l\'instantané.'])
    if (r.result_snapshot === null || r.result_snapshot === undefined) throw new CalcBlockedError(['Calcul ' + id + ' : aucun résultat enregistré.'])
    if (Array.isArray(r.blockers) && (r.blockers as unknown[]).length > 0) throw new CalcBlockedError(['Calcul ' + id + ' : des blocages sont enregistrés.'])
    return { id, kind: kind as CalcKind, fiscalYear: year as number, validationStatus: String(r.validation_status), result: r.result_snapshot }
  })
}
