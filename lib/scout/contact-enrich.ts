import { scoutIa, extractJson, normaliserTel } from '@/lib/scout/ia-client'

export interface ContactTrouve { telephone: string; email: string; site: string; source: string }

const TEL_SYSTEM = `Tu es un assistant de recherche de coordonnées professionnelles en Afrique de l'Ouest. Utilise la recherche web. Cherche le téléphone PROFESSIONNEL de la structure (standard, accueil, direction, service commercial) publié dans des sources publiques : site officiel, page Facebook ou LinkedIn de l'organisation, annuaires professionnels, registre du commerce, presse, documents officiels. N'accepte un numéro que s'il apparaît explicitement dans une source consultée. N'invente rien et ne déduis jamais un numéro. Ne renvoie jamais le numéro personnel d'un particulier. Réponds UNIQUEMENT avec un objet JSON, sans markdown : {"telephone":"","telephone_secondaire":"","email":"","site":"","source":""}. "source" contient l'URL ou le nom de la page où le numéro figure. Chaîne vide si introuvable.`

/** Recherche ciblée des coordonnées publiques d'une structure. Retourne null si rien de fiable (numéro valide ET source consultée). */
export async function enrichirContact(nom: string, structure: string, zone: string): Promise<ContactTrouve | null> {
  const cible = (structure || nom || '').trim()
  if (!cible) return null
  const z = (zone || 'Bénin').trim()
  const contact = structure && nom ? `, contact éventuel : ${nom}` : ''
  const r = await scoutIa({
    grounded: true,
    system: TEL_SYSTEM,
    prompt: `Trouve les coordonnées professionnelles publiques de « ${cible} » (zone : ${z})${contact}. Pistes : site officiel, page Facebook ou LinkedIn de l'organisation, annuaires professionnels (annuaire des entreprises, pages jaunes), registre du commerce, presse.`,
  })
  let o: Record<string, unknown>
  try { o = JSON.parse(extractJson(r.text)) } catch { return null }
  const s = (k: string) => (typeof o[k] === 'string' ? (o[k] as string).trim() : '')
  const tel = normaliserTel(s('telephone'), z) || normaliserTel(s('telephone_secondaire'), z)
  if (!tel || r.sources.length === 0) return null
  const source = s('source') || r.sources.slice(0, 2).map(x => x.title || x.uri).join(' ; ')
  const mail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s('email')) ? s('email') : ''
  return { telephone: tel, email: mail, site: s('site'), source }
}

type Ligne = { nom: string; structure: string; zone: string; telephone: string; email: string; source: string }

/** Complète en place les lignes sans téléphone (concurrence limitée). Retourne le nombre de numéros trouvés. Les erreurs sont ignorées. */
export async function enrichirLot(rows: Ligne[], conc = 3): Promise<number> {
  const todo = rows.filter(r => !r.telephone && (r.structure || r.nom))
  let i = 0, trouves = 0, stop = false
  async function worker() {
    while (!stop) {
      const r = todo[i++]
      if (!r) return
      try {
        const c = await enrichirContact(r.nom, r.structure, r.zone)
        if (c) {
          r.telephone = c.telephone
          if (!r.email) r.email = c.email
          r.source = [r.source, 'Contact web : ' + c.source].filter(Boolean).join(' | ')
          trouves++
        }
      } catch (e) {
        if (e instanceof Error && /limite/i.test(e.message)) stop = true
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(conc, todo.length) }, worker))
  return trouves
}
