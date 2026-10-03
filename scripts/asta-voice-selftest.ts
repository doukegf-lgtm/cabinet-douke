import { DEF } from '../lib/asta/diagnostic/engine'
import { matchAnswer, parseYesNo, spokenOptions, cleanSpeech, tokens } from '../lib/asta/diagnostic/voice-match'

let fails = 0
const ok = (n: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}`); if (!c) fails++ }
const Q = (k: string) => DEF.questions.find((q) => q.key === k)!
const opts = (k: string) => (Q(k).options ?? []).map((o) => ({ value: o.value, label: o.label }))

// Chaque libellé dit tel quel, pour chaque question à choix unique, doit être reconnu sans ambiguïté.
for (const q of DEF.questions) {
  if (q.type !== 'single' || !q.options) continue
  const o = opts(q.key)
  const bad = o.filter((x) => { const m = matchAnswer(x.label, o, false); return !(m.kind === 'sure' && m.value === x.value) })
  if (bad.length) console.log('   non reconnus :', bad.map((b) => b.label).join(' | '))
  ok(`${q.key} : chaque libellé dit tel quel est reconnu`, bad.length === 0)
}
const m1 = matchAnswer('chaque semaine', opts('q5'), false)
ok('q5 : « chaque semaine »', m1.kind === 'sure' && m1.value === 'semaine')
const m2 = matchAnswer('semaines', opts('q2'), false)
ok('q2 : réponse partielle → confirmation', m2.kind === 'maybe' && m2.value === 'semaines')
ok('q2 : mot partagé seul → rien', matchAnswer('quelques', opts('q2'), false).kind === 'none')
ok('q4 : « oui » → confirmation', (() => { const m = matchAnswer('oui', opts('q4'), false); return m.kind === 'maybe' && m.value === 'precisement' })())
ok('q6 : « oui ou non » → rien (hésitation)', matchAnswer('oui ou non', opts('q6'), false).kind === 'none')
ok('phrase sans rapport → rien', matchAnswer('blablabla euh', opts('q1'), false).kind === 'none' && matchAnswer('', opts('q1'), false).kind === 'none')
ok('q12 : nombres dits en lettres', (() => { const a = matchAnswer('un à trois ans', opts('q12'), false), b = matchAnswer('plus de cinq ans', opts('q12'), false), c = matchAnswer('trois à cinq ans', opts('q12'), false); return a.kind === 'sure' && a.value === '1_3' && b.kind === 'sure' && b.value === 'plus_5' && c.kind === 'sure' && c.value === '3_5' })())
ok('q12 : « moins d’un an »', (() => { const m = matchAnswer('moins d’un an', opts('q12'), false); return m.kind === 'sure' && m.value === 'moins_1' })())
const mm = matchAnswer('facebook et whats app', opts('q7'), true)
ok('q7 : réponses multiples reconnues, toujours à confirmer', mm.kind === 'maybe' && JSON.stringify(mm.value) === JSON.stringify(['facebook', 'whatsapp']))
ok('q7 : une seule réponse', (() => { const m = matchAnswer('recommandation', opts('q7'), true); return m.kind === 'maybe' && JSON.stringify(m.value) === JSON.stringify(['recommandation']) })())
ok('q7 : rien reconnu', matchAnswer('rien du tout', opts('q7'), true).kind === 'none')
ok('oui / non', parseYesNo('oui') === 'yes' && parseYesNo('oui c’est ça') === 'yes' && parseYesNo('ok d’accord') === 'yes' && parseYesNo('non') === 'no' && parseYesNo('non pas du tout') === 'no' && parseYesNo('euh') === null)
ok('mots vides retirés', JSON.stringify(tokens('Moins d’un an')) === JSON.stringify(['moins', 'an']))
ok('options lues à voix haute', spokenOptions([{ label: 'A' }, { label: 'B' }, { label: 'C' }]) === 'Les réponses possibles : A, B ou C.' && spokenOptions([]) === '')
ok('texte nettoyé pour la voix', cleanSpeech('Bonjour 👋\n\nJe suis ASTA') === 'Bonjour. Je suis ASTA' && !cleanSpeech('Plusieurs (au choix)').includes('('))
console.log(fails ? `\n${fails} test(s) en échec` : '\nTous les tests passent')
process.exit(fails ? 1 : 0)
