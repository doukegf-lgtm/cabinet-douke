import { computeKpis, dayBounds } from '../lib/asta/journal/kpi'

let fails = 0
const ok = (n: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}`); if (!c) fails++ }
const D = '2026-09-28'
const sessions = [
  { started_at: '2026-09-28T10:00:00Z', completed_at: '2026-09-28T10:03:00Z' },
  { started_at: '2026-09-28T11:00:00Z', completed_at: '2026-09-28T11:05:00Z' },
  { started_at: '2026-09-28T12:00:00Z', completed_at: null },
  { started_at: '2026-09-27T23:59:59Z', completed_at: '2026-09-28T00:02:00Z' },
]
const events = [
  { type: 'lead_captured', created_at: '2026-09-28T10:10:00Z' },
  { type: 'lead_captured', created_at: '2026-09-29T00:00:00Z' },
  { type: 'question_answered', created_at: '2026-09-28T10:01:00Z' },
]
const k = computeKpis(D, sessions, events)
ok('3 sessions démarrées ce jour (la veille exclue)', k.started === 3)
ok('2 terminées', k.completed === 2)
ok('taux de complétion 67 %', k.completion_rate === 67)
ok('durée médiane 240 s', k.median_seconds === 240)
ok('1 lead ce jour (borne haute exclue)', k.leads === 1)
ok('taux de lead 50 % des diagnostics terminés', k.lead_rate === 50)
const e = computeKpis(D, [], [])
ok('jour vide : taux et médiane nuls', e.completion_rate === null && e.median_seconds === null && e.lead_rate === null)
ok('bornes sur 24 h', dayBounds(D).end - dayBounds(D).start === 86400000)
console.log(fails ? `\n${fails} test(s) en échec` : '\nTous les tests passent')
process.exit(fails ? 1 : 0)
