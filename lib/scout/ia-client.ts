export interface ScoutSource { uri: string; title: string }
export interface ScoutIaResult { text: string; sources: ScoutSource[] }

/** Extrait le premier JSON (objet ou tableau) d'une réponse IA, même entourée de texte ou de balises markdown. */
export function extractJson(text: string): string {
  const t = String(text || '').replace(/```json|```/g, '').trim()
  const start = t.search(/[\[{]/)
  if (start < 0) return t
  const close = t[start] === '[' ? ']' : '}'
  const end = t.lastIndexOf(close)
  return end > start ? t.slice(start, end + 1) : t
}

/** Appelle /api/scout/ia. grounded=true active la recherche Google (réponse + sources). */
export async function scoutIa(opts: { system: string; prompt: string; grounded?: boolean }): Promise<ScoutIaResult> {
  const res = await fetch('/api/scout/ia', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || 'Erreur IA')
  return { text: data.text || '', sources: Array.isArray(data.sources) ? data.sources : [] }
}
