export interface GenOptions {
  system: string
  contents: { role: 'user' | 'model'; text: string }[]
  search?: boolean
  maxTokens?: number
  temperature?: number
  timeoutMs?: number
}
export interface GenResult { text: string; sources: string[] }
const MODEL = process.env.ASTA_AI_MODEL || 'gemini-2.5-flash'

// Fournisseur isolé ici : changer de modèle ou de fournisseur ne touche que ce fichier.
export async function generate(o: GenOptions): Promise<GenResult> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY non configurée')
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: o.system }] },
    contents: o.contents.map((c) => ({ role: c.role, parts: [{ text: c.text }] })),
    generationConfig: { maxOutputTokens: o.maxTokens ?? 800, temperature: o.temperature ?? 0.4, thinkingConfig: { thinkingBudget: 0 } },
  }
  if (o.search) body.tools = [{ google_search: {} }]
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), o.timeoutMs ?? 45000)
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body), signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`AI HTTP ${res.status}`)
    const data = await res.json()
    const cand = data?.candidates?.[0]
    const text = ((cand?.content?.parts ?? []) as { text?: string }[]).map((p) => p.text ?? '').join('').trim()
    const sources = ((cand?.groundingMetadata?.groundingChunks ?? []) as { web?: { title?: string } }[]).map((c) => c.web?.title ?? '').filter(Boolean)
    return { text, sources }
  } finally { clearTimeout(timer) }
}
