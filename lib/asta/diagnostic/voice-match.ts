export interface VOpt { value: string; label: string }
export type Match =
  | { kind: 'sure'; value: string; label: string }
  | { kind: 'maybe'; value: string | string[]; label: string }
  | { kind: 'none' }

const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'un', 'une', 'et', 'ou', 'a', 'au', 'aux', 'en', 'que', 'qu', 'est', 'c', 'je', 'j', 'ai', 'mon', 'ma', 'mes', 'ce', 'il', 'y', 'par', 'pour', 'on', 'nous', 'vous', 'sont', 'sur'])
const NUM: Record<string, string> = { zero: '0', deux: '2', trois: '3', quatre: '4', cinq: '5', six: '6', sept: '7', huit: '8', neuf: '9', dix: '10' }

export const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/['’]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()

export function tokens(s: string): string[] {
  const t = (' ' + norm(s) + ' ').replace(/ whats? ?app /g, ' whatsapp ').replace(/ face ?book /g, ' facebook ').replace(/ un a /g, ' 1 a ')
  return t.split(' ').filter(Boolean).map((w) => NUM[w] ?? w).filter((w) => !STOP.has(w))
}

export function joinList(a: string[], word: string): string {
  return a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' ' + word + ' ' + a[a.length - 1]
}

// Rapproche une phrase dite des options. Les mots partagés entre options pèsent moins (poids 1/n).
export function matchAnswer(transcript: string, options: VOpt[], multi: boolean): Match {
  const said = new Set(tokens(transcript))
  if (said.size === 0 || options.length === 0) return { kind: 'none' }
  const lt = options.map((o) => Array.from(new Set(tokens(o.label))))
  const count = new Map<string, number>()
  lt.forEach((ts) => ts.forEach((w) => count.set(w, (count.get(w) ?? 0) + 1)))
  const wt = (w: string) => 1 / (count.get(w) ?? 1)
  const scored = options.map((o, i) => {
    const tot = lt[i].reduce((s, w) => s + wt(w), 0)
    const hit = lt[i].filter((w) => said.has(w)).reduce((s, w) => s + wt(w), 0)
    return { o, s: tot > 0 ? hit / tot : 0 }
  })
  if (multi) {
    const picks = scored.filter((x) => x.s >= 0.99)
    if (picks.length === 0) return { kind: 'none' }
    return { kind: 'maybe', value: picks.map((x) => x.o.value), label: joinList(picks.map((x) => x.o.label), 'et') }
  }
  if (/ ou /.test(' ' + norm(transcript) + ' ')) return { kind: 'none' }
  const sorted = scored.slice().sort((x, y) => y.s - x.s)
  const best = sorted[0], second = sorted.length > 1 ? sorted[1].s : 0
  if (best.s < 0.5 || best.s - second < 0.3) return { kind: 'none' }
  return best.s >= 0.99 ? { kind: 'sure', value: best.o.value, label: best.o.label } : { kind: 'maybe', value: best.o.value, label: best.o.label }
}

export function parseYesNo(t: string): 'yes' | 'no' | null {
  const s = ' ' + norm(t) + ' '
  if (/ (non|pas|faux|incorrect|erreur|recommence) /.test(s)) return 'no'
  if (/ (oui|ouais|yes|ok|exact|exactement|correct|parfait|bien sur|c est ca|tout a fait|d accord) /.test(s)) return 'yes'
  return null
}

export function spokenOptions(opts: { label: string }[] = []): string {
  if (opts.length === 0) return ''
  return 'Les réponses possibles : ' + joinList(opts.map((o) => o.label), 'ou') + '.'
}

export function cleanSpeech(t: string): string {
  return t
    .replace(/[\uD83C-\uD83E][\uDC00-\uDFFF]|[\u2600-\u27BF\uFE0F]/g, '')
    .replace(/\(([^)]*)\)/g, ', $1,')
    .replace(/\s*\n+\s*/g, '. ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.?!])/g, '$1')
    .trim()
}
