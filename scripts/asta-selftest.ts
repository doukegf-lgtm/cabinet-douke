import { DEF, nextQuestion, validate, score, detectMode, restitution, type Answers, type Question } from '../lib/asta/diagnostic/engine'

let fails = 0
const ok = (name: string, cond: boolean) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) fails++ }
const pick = (q: Question, best: boolean): string | string[] => {
  const o = q.options ?? []
  if (q.type === 'multi') return o.slice(0, best ? (q.count_points?.length ?? 2) - 1 : 1).map((x) => x.value)
  const sorted = [...o].sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
  return (best ? sorted[0] : sorted[sorted.length - 1]).value
}
const build = (best: boolean): Answers => Object.fromEntries(DEF.questions.filter((q) => !q.afterResult).map((q) => [q.key, pick(q, best)]))

const sums: Record<string, number> = {}
for (const q of DEF.questions) if (q.dimension) sums[q.dimension] = (sums[q.dimension] ?? 0) + (q.type === 'multi' ? Math.max(...(q.count_points ?? [0])) : Math.max(...(q.options ?? []).map((o) => o.points ?? 0)))
ok('chaque dimension vaut 20 points', Object.keys(DEF.dimensions).every((k) => sums[k] === 20))
ok('meilleures réponses = 100', score(build(true)).total === 100)
ok('pires réponses = 9', score(build(false)).total === 9)
ok('multi plafonné', score({ ...build(true), q7: ['facebook', 'whatsapp', 'recommandation', 'terrain', 'autre'] }).scores.visibilite === 20)
ok('ordre des questions', nextQuestion(new Set(['q1', 'q2']))?.key === 'q3' && nextQuestion(new Set(DEF.questions.filter((q) => !q.afterResult).map((q) => q.key))) === null)
const q1 = DEF.questions[0], q7 = DEF.questions.find((q) => q.key === 'q7')!
ok('rejette une valeur hors liste', !validate(q1, 'nimporte').ok && !validate(q1, ['tresorerie']).ok)
ok('rejette un multi vide ou en double', !validate(q7, []).ok && !validate(q7, ['facebook', 'facebook']).ok)
ok('accepte un multi valide', validate(q7, ['facebook', 'terrain']).ok)
ok('mode inquiet', detectMode({ q1: 'tresorerie', q2: 'mois', q3: 'stress' }) === 'inquiet')
ok('mode débordé', detectMode({ q1: 'organisation', q2: 'mois', q3: 'stress' }) === 'deborde')
ok('mode prêt à agir', detectMode({ q1: 'clients', q2: 'plus_un_an', q3: 'perte_clients' }) === 'pret_a_agir')
ok('mode sceptique', detectMode({ q1: 'autre', q2: 'mois', q3: 'autre' }) === 'sceptique')
const r = score({ ...build(true), q4: 'non', q5: 'jamais' })
ok('deux recommandations sur les dimensions les plus faibles', restitution(r, 'inquiet').recos.length === 2)
console.log(fails ? `\n${fails} test(s) en échec` : '\nTous les tests passent')
process.exit(fails ? 1 : 0)
