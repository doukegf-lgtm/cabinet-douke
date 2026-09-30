export interface SessionRow { started_at: string; completed_at: string | null }
export interface EventRow { type: string; created_at: string }
export interface Kpis {
  day: string; started: number; completed: number
  completion_rate: number | null; median_seconds: number | null
  leads: number; lead_rate: number | null
}

// Jour = journée UTC (00:00 à 24:00 UTC). Le Bénin est en UTC+1.
export function dayBounds(day: string) {
  const start = Date.parse(`${day}T00:00:00.000Z`)
  const end = start + 24 * 3600 * 1000
  return { start, end, startIso: new Date(start).toISOString(), endIso: new Date(end).toISOString() }
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null)

export function computeKpis(day: string, sessions: SessionRow[], events: EventRow[]): Kpis {
  const { start, end } = dayBounds(day)
  const inDay = (iso: string) => { const t = Date.parse(iso); return t >= start && t < end }
  const s = sessions.filter((x) => inDay(x.started_at))
  const done = s.filter((x) => x.completed_at)
  const d = done.map((x) => (Date.parse(x.completed_at as string) - Date.parse(x.started_at)) / 1000).sort((a, b) => a - b)
  const mid = Math.floor(d.length / 2)
  const median = d.length === 0 ? null : d.length % 2 ? d[mid] : (d[mid - 1] + d[mid]) / 2
  const leads = events.filter((e) => e.type === 'lead_captured' && inDay(e.created_at)).length
  return {
    day, started: s.length, completed: done.length,
    completion_rate: pct(done.length, s.length), median_seconds: median,
    leads, lead_rate: pct(leads, done.length),
  }
}
