import raw from './definitions/v1.json'

export interface Option { value: string; label: string; points?: number }
export interface Question {
  key: string; block: string; type: 'single' | 'multi' | 'text'; prompt: string
  options?: Option[]; dimension?: string; count_points?: number[]; ack?: string; optional?: boolean; afterResult?: boolean
}
export interface Definition {
  version: string; consent_text: string; wish_ack: string
  bands: { min: number; label: string }[]; modes: Record<string, string>
  dimensions: Record<string, { label: string; reco: string }>; questions: Question[]
}
export type Answers = Record<string, unknown>
export const DEF = raw as unknown as Definition

export function nextQuestion(done: Set<string>): Question | null {
  return DEF.questions.find((q) => !q.afterResult && !done.has(q.key)) ?? null
}
export function publicQuestion(q: Question) {
  return { key: q.key, block: q.block, type: q.type, prompt: q.prompt, optional: !!q.optional,
    options: (q.options ?? []).map(({ value, label }) => ({ value, label })) }
}
export function ackFor(q: Question): string { return q.ack ?? 'Noté.' }

export function validate(q: Question, v: unknown): { ok: true; value: string | string[] } | { ok: false } {
  if (q.type === 'text') {
    if (typeof v !== 'string') return { ok: false }
    const t = v.trim().slice(0, 500)
    return t || q.optional ? { ok: true, value: t } : { ok: false }
  }
  const allowed = new Set((q.options ?? []).map((o) => o.value))
  if (q.type === 'single') return typeof v === 'string' && allowed.has(v) ? { ok: true, value: v } : { ok: false }
  if (!Array.isArray(v) || v.length < 1 || v.length > allowed.size) return { ok: false }
  if (!v.every((x) => typeof x === 'string' && allowed.has(x)) || new Set(v).size !== v.length) return { ok: false }
  return { ok: true, value: v as string[] }
}

export function score(a: Answers) {
  const scores: Record<string, number> = Object.fromEntries(Object.keys(DEF.dimensions).map((k) => [k, 0]))
  for (const q of DEF.questions) {
    if (!q.dimension) continue
    const v = a[q.key]
    if (v == null) continue
    let pts = 0
    if (q.type === 'multi' && Array.isArray(v) && q.count_points) pts = q.count_points[Math.min(v.length, q.count_points.length - 1)]
    else pts = q.options?.find((o) => o.value === v)?.points ?? 0
    scores[q.dimension] += pts
  }
  const total = Object.values(scores).reduce((s, x) => s + x, 0)
  const band = (DEF.bands.find((b) => total >= b.min) ?? DEF.bands[DEF.bands.length - 1]).label
  return { scores, total, band }
}

// Règles déterministes, ajustables. À réviser avec les données réelles.
export function detectMode(a: Answers): string {
  const autres = Object.values(a).filter((v) => v === 'autre' || (Array.isArray(v) && v.includes('autre'))).length
  if (autres >= 2) return 'sceptique'
  if (a.q2 === 'plus_un_an' && (a.q3 === 'difficultes_paiement' || a.q3 === 'perte_clients')) return 'pret_a_agir'
  if (a.q1 === 'tresorerie' || a.q1 === 'gestion_financiere') return 'inquiet'
  if (a.q1 === 'organisation' || a.q1 === 'equipe') return 'deborde'
  if (a.q1 === 'clients') return 'ambitieux'
  return 'sceptique'
}

export function restitution(r: ReturnType<typeof score>, mode: string) {
  const order = Object.keys(DEF.dimensions)
  const weakest = [...order].sort((x, y) => r.scores[x] - r.scores[y] || order.indexOf(x) - order.indexOf(y)).slice(0, 2)
  return {
    text: `${DEF.modes[mode] ?? ''}\n\nMerci. J'ai terminé votre diagnostic. Voici votre Score DOUKE : ${r.total}/100 (${r.band}).`,
    recos: weakest.map((k) => `${DEF.dimensions[k].label} : ${DEF.dimensions[k].reco}`),
    dimensions: Object.fromEntries(order.map((k) => [k, { label: DEF.dimensions[k].label, max: 20 }])),
  }
}
