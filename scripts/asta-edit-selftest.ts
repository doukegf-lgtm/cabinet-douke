import { validateEdit, MAX_IMAGE } from '../lib/asta/ops/edit'

let fails = 0
const ok = (n: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}`); if (!c) fails++ }
const L = 'https://x.test/diagnostic?c=abc234'
const pub = { headline: 'Titre', sub: 'Sous', cta: 'Bouton', link: L, body: `Texte\n\n${L}` }
const PNG = 'data:image/png;base64,iVBORw0KGgo='

const r1 = validateEdit('publication', 'post2', pub, { headline: 'Nouveau' })
ok('titre modifié et titre de l’action mis à jour', r1.ok && r1.content.headline === 'Nouveau' && r1.title === 'Publication 2 : Nouveau')
ok('l’objet d’origine n’est pas modifié', pub.headline === 'Titre')
ok('aucune modification refusée', !validateEdit('publication', 'post1', pub, { headline: 'Titre' }).ok)
ok('champ vide refusé', !validateEdit('publication', 'post1', pub, { headline: '   ' }).ok)
ok('valeur non textuelle refusée', !validateEdit('publication', 'post1', pub, { headline: 42 }).ok)
const rb = validateEdit('publication', 'post1', pub, { body: 'Sans lien' })
ok('texte sans lien de suivi refusé', !rb.ok && rb.error.includes(L))
ok('texte avec lien de suivi accepté', validateEdit('publication', 'post1', pub, { body: `Nouveau texte ${L}` }).ok)
const rc = validateEdit('publication', 'post1', pub, { headline: 'A\u0000B' })
ok('caractères de contrôle retirés', rc.ok && rc.content.headline === 'AB')
const rl = validateEdit('publication', 'post1', pub, { headline: 'x'.repeat(500) })
ok('longueur bornée', rl.ok && String(rl.content.headline).length === 120)
const ri = validateEdit('publication', 'post1', pub, { image: PNG })
ok('visuel valide accepté', ri.ok && ri.content.image === PNG)
ok('visuel HTML refusé', !validateEdit('publication', 'post1', pub, { image: 'data:text/html;base64,AAAA' }).ok)
ok('visuel SVG refusé', !validateEdit('publication', 'post1', pub, { image: 'data:image/svg+xml;base64,AAAA' }).ok)
ok('visuel trop lourd refusé', !validateEdit('publication', 'post1', pub, { image: 'data:image/png;base64,' + 'A'.repeat(MAX_IMAGE) }).ok)
ok('visuel non textuel refusé', !validateEdit('publication', 'post1', pub, { image: 123 }).ok)
const withImg = { ...pub, image: PNG }
const rr = validateEdit('publication', 'post1', withImg, { remove_image: true })
ok('retour à l’affiche d’ASTA', rr.ok && rr.content.image === undefined)
ok('retrait sans visuel : aucune modification', !validateEdit('publication', 'post1', pub, { remove_image: true }).ok)
const msg = { draft: 'Bonjour', contact: 'a@b.bj' }
const rm = validateEdit('message', 'msg:1', msg, { draft: 'Bonsoir' })
ok('message modifié, contact conservé', rm.ok && rm.content.draft === 'Bonsoir' && rm.content.contact === 'a@b.bj' && rm.title === null)
ok('visuel refusé sur un message', !validateEdit('message', 'msg:1', msg, { image: PNG }).ok)
ok('champs inconnus ignorés', !validateEdit('message', 'msg:1', msg, { status: 'done', contact: 'x@y.z' }).ok)
console.log(fails ? `\n${fails} test(s) en échec` : '\nTous les tests passent')
process.exit(fails ? 1 : 0)
