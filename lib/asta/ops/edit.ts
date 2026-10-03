export const MAX_IMAGE = 400000
const clean = (v: unknown, max: number): string | null =>
  typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max) : null
const IMG = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/]+={0,2}$/

export type EditResult = { ok: true; content: Record<string, unknown>; title: string | null } | { ok: false; error: string }

// Valide une modification de contenu. Ne modifie jamais l'objet d'origine.
export function validateEdit(kind: string, slotKey: string, current: Record<string, unknown>, b: Record<string, unknown>): EditResult {
  const next: Record<string, unknown> = { ...current }
  let changed = false
  let title: string | null = null
  const fields: [string, number, string][] = kind === 'publication'
    ? [['headline', 120, 'Titre de l’affiche'], ['sub', 200, 'Sous-titre'], ['cta', 100, 'Bouton'], ['body', 2000, 'Texte de la publication']]
    : [['draft', 2000, 'Message']]
  for (const [k, max, label] of fields) {
    if (b[k] === undefined) continue
    const v = clean(b[k], max)
    if (!v) return { ok: false, error: `${label} : texte requis` }
    if (v !== current[k]) { next[k] = v; changed = true }
  }
  if (kind === 'publication' && typeof next.link === 'string' && typeof next.body === 'string' && !next.body.includes(next.link))
    return { ok: false, error: `Le texte doit conserver le lien de suivi : ${next.link}` }
  if (b.remove_image === true) {
    if (next.image !== undefined) { delete next.image; changed = true }
  } else if (b.image !== undefined) {
    if (kind !== 'publication') return { ok: false, error: 'Un visuel n’est possible que pour une publication' }
    if (typeof b.image !== 'string' || b.image.length > MAX_IMAGE || !IMG.test(b.image)) return { ok: false, error: 'Visuel invalide (JPEG, PNG ou WebP, 400 Ko maximum)' }
    if (b.image !== current.image) { next.image = b.image; changed = true }
  }
  if (kind === 'publication' && typeof next.headline === 'string' && next.headline !== current.headline) {
    const m = /^post(\d)$/.exec(slotKey)
    if (m) title = `Publication ${m[1]} : ${next.headline}`.slice(0, 120)
  }
  if (!changed) return { ok: false, error: 'Aucune modification' }
  return { ok: true, content: next, title }
}
