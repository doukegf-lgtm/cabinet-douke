export interface Camp {
  code: string; name: string; type: string; service: string | null; zone: string | null
  conditions: string | null; start_date: string; end_date: string
}
export interface Post {
  slot_key: string; title: string; scheduled_at: string
  content: { headline: string; sub: string; cta: string; body: string; hashtags: string; link: string }
}
export const trackingLink = (site: string, code: string) => `${site.replace(/\/$/, '')}/diagnostic?c=${code}`
const fr = (d: string) => { const [y, m, j] = d.split('-'); return `${j}/${m}/${y}` }
const tag = (v: string | null) => (v ? '#' + v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]/g, '') : '')

// 5 publications, textes sobres, sans chiffre ni promesse inventés. Validation humaine obligatoire avant diffusion.
export function proposePosts(c: Camp, site: string): Post[] {
  const link = trackingLink(site, c.code)
  const where = c.zone ? ` en ${c.zone}` : ''
  const hashtags = ['#DOUKE', '#Entrepreneuriat', tag(c.zone), tag(c.service)].filter((x) => x.length > 1).join(' ')
  const end = fr(c.end_date)
  const cta = 'Faites votre diagnostic gratuit (environ 4 minutes)'
  const cond = c.conditions ? ` ${c.conditions}` : ''
  const angles = [
    { h: 'Ce qui bloque votre croissance', s: 'Beaucoup de dirigeants travaillent beaucoup sans voir la cause.', b: `Beaucoup de dirigeants${where} travaillent énormément sans toujours comprendre ce qui bloque réellement leur croissance.` },
    { h: 'Votre trésorerie réelle', s: 'Savez-vous ce que vous pouvez vraiment dépenser ?', b: 'Savez-vous combien d’argent votre entreprise peut réellement utiliser aujourd’hui ? Ce qui est déjà engagé n’est pas disponible.' },
    { h: c.service ?? c.name, s: `Campagne ${c.name}`, b: `${c.name} : ${c.service ?? 'accompagnement DOUKE'}.${cond} Du ${fr(c.start_date)} au ${end}.` },
    { h: 'Suivre ses chiffres chaque semaine', s: 'Un cahier ou un tableur suffit pour mieux décider.', b: 'Suivre ses revenus et ses dépenses chaque semaine aide à décider avec des chiffres, pas seulement au feeling.' },
    { h: `Jusqu’au ${end}`, s: 'Faites le point en quelques minutes.', b: `Dernière ligne droite jusqu’au ${end}.` },
  ]
  const base = Date.parse(`${c.start_date}T00:00:00Z`)
  const span = Math.round((Date.parse(`${c.end_date}T00:00:00Z`) - base) / 86400000)
  return angles.map((a, i) => {
    const off = span === 0 ? 0 : Math.round((i * span) / 4)
    const hour = 7 + (span === 0 ? i * 2 : 0)
    return {
      slot_key: `post${i + 1}`, title: `Publication ${i + 1} : ${a.h}`.slice(0, 120),
      scheduled_at: new Date(base + off * 86400000 + hour * 3600000).toISOString(),
      content: { headline: a.h, sub: a.s, cta, link, hashtags, body: `${a.b}\n\n${cta} : ${link}\n\n${hashtags}` },
    }
  })
}

export function draftMessage(c: Camp, p: { name: string; sector?: string | null; city?: string | null }): string {
  const ctx = [p.sector, p.city].filter(Boolean).join(', ')
  const lines = [
    'Bonjour,',
    'Je suis ASTA, assistante numérique de DOUKE Growth & Funding.',
    ctx ? `Je vous écris au sujet de ${p.name} (${ctx}).` : `Je vous écris au sujet de ${p.name}.`,
    c.service ? `Nous accompagnons les entreprises${c.zone ? ' de ' + c.zone : ''} sur : ${c.service}.` : 'Nous accompagnons les entreprises dans leur croissance.',
  ]
  if (c.conditions) lines.push(c.conditions)
  lines.push(`Seriez-vous disponible pour un échange de 15 minutes avant le ${fr(c.end_date)} ?`, 'Si vous ne souhaitez pas être contacté, répondez STOP.')
  return lines.join('\n')
}

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
export function wrap(text: string, max: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w } else cur = (cur + ' ' + w).trim()
  }
  if (cur) lines.push(cur)
  return lines.slice(0, maxLines)
}
export function posterSvg(p: { headline: string; sub: string; cta: string; footer: string }, size = 1080): string {
  const h = wrap(p.headline, 18, 4), s2 = wrap(p.sub, 34, 3), c = wrap(p.cta, 30, 2)
  const t = (arr: string[], y: number, fs: number, fill: string, w: number) =>
    arr.map((l, i) => `<text x="${size / 2}" y="${y + i * fs * 1.25}" font-size="${fs}" font-weight="${w}" fill="${fill}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif">${esc(l)}</text>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="100%" height="100%" fill="#0F1923"/><rect x="40" y="40" width="${size - 80}" height="${size - 80}" fill="none" stroke="#C9A84C" stroke-width="3"/><text x="${size / 2}" y="140" font-size="34" font-weight="700" fill="#C9A84C" text-anchor="middle" font-family="Arial, Helvetica, sans-serif">DOUKE</text>${t(h, 330, 84, '#FFFFFF', 700)}${t(s2, 640, 40, '#C8D0DA', 400)}<rect x="180" y="800" width="${size - 360}" height="${c.length * 50 + 50}" rx="14" fill="#C9A84C"/>${t(c, 855, 36, '#0F1923', 700)}<text x="${size / 2}" y="${size - 70}" font-size="26" fill="#A8B4C0" text-anchor="middle" font-family="Arial, Helvetica, sans-serif">${esc(p.footer)}</text></svg>`
}
