import { ItsVpsBlockedError, MAX_ITS_LINES, type ItsVpsLine, type Provenance } from './engine/its-vps'

/**
 * Contrat de la section `its_vps` (fiscal_dossier_inputs.payload) :
 * { source_mode: 'actual'|'estimated'|'mixed',
 *   data: { lines: [{ employee_id, month:'YYYY-MM', its_base, vps_base_override?, vps_exempt:boolean,
 *                     its_withheld?, its_paid?, vps_declared?, vps_paid?, provenance? }] } }
 * Montants : chaînes décimales ou null/absent (= non renseigné, jamais zéro).
 */
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const fail = (m: string): never => { throw new ItsVpsBlockedError([m]) }
const str = (v: unknown, l: string): string | null => {
  if (v === undefined || v === null) return null
  if (typeof v !== 'string') return fail(l + ' : chaîne décimale exigée')
  return v
}

export function parseItsVpsSection(payload: unknown): ItsVpsLine[] {
  if (!isObj(payload) || !isObj(payload.data)) return fail('Section its_vps : structure invalide')
  const mode = payload.source_mode
  if (mode !== 'actual' && mode !== 'estimated' && mode !== 'mixed') return fail('Nature des données absente ou invalide')
  const raw = payload.data.lines
  if (!Array.isArray(raw) || raw.length === 0) return fail('Aucune ligne ITS/VPS')
  if (raw.length > MAX_ITS_LINES) return fail('Capacité dépassée : ' + MAX_ITS_LINES + ' lignes maximum')
  return raw.map((r: unknown, i: number): ItsVpsLine => {
    const w = 'ligne ' + (i + 1)
    if (!isObj(r)) return fail(w + ' : objet exigé')
    if (typeof r.employee_id !== 'string' || !r.employee_id.trim() || r.employee_id.length > 100) return fail(w + ' : employee_id invalide')
    if (typeof r.month !== 'string') return fail(w + ' : month invalide')
    if (typeof r.its_base !== 'string') return fail(w + ' : its_base (chaîne décimale) obligatoire')
    if (typeof r.vps_exempt !== 'boolean') return fail(w + ' : vps_exempt (booléen) obligatoire')
    let provenance: Provenance
    if (r.provenance === 'real' || r.provenance === 'estimated' || r.provenance === 'flat_split') provenance = r.provenance
    else if (r.provenance === undefined) {
      if (mode === 'mixed') return fail(w + ' : provenance obligatoire en mode mixed')
      provenance = mode === 'actual' ? 'real' : 'estimated'
    } else return fail(w + ' : provenance invalide')
    if (mode === 'actual' && provenance !== 'real') return fail(w + ' : provenance incompatible avec source_mode actual')
    return {
      employeeId: r.employee_id, month: r.month, itsBase: r.its_base, vpsExempt: r.vps_exempt, provenance,
      vpsBaseOverride: str(r.vps_base_override, w + ' vps_base_override'),
      itsWithheld: str(r.its_withheld, w + ' its_withheld'), itsPaid: str(r.its_paid, w + ' its_paid'),
      vpsDeclared: str(r.vps_declared, w + ' vps_declared'), vpsPaid: str(r.vps_paid, w + ' vps_paid'),
    }
  })
}
