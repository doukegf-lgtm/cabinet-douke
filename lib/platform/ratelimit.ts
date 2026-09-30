// Limiteur en mémoire (best effort : chaque instance serverless a le sien).
const buckets = new Map<string, { n: number; reset: number }>()

export function hit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || b.reset < now) { buckets.set(key, { n: 1, reset: now + windowMs }); return true }
  b.n += 1
  return b.n <= max
}
export function clear(key: string) { buckets.delete(key) }
