import { validateCampaign, makeCode, dedupeKey, domainOf, cleanContact, underCap, isUuid } from '../lib/asta/ops/campaign'
import { extractJsonArray, filterCandidates } from '../lib/asta/ops/candidates'
import { proposePosts, draftMessage, posterSvg } from '../lib/asta/ops/content'

let fails = 0
const ok = (n: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}`); if (!c) fails++ }
const base = { name: 'Formation 20 octobre', type: 'prospection', service: 'Diagnostic', zone: 'Cotonou', target_count: 20, start_date: '2026-10-05', end_date: '2026-10-20' }

ok('campagne valide acceptée', validateCampaign(base).ok)
ok('zone obligatoire en prospection', !validateCampaign({ ...base, zone: '' }).ok)
ok('date impossible refusée', !validateCampaign({ ...base, end_date: '2026-02-30' }).ok)
ok('fin avant début refusée', !validateCampaign({ ...base, end_date: '2026-10-01' }).ok)
ok('objectif hors bornes refusé', !validateCampaign({ ...base, target_count: 0 }).ok && !validateCampaign({ ...base, target_count: 501 }).ok)
ok('durée > 180 jours refusée', !validateCampaign({ ...base, end_date: '2027-06-01' }).ok)
ok('type inconnu refusé', !validateCampaign({ ...base, type: 'spam' }).ok)
ok('publication sans service acceptée', validateCampaign({ ...base, type: 'publication', service: '', zone: '' }).ok)
const codes = new Set<string>(); for (let i = 0; i < 200; i++) codes.add(makeCode())
ok('code de campagne : 6 caractères, quasi unique', Array.from(codes).every((c) => /^[a-z0-9]{6}$/.test(c)) && codes.size > 190)
ok('déduplication insensible aux accents', dedupeKey('Société Âme', 'Cotonou') === dedupeKey('societe ame', 'cotonou'))
ok('domaine : https obligatoire, ni IP ni localhost', domainOf('https://www.exemple.bj/x') === 'exemple.bj' && !domainOf('http://exemple.bj') && !domainOf('https://127.0.0.1') && !domainOf('https://localhost/x'))
ok('contact : e-mail et téléphone valides seulement', cleanContact('Info@Exemple.BJ') === 'info@exemple.bj' && cleanContact('+229 01 23 45 67') === '+2290123456' + '7' && cleanContact('abc') === null && cleanContact('123') === null)
ok('plafond quotidien', underCap(9, 10) && !underCap(10, 10))
ok('uuid', isUuid('123e4567-e89b-12d3-a456-426614174000') && !isUuid('x'))

ok('JSON extrait malgré le bruit', extractJsonArray('Voici :\n```json\n[{"a":1}]\n```').length === 1 && extractJsonArray('rien').length === 0 && extractJsonArray('[oups').length === 0)
const raw = [
  { name: 'Alpha SARL', city: 'Cotonou', source_url: 'https://www.alpha.bj/contact', public_contact: 'contact@alpha.bj', fit: 80 },
  { name: 'Inventée SA', city: 'Cotonou', source_url: 'https://inventee.example/x', public_contact: '+22990000000' },
  { name: 'Beta', city: 'Porto-Novo', source_url: 'http://beta.bj', public_contact: null },
  { name: 'ALPHA sarl', city: 'cotonou', source_url: 'https://alpha.bj/a' },
  { name: 'Gamma', city: 'Cotonou', source_url: 'https://gamma.bj', public_contact: 'pas un contact', fit: 250 },
]
const r = filterCandidates(raw, ['alpha.bj', 'gamma.bj'], new Set(), 10)
ok('seules les sources confirmées par la recherche sont gardées', r.kept.length === 2 && r.dropped === 3)
ok('contact invalide annulé, adéquation bornée', r.kept[1].public_contact === null && r.kept[1].fit_score === 100)
ok('sans source confirmée : rien', filterCandidates(raw, [], new Set(), 10).kept.length === 0)
ok('limite respectée', filterCandidates(raw, ['alpha.bj', 'gamma.bj'], new Set(), 1).kept.length === 1)
ok('profil déjà refusé non reproposé', filterCandidates(raw, ['alpha.bj'], new Set([dedupeKey('Alpha SARL', 'Cotonou')]), 10).kept.length === 0)

const camp = { code: 'abc234', name: 'Formation 20 octobre', type: 'publication', service: 'Diagnostic', zone: 'Cotonou', conditions: null, start_date: '2026-10-05', end_date: '2026-10-20' }
const posts = proposePosts(camp, 'https://exemple.test')
ok('5 publications, clés uniques', posts.length === 5 && new Set(posts.map((p) => p.slot_key)).size === 5)
ok('lien traçable dans chaque texte', posts.every((p) => p.content.body.includes('https://exemple.test/diagnostic?c=abc234')))
const t = posts.map((p) => Date.parse(p.scheduled_at))
ok('publications dans la période, en ordre', t.every((x, i) => x >= Date.parse('2026-10-05T00:00:00Z') && x < Date.parse('2026-10-21T00:00:00Z') && (i === 0 || x >= t[i - 1])))
ok('période d\'un jour : 5 horaires distincts', new Set(proposePosts({ ...camp, end_date: '2026-10-05' }, 'https://exemple.test').map((p) => p.scheduled_at)).size === 5)
const msg = draftMessage({ ...camp, type: 'prospection' }, { name: 'Alpha SARL', sector: 'Commerce', city: 'Cotonou' })
ok('message : transparence IA, désinscription, nom', msg.includes('assistante numérique') && msg.includes('STOP') && msg.includes('Alpha SARL'))
ok('affiche : texte échappé', !posterSvg({ headline: '<script>x</script>', sub: 'a', cta: 'b', footer: 'c' }).includes('<script>'))
console.log(fails ? `\n${fails} test(s) en échec` : '\nTous les tests passent')
process.exit(fails ? 1 : 0)
