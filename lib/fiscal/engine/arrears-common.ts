export class CalcBlockedError extends Error {
  blockers: string[]
  constructor(blockers: string[]) {
    super(blockers.join(' ; '))
    Object.setPrototypeOf(this, CalcBlockedError.prototype)
    this.name = 'CalcBlockedError'
    this.blockers = blockers
  }
}

export interface YMD {
  y: number
  m: number
  d: number
}

export function parseDateStrict(value: string, label: string): YMD {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '')
  if (!match) throw new CalcBlockedError([label + ' : date invalide (AAAA-MM-JJ).'])
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    throw new CalcBlockedError([label + ' : date inexistante.'])
  }
  return { y, m, d }
}

export function isoDate(value: YMD): string {
  return String(value.y).padStart(4, '0') + '-' +
    String(value.m).padStart(2, '0') + '-' +
    String(value.d).padStart(2, '0')
}

export function monthIndex(value: YMD): number {
  return value.y * 12 + value.m - 1
}

export function monthKey(index: number): string {
  const y = Math.floor(index / 12)
  const m = index - y * 12 + 1
  return String(y) + '-' + String(m).padStart(2, '0')
}

export function addMonths(value: YMD, count: number): YMD {
  const index = monthIndex(value) + count
  const y = Math.floor(index / 12)
  const m = index - y * 12 + 1
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { y, m, d: Math.min(value.d, lastDay) }
}
