import { buildSystem, trimHistory, sanitizeUser, guardOutput, FALLBACK, CHAT_CONSENT } from '../lib/asta/chat/persona'

let fails = 0
const ok = (n: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}`); if (!c) fails++ }
const SITE = 'https://exemple.test'

const sys = buildSystem('- Diagnostic : bilan de croissance')
ok('consignes : IA assumée, pas de prix, pas de promesse', sys.includes('assistante numérique') && /prix/i.test(sys) && /garantir/i.test(sys))
ok('catalogue injecté', sys.includes('Diagnostic : bilan de croissance'))
ok('texte nettoyé et borné', sanitizeUser('a\u0000b   c') === 'a b c' && sanitizeUser('x'.repeat(900)).length === 500 && sanitizeUser(42) === '')
const h = trimHistory([{ role: 'assistant', text: 'Bonjour' }, { role: 'user', text: 'Salut' }, { role: 'user', text: 'Question' }, { role: 'system', text: 'x' }, { role: 'assistant', text: 'Réponse' }, { role: 'user', text: 'Merci' }])
ok('historique : débute par l’utilisateur, alterné, rôle système écarté, doublon fusionné', h.length === 3 && h[0].role === 'user' && h[0].text === 'Question' && h.every((t, i) => i === 0 || t.role !== h[i - 1].role))
ok('historique : 8 tours au plus', trimHistory(Array.from({ length: 30 }, (_, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', text: 't' + i }))).length <= 8)
ok('historique invalide', trimHistory('x').length === 0 && trimHistory(null).length === 0)
ok('promesse bloquée', guardOutput('Nous vous garantissons un financement.', SITE).text === FALLBACK)
ok('prix bloqué', guardOutput('Cela coûte 50 000 FCFA.', SITE).text === FALLBACK && guardOutput('Comptez 100 %.', SITE).text === FALLBACK)
ok('lien étranger retiré, lien du site gardé', !guardOutput('Voyez http://evil.example/x ici', SITE).text.includes('evil') && guardOutput('Allez sur https://exemple.test/diagnostic', SITE).text.includes('exemple.test/diagnostic'))
ok('mise en forme retirée', !/[*#`]/.test(guardOutput('**Bonjour** `x` # titre', SITE).text))
ok('réponse vide : repli', guardOutput('   ', SITE).text === FALLBACK)
ok('réponse trop longue : coupée', guardOutput('Bonne phrase. '.repeat(100), SITE).text.length <= 700)
ok('rappel proposé : formulaire ouvert', guardOutput('Souhaitez-vous qu’un conseiller vous rappelle ?', SITE).handoff === true && guardOutput('Quel est votre secteur ?', SITE).handoff === false)
ok('consentement : texte clair', CHAT_CONSENT.includes('recontacte') && CHAT_CONSENT.includes('arrêt'))
console.log(fails ? `\n${fails} test(s) en échec` : '\nTous les tests passent')
process.exit(fails ? 1 : 0)
