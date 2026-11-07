#!/usr/bin/env bash
# Contrôle du module fiscal-social — LECTURE SEULE (aucune modification, aucun push, aucune migration).
# Usage : bash scripts/verify-fiscal.sh [--build]
set -u
cd "$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "Pas un dépôt git."; exit 2; }
BUILD=0; [ "${1:-}" = "--build" ] && BUILD=1
TMPD=".verify-tmp"; mkdir -p "$TMPD"
grep -qx "$TMPD/" .git/info/exclude 2>/dev/null || echo "$TMPD/" >> .git/info/exclude
# détection de Python (python3 / python / py) : sinon le contrôle de couverture serait faussement « OK »
PY=""; for c in python3 python py; do if command -v "$c" >/dev/null 2>&1 && "$c" -c "import sys" >/dev/null 2>&1; then PY="$c"; break; fi; done
PASS=0; FAIL=0; WARN=0
ok()  { echo "  [OK]      $*"; PASS=$((PASS+1)); }
ko()  { echo "  [ECHEC]   $*"; FAIL=$((FAIL+1)); }
wa()  { echo "  [A VOIR]  $*"; WARN=$((WARN+1)); }
sec() { echo; echo "=== $* ==="; }

sec "1. GIT : où en est réellement le code"
BR=$(git branch --show-current); echo "  branche courante : ${BR:-<détachée>}   HEAD : $(git rev-parse --short HEAD)"
git fetch origin --quiet 2>/dev/null && ok "git fetch (lecture seule)" || wa "git fetch impossible (hors ligne ?)"
echo "  --- 8 derniers commits (toutes branches) ---"; git log --all --oneline --decorate -8 | sed 's/^/  /'
for sha in 6f3ae45 9283ef5 e35bb41 f333a74 cbdce38 8c23b6f; do
  if git cat-file -e "$sha^{commit}" 2>/dev/null; then
    on=$(git branch -a --contains "$sha" 2>/dev/null | sed 's/^[* ]*//' | tr '\n' ' ')
    ok "commit $sha présent — branches : ${on:-aucune}"
  else wa "commit $sha ABSENT de ce dépôt local"; fi
done
if git rev-parse --verify -q origin/main >/dev/null; then
  for sha in cbdce38 f333a74 9283ef5; do
    git merge-base --is-ancestor "$sha" origin/main 2>/dev/null && ok "$sha est dans origin/main" || wa "$sha n'est PAS dans origin/main"
  done
fi
UP=$(git rev-parse --abbrev-ref '@{u}' 2>/dev/null) && { N=$(git rev-list --count "$UP"..HEAD); [ "$N" -eq 0 ] && ok "rien à pousser vers $UP" || wa "$N commit(s) local(aux) non poussé(s) vers $UP"; } || wa "aucune branche amont configurée"
TRACKED_MOD=$(git status --short | grep -c '^ M\|^M ' || true); UNTR=$(git status --short | grep -c '^??' || true)
echo "  fichiers suivis modifiés : $TRACKED_MOD   non suivis : $UNTR"
SUS=$(git status --short | grep -E '^\?\?.*(\.bak|\.zip|\.orig|\.env)' || true)
if [ -n "$SUS" ]; then echo "$SUS" | sed 's/^/  fichier suspect : /'; wa "fichiers temporaires/sensibles non suivis ci-dessus (ne pas les ajouter à git)"; else ok "aucun .bak/.zip/.env parmi les non suivis"; fi

sec "1b. DIVERGENCE DES BRANCHES ET TRAVAIL NON PROTÉGÉ"
for b in main wip/fiscal-engine; do
  git rev-parse --verify -q "$b" >/dev/null || continue
  if git rev-parse --verify -q "origin/$b" >/dev/null; then
    A=$(git rev-list --count "origin/$b..$b"); B=$(git rev-list --count "$b..origin/$b")
    echo "  $b : $A commit(s) NON poussé(s), $B à récupérer"
    [ "$A" -gt 0 ] && wa "$b : $A commit(s) existent seulement sur cette machine (risque de perte)"
  else wa "$b : aucune branche distante correspondante"; fi
done
if git rev-parse --verify -q main >/dev/null && git rev-parse --verify -q wip/fiscal-engine >/dev/null; then
  OM=$(git rev-list --count wip/fiscal-engine..main); OW=$(git rev-list --count main..wip/fiscal-engine)
  echo "  main vs wip/fiscal-engine : $OM seulement sur main, $OW seulement sur wip"
  if [ "$OM" -gt 0 ] && [ "$OW" -gt 0 ]; then wa "branches DIVERGENTES : le travail de chacune est absent de l'autre ; préparer une fusion (répéter la fusion sur une branche temporaire)"; else ok "branches alignées (l'une contient l'autre)"; fi
fi
NS=$(git stash list | wc -l | tr -d ' '); [ "$NS" -gt 0 ] && wa "$NS stash(s) existant(s) : contenu non versionné, ne pas supprimer sans l'avoir examiné" || ok "aucun stash"

sec "2. MIGRATIONS : état et cohérence (n'indique PAS ce qui est appliqué en base)"
ls supabase/migrations 2>/dev/null | grep -E '^00(0[5-9]|[1-9][0-9])' | while read -r f; do
  if git ls-files --error-unmatch "supabase/migrations/$f" >/dev/null 2>&1; then echo "  suivi      $f"; else echo "  NON SUIVI  $f"; fi; done
DUP=$(ls supabase/migrations | sed -E 's/^([0-9]+)_.*/\1/' | sort | uniq -d | tr '\n' ' ')
[ -z "$DUP" ] && ok "aucun numéro de migration en double" || ko "numéros de migration en double : $DUP"
for f in supabase/migrations/001[2-9]_*.sql supabase/migrations/002*_*.sql; do [ -f "$f" ] || continue
  tail -5 "$f" | grep -qi 'commit;' && ok "$(basename "$f") se termine par commit;" || ko "$(basename "$f") ne se termine pas par commit;"; done
wa "L'application des migrations en base ne peut PAS être vérifiée ici : contrôler dans Supabase (supabase_migrations.schema_migrations) avant tout déploiement."

sec "3. COHÉRENCE ROUTES <-> FONCTIONS SQL"
RPCS=$(find app lib -type f \( -name '*.ts' -o -name '*.tsx' \) -print0 2>/dev/null | xargs -0 cat | tr '\n' ' ' | grep -oE "rpc\( *'[a-z_]+'" | sed -E "s/rpc\( *'//;s/'//" | sort -u)
for r in $RPCS; do
  if grep -rqE "function public\.$r\b" supabase/migrations; then
    grep -rqE "grant execute on function public\.$r\b" supabase/migrations && ok "RPC $r : définie + accordée à service_role" || wa "RPC $r : définie mais aucun GRANT trouvé"
  else ko "RPC $r appelée par le code mais DÉFINIE NULLE PART dans les migrations"; fi
done

sec "4. SÉCURITÉ ET SÉPARATION"
HITS=$(grep -rlE "SERVICE_ROLE|getServiceClient" app components lib --include=*.ts --include=*.tsx 2>/dev/null | grep -vE '/api/|supabaseClient\.ts|lib/platform/|lib/eden-auth\.ts|lib/fiscal/calc-route\.ts')
[ -z "$HITS" ] && ok "aucune clé service_role hors routes serveur" || { echo "$HITS" | sed 's/^/  /'; wa "fichiers ci-dessus : vérifier qu'ils ne sont pas importés côté navigateur"; }
CL=$(grep -rl "use client" app components lib --include=*.ts --include=*.tsx 2>/dev/null | xargs -r grep -lE "SERVICE_ROLE|getServiceClient|supabase-server" 2>/dev/null)
[ -z "$CL" ] && ok "aucun composant 'use client' n'importe de code serveur/service_role" || ko "composant client important du code serveur : $CL"
EA=$(grep -rniE "from\(['\"](eden|asta)_" app/fiscal-social app/api/fiscal lib/fiscal components/fiscal-social 2>/dev/null)
[ -z "$EA" ] && ok "le module fiscal n'accède à aucune table eden_/asta_" || { echo "$EA"; ko "accès à des tables EDEN/ASTA depuis le module fiscal"; }
for f in $(find app/api/fiscal -name route.ts 2>/dev/null); do
  grep -qE "requireAdmin|handleCalculationPost|annualRpc|readAnnualBody|requireRole|getUser" "$f" || ko "route sans contrôle d'accès apparent : $f"; done
FL=$(grep -rnE "parseFloat|Number\(|\* *[0-9]+\.[0-9]+" lib/fiscal/engine app/api/fiscal --include=*.ts 2>/dev/null | grep -v "tests/")
[ -z "$FL" ] && ok "aucune virgule flottante détectée dans les moteurs" || { echo "$FL" | sed 's/^/  /'; wa "occurrences ci-dessus : doivent être des comparaisons/entiers, jamais des montants"; }
for t in $(grep -hoE "create table (if not exists )?public\.fiscal_[a-z_]+" supabase/migrations/*.sql | awk '{print $NF}' | sort -u); do
  grep -qiE "alter table $t enable row level security" supabase/migrations/*.sql && ok "RLS active : $t" || ko "RLS ABSENTE : $t"; done

sec "4b. COUVERTURE DE TESTS DES MOTEURS (un moteur sans test n'est pas vérifié)"
UNT=$([ -n "$PY" ] && "$PY" - <<'PY'
import re,os,glob
files=[f for f in glob.glob('lib/fiscal/**/*.ts',recursive=True)]
keys={os.path.relpath(f,'lib/fiscal')[:-3].replace(os.sep,'/'):f for f in files}
tests=glob.glob('tests/**/*.ts',recursive=True)+glob.glob('tests/**/*.cjs',recursive=True)
cov=set()
for t in tests:
    s=open(t,encoding='utf-8').read()
    for m in re.finditer(r"lib/fiscal/([A-Za-z0-9_/\-]+)['\"]",s): cov.add(m.group(1))
    for m in re.finditer(r"fiscal-test-build/([A-Za-z0-9_\-]+)\.js",s): cov.add('engine/'+m.group(1))
    for m in re.finditer(r"from ['\"](\.\.?/[A-Za-z0-9_/\-]+)['\"]",s):
        r=os.path.normpath(os.path.join(os.path.dirname(t),m.group(1))).replace(os.sep,'/')
        if r.startswith('lib/fiscal/'): cov.add(r[len('lib/fiscal/'):])
ch=True
while ch:
    ch=False
    for k in list(cov):
        f=keys.get(k)
        if not f: continue
        for m in re.finditer(r"from ['\"](\.\.?/[A-Za-z0-9_/\-]+)['\"]",open(f,encoding='utf-8').read()):
            r=os.path.normpath(os.path.join(os.path.dirname(f),m.group(1))).replace(os.sep,'/')
            if r.startswith('lib/fiscal/'):
                r=r[len('lib/fiscal/'):]
                if r in keys and r not in cov: cov.add(r); ch=True
def needs_next(k):
    try: return "'next/server'" in open(keys[k],encoding='utf-8').read() or "from 'next/" in open(keys[k],encoding='utf-8').read()
    except Exception: return False
print(' '.join(sorted(k for k in keys if k not in cov and not k.endswith('config') and not needs_next(k))))
PY
)
if [ -z "$PY" ]; then wa "Python introuvable : contrôle de couverture NON exécuté (installer Python ou lancer dans un environnement qui en dispose)"; elif [ -z "$UNT" ]; then ok "tous les modules lib/fiscal sont atteints par au moins un test"; else for u in $UNT; do ko "module SANS AUCUN TEST : lib/fiscal/$u.ts"; done; fi
H=$(grep -rnE "includes\('CNSS'\)|includes\('DGI'\)" lib/fiscal app/api/fiscal --include=*.ts 2>/dev/null | grep -v "tests/")
[ -z "$H" ] && ok "aucune identification d'organisme par recherche de texte" || { echo "$H" | sed 's/^/  /'; wa "organisme reconnu par correspondance de texte (fragile) : utiliser des codes énumérés"; }
node -e "const p=require('./package.json');process.exit(p.scripts&&p.scripts.test?0:1)" 2>/dev/null && ok "script npm test présent" || wa "aucun script npm « test » : les tests ne s'exécutent que via ce script de contrôle"

sec "5. COMPILATION ET TESTS"
if npx tsc --noEmit >$TMPD/vf-tsc.log 2>&1; then ok "tsc --noEmit (projet)"; else ko "tsc --noEmit : $(grep -c 'error TS' $TMPD/vf-tsc.log) erreur(s) — voir $TMPD/vf-tsc.log"; head -5 $TMPD/vf-tsc.log | sed 's/^/  /'; fi
rm -rf $TMPD/vf-tests; ls tests/ts/*.test.ts >/dev/null 2>&1 && {
  if npx tsc --strict --target es2022 --module commonjs --esModuleInterop --skipLibCheck --types node --outDir $TMPD/vf-tests tests/ts/*.test.ts >$TMPD/vf-tc.log 2>&1; then
    node --test $TMPD/vf-tests/tests/ts/*.test.js >$TMPD/vf-t1.log 2>&1
    P=$(grep -E '^(ℹ|#) pass ' $TMPD/vf-t1.log | awk '{print $3}'); F=$(grep -E '^(ℹ|#) fail ' $TMPD/vf-t1.log | awk '{print $3}')
    [ "${F:-1}" = "0" ] && ok "tests TypeScript : ${P:-0} réussis, 0 échec" || ko "tests TypeScript : ${F:-?} échec(s) — voir $TMPD/vf-t1.log"
  else ko "compilation des tests TypeScript : voir $TMPD/vf-tc.log"; fi; }
if ls tests/*.test.cjs >/dev/null 2>&1; then
  rm -rf .fiscal-test-build; npx tsc lib/fiscal/engine/is.ts lib/fiscal/engine/is-rules.ts lib/fiscal/engine/cnss.ts --outDir .fiscal-test-build --target es2022 --module commonjs --strict --skipLibCheck >$TMPD/vf-old.log 2>&1
  node --test tests/*.test.cjs >$TMPD/vf-t2.log 2>&1
  P=$(grep -E '^(ℹ|#) pass ' $TMPD/vf-t2.log | awk '{print $3}'); F=$(grep -E '^(ℹ|#) fail ' $TMPD/vf-t2.log | awk '{print $3}')
  [ "${F:-1}" = "0" ] && ok "anciens tests (.cjs) : ${P:-0} réussis, 0 échec" || ko "anciens tests : ${F:-?} échec(s) — voir $TMPD/vf-t2.log"
fi
if [ "$BUILD" = "1" ]; then echo "  build Next.js (peut durer plusieurs minutes)…"; npx next build >$TMPD/vf-build.log 2>&1 && ok "next build" || ko "next build — voir $TMPD/vf-build.log"; else wa "next build non exécuté (option --build)"; fi

sec "6. LIMITES DE CE CONTRÔLE"
echo "  - Ne prouve ni l'application des migrations en base, ni le déploiement en ligne, ni la parité avec le classeur V8."
echo "  - Aucune règle réglementaire n'est vérifiée ici : le référentiel doit être renseigné et validé par le cabinet."

sec "SYNTHESE : $PASS OK · $FAIL ECHEC · $WARN A VOIR"
[ "$FAIL" -eq 0 ] && echo "  Aucun échec bloquant détecté." || echo "  Corriger les [ECHEC] avant toute mise en production."
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
