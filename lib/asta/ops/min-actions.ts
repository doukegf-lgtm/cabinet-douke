export const MIN_ACTIONS = 3

/** Publications à ajouter pour que la campagne compte au moins `min` actions actives (hors annulées).
 *  Un créneau déjà utilisé, même annulé, n'est jamais réutilisé (contrainte unique campagne + créneau). */
export function postsToAdd<T extends { slot_key: string }>(
  existing: { slot_key: string; status: string }[],
  plannedKeys: string[],
  posts: T[],
  min = MIN_ACTIONS,
): { add: T[]; active: number } {
  const taken = new Set(existing.map((x) => x.slot_key))
  const planned = new Set(plannedKeys)
  let active = existing.filter((x) => x.status !== 'cancelled').length + Array.from(planned).filter((k) => !taken.has(k)).length
  const add: T[] = []
  for (const p of posts) {
    if (active >= min) break
    if (taken.has(p.slot_key) || planned.has(p.slot_key)) continue
    add.push(p); active++
  }
  return { add, active }
}
