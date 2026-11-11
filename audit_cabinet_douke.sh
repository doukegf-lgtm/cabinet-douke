#!/usr/bin/env bash
# =============================================================================
#  AUDIT_CABINET_DOUKE.SH : état des lieux complet d'un projet logiciel
#  Usage :  ./audit_cabinet_douke.sh [chemin_projet] [--run]
#     --run : exécute aussi tests / lint / build / audit de sécurité des deps
#  Lecture seule par défaut (aucune modification du projet).
#  Sortie : terminal + rapport Markdown AUDIT_cabinet_douke_<date>.md
# =============================================================================
set -u
ROOT="."; RUN=0
for a in "$@"; do case "$a" in --run) RUN=1;; *) ROOT="$a";; esac; done
cd "$ROOT" 2>/dev/null || { echo "Dossier introuvable : $ROOT"; exit 1; }
ROOT="$(pwd)"
DATE="$(date +%Y-%m-%d_%H%M)"
REPORT="$ROOT/AUDIT_cabinet_douke_${DATE}.md"

# --- Couleurs ----------------------------------------------------------------
if [ -t 1 ]; then B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; C=$'\e[36m'; N=$'\e[0m'; else B=;G=;Y=;R=;C=;N=; fi
h1(){ printf "\n${B}${C}══════════════════════════════════════════════════════════════${N}\n${B}${C}  %s${N}\n${B}${C}══════════════════════════════════════════════════════════════${N}\n" "$1"; }
ok(){ printf "  ${G}✅ %s${N}\n" "$*"; }
warn(){ printf "  ${Y}🟡 %s${N}\n" "$*"; }
ko(){ printf "  ${R}❌ %s${N}\n" "$*"; }
info(){ printf "  • %s\n" "$*"; }
have(){ command -v "$1" >/dev/null 2>&1; }

EXD=(--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=vendor --exclude-dir=dist \
     --exclude-dir=build --exclude-dir=.next --exclude-dir=__pycache__ --exclude-dir=venv \
     --exclude-dir=.venv --exclude-dir=coverage --exclude-dir=storage --exclude-dir=.dart_tool \
     --exclude-dir=.gradle --exclude-dir=Pods --exclude-dir=.idea --exclude-dir=.cache)
SRC=(--include=*.js --include=*.jsx --include=*.ts --include=*.tsx --include=*.vue --include=*.py \
     --include=*.php --include=*.dart --include=*.java --include=*.kt --include=*.cs --include=*.rb \
     --include=*.go --include=*.sql --include=*.html --include=*.blade.php --include=*.svelte)

cnt_files(){ grep -rIlEi "${EXD[@]}" "${SRC[@]}" -e "$1" . 2>/dev/null | wc -l | tr -d ' '; }
cnt_lines(){ grep -rIEi "${EXD[@]}" "${SRC[@]}" -e "$1" . 2>/dev/null | wc -l | tr -d ' '; }
findf(){ find . \( -name node_modules -o -name .git -o -name vendor -o -name dist -o -name build -o -name venv -o -name .venv -o -name __pycache__ \) -prune -o "$@" -print 2>/dev/null; }

SCORE=0; MAXSCORE=0
pt(){ MAXSCORE=$((MAXSCORE+$1)); [ "$2" = "1" ] && SCORE=$((SCORE+$1)); }  # pt <poids> <0|1>
TODO_LIST=()
todo(){ TODO_LIST+=("$*"); }

main(){
printf "${B}AUDIT PROJET « CABINET DOUKÉ »${N}  –  %s\nDossier : %s\n" "$(date '+%d/%m/%Y %H:%M')" "$ROOT"

# =============================================================================
h1 "1. IDENTITÉ & ENVIRONNEMENT"
info "OS : $(uname -sr)"
for t in git node npm yarn pnpm python3 pip php composer java flutter docker cloc; do
  have $t && info "$t : $($t --version 2>/dev/null | head -1)" || true
done
[ -f README.md ] && ok "README.md présent ($(wc -l < README.md) lignes)" || { ko "README absent"; todo "Rédiger un README (installation, architecture, déploiement)"; }
pt 2 $([ -f README.md ] && echo 1 || echo 0)

# =============================================================================
h1 "2. HISTORIQUE GIT"
if [ -d .git ] && have git; then
  info "Branche : $(git branch --show-current 2>/dev/null)"
  info "Commits : $(git rev-list --count HEAD 2>/dev/null) | Contributeurs : $(git shortlog -sn HEAD 2>/dev/null | wc -l)"
  info "Premier commit : $(git log --reverse --format='%ad' --date=short 2>/dev/null | head -1)"
  info "Dernier commit : $(git log -1 --format='%ad | %an | %s' --date=short 2>/dev/null)"
  info "Commits sur 30 jours : $(git log --since='30 days ago' --oneline 2>/dev/null | wc -l)"
  echo "  Derniers 12 commits :"; git log -12 --format='     %h %ad %s' --date=short 2>/dev/null
  CH=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  [ "$CH" = "0" ] && ok "Arbre de travail propre" || { warn "$CH fichier(s) modifié(s)/non suivis"; git status --short | head -15 | sed 's/^/     /'; todo "Commiter ou trier les $CH modifications en cours"; }
  info "Branches : $(git branch -a 2>/dev/null | wc -l) | Tags : $(git tag 2>/dev/null | wc -l) | Stash : $(git stash list 2>/dev/null | wc -l)"
  pt 3 1
else ko "Pas de dépôt Git"; todo "Initialiser Git et versionner le projet"; pt 3 0; fi

# =============================================================================
h1 "3. STACK TECHNIQUE DÉTECTÉE"
STACK=()
[ -f package.json ] && STACK+=("Node/JS")
[ -f composer.json ] && STACK+=("PHP")
[ -f artisan ] && STACK+=("Laravel")
[ -f requirements.txt -o -f pyproject.toml -o -f Pipfile ] && STACK+=("Python")
[ -f manage.py ] && STACK+=("Django")
[ -f pubspec.yaml ] && STACK+=("Flutter/Dart")
[ -f pom.xml -o -f build.gradle ] && STACK+=("Java/Android")
[ -f Gemfile ] && STACK+=("Ruby")
[ -f go.mod ] && STACK+=("Go")
[ -f Dockerfile -o -f docker-compose.yml -o -f docker-compose.yaml ] && STACK+=("Docker")
info "Technologies : ${STACK[*]:-aucune détectée}"
if [ -f package.json ]; then
  for fw in react next vue nuxt angular svelte express nestjs fastify tailwindcss prisma sequelize mongoose typeorm firebase supabase electron "react-native" expo vite jest vitest cypress playwright; do
    grep -qE "\"$fw\"|\"@?[a-z-]*/?$fw\"" package.json 2>/dev/null && info "dépendance : $fw"
  done
  info "Scripts npm : $(grep -A30 '"scripts"' package.json | grep -oE '"[a-z:_-]+"\s*:' | tr -d '":' | tr '\n' ' ')"
fi
[ -f composer.json ] && info "Paquets PHP : $(grep -c '"' composer.json) lignes composer.json"
[ -f requirements.txt ] && info "Paquets Python : $(grep -cvE '^\s*(#|$)' requirements.txt)"

# =============================================================================
h1 "4. TAILLE & STRUCTURE"
TOTAL=$(findf -type f \( -name '*.js' -o -name '*.jsx' -o -name '*.ts' -o -name '*.tsx' -o -name '*.vue' -o -name '*.py' -o -name '*.php' -o -name '*.dart' -o -name '*.java' -o -name '*.kt' -o -name '*.sql' -o -name '*.css' -o -name '*.scss' -o -name '*.html' \) | wc -l | tr -d ' ')
info "Fichiers source : $TOTAL"
if have cloc; then cloc --quiet --exclude-dir=node_modules,vendor,dist,build,.git,venv . 2>/dev/null | sed 's/^/     /'
else
  echo "  Lignes par extension :"
  for e in js jsx ts tsx vue py php dart java sql css scss html; do
    n=$(findf -type f -name "*.$e" -exec cat {} + 2>/dev/null | wc -l); [ "$n" -gt 0 ] && printf "     .%-5s %8s lignes\n" "$e" "$n"
  done
fi
echo "  Arborescence (niveau 2) :"
findf -maxdepth 2 -type d | grep -v '^\.$' | sort | head -40 | sed 's/^/     /'
echo "  10 plus gros fichiers source :"
findf -type f \( -name '*.js' -o -name '*.jsx' -o -name '*.ts' -o -name '*.tsx' -o -name '*.py' -o -name '*.php' -o -name '*.vue' -o -name '*.dart' \) -exec wc -l {} + 2>/dev/null | grep -v ' total$' | sort -rn | head -10 | sed 's/^/     /'
BIG=$(findf -type f \( -name '*.js' -o -name '*.jsx' -o -name '*.ts' -o -name '*.tsx' -o -name '*.py' -o -name '*.php' -o -name '*.vue' \) -exec wc -l {} + 2>/dev/null | grep -v ' total$' | awk '$1>600' | wc -l | tr -d ' ')
[ "$BIG" -gt 0 ] && { warn "$BIG fichier(s) > 600 lignes (refactoring conseillé)"; todo "Découper les $BIG fichiers volumineux (>600 lignes)"; }

# =============================================================================
h1 "5. MATRICE FONCTIONNELLE – CABINET (détection par mots-clés)"
printf "  %-34s %-10s %s\n" "FONCTIONNALITÉ" "FICHIERS" "STATUT"
feat(){ # nom | regex | poids
  local f; f=$(cnt_files "$2"); local st
  if [ "$f" -ge 3 ]; then st="${G}✅ implémenté${N}"; pt "$3" 1
  elif [ "$f" -ge 1 ]; then st="${Y}🟡 partiel${N}"; pt "$3" 0; todo "Compléter : $1"
  else st="${R}❌ absent${N}"; pt "$3" 0; todo "Développer : $1"; fi
  printf "  %-34s %-10s %b\n" "$1" "$f" "$st"
}
feat "Authentification / login"          "login|signin|authenticate|jwt|passport|bcrypt|session" 5
feat "Rôles & permissions"               "role|permission|isAdmin|authorize|guard|policy|rbac" 4
feat "Gestion clients / patients"        "client|patient|customer|justiciable|dossier_?client" 5
feat "Dossiers / affaires"               "dossier|affaire|case|file_?number|procedure" 5
feat "Rendez-vous / agenda"              "rendez.?vous|appointment|agenda|calendar|schedule|booking" 5
feat "Facturation / honoraires"          "facture|invoice|honorair|devis|quote|billing" 5
feat "Paiements (Mobile Money, etc.)"    "paiement|payment|momo|mtn|moov|fedapay|kkiapay|stripe|paypal|wave" 4
feat "Documents / upload / GED"          "upload|multer|document|pdf|attachment|fichier|storage" 4
feat "Génération PDF / impression"       "pdfkit|jspdf|dompdf|puppeteer|wkhtml|reportlab|tcpdf|print" 3
feat "Notifications (mail/SMS/WhatsApp)" "nodemailer|mailer|sms|twilio|whatsapp|notification|push" 3
feat "Tableau de bord / statistiques"    "dashboard|statistique|analytics|chart|kpi|recharts|chart\.js" 3
feat "Comptabilité / caisse / dépenses"  "comptabilit|caisse|depense|expense|ledger|tresorerie|accounting" 3
feat "Recherche / filtres / pagination"  "search|filter|paginat|query|recherche" 2
feat "Internationalisation (FR/EN)"      "i18n|intl|translate|locale|gettext|lang" 1
feat "Journal d'activité / audit log"    "audit|activity.?log|historique|logger|winston|morgan" 2
feat "Sauvegarde / export / import"      "backup|sauvegarde|export|import|csv|xlsx|excel" 2
feat "Mode hors-ligne / PWA"             "serviceworker|service-worker|workbox|manifest\.json|pwa|offline" 1
feat "Responsive / mobile"               "@media|responsive|useMediaQuery|tailwind|flex|grid" 2

# =============================================================================
h1 "6. BACK-END : API, MODÈLES, BASE DE DONNÉES"
EP=$(cnt_lines "(app|router|route)\.(get|post|put|patch|delete)\(|Route::(get|post|put|patch|delete|resource|apiResource)|@(Get|Post|Put|Patch|Delete)\(|path\(|@app\.route|@router\.(get|post|put|delete)")
info "Endpoints/routes détectés : $EP"
MOD=$(findf -type f \( -ipath '*model*' -o -ipath '*entit*' -o -ipath '*schema*' \) \( -name '*.js' -o -name '*.ts' -o -name '*.py' -o -name '*.php' -o -name '*.prisma' \) | wc -l | tr -d ' ')
info "Fichiers modèles/entités/schémas : $MOD"
MIG=$(findf -type f -ipath '*migration*' | wc -l | tr -d ' ')
info "Migrations : $MIG"; [ "$MIG" -gt 0 ] && ok "Schéma versionné" || { warn "Aucune migration détectée"; todo "Mettre en place des migrations de base de données"; }
pt 3 $([ "$MIG" -gt 0 ] && echo 1 || echo 0)
SQLF=$(findf -type f -name '*.sql' | wc -l | tr -d ' '); info "Fichiers .sql : $SQLF"
for db in mysql postgres sqlite mongodb mongoose firebase supabase redis; do
  c=$(cnt_files "$db"); [ "$c" -gt 0 ] && info "Base/outil '$db' référencé dans $c fichier(s)"
done
SEED=$(findf -type f -ipath '*seed*' | wc -l | tr -d ' '); info "Seeders/fixtures : $SEED"

# =============================================================================
h1 "7. FRONT-END"
PAGES=$(findf -type f \( -ipath '*pages*' -o -ipath '*views*' -o -ipath '*screens*' -o -ipath '*resources/views*' \) \( -name '*.jsx' -o -name '*.tsx' -o -name '*.vue' -o -name '*.php' -o -name '*.dart' -o -name '*.html' \) | wc -l | tr -d ' ')
COMP=$(findf -type f -ipath '*component*' \( -name '*.jsx' -o -name '*.tsx' -o -name '*.vue' -o -name '*.dart' -o -name '*.svelte' \) | wc -l | tr -d ' ')
info "Pages/vues/écrans : $PAGES | Composants : $COMP"
info "Appels API côté client (fetch/axios) : $(cnt_lines 'fetch\(|axios\.|http\.(get|post)')"
info "Gestion d'état (redux/zustand/pinia/context) : $(cnt_files 'redux|zustand|pinia|vuex|createContext|provider')"
info "Gestion des erreurs (try/catch) : $(cnt_lines 'try\s*\{|catch\s*\(|except ')"

# =============================================================================
h1 "8. QUALITÉ, TESTS & DEVOPS"
TESTS=$(findf -type f \( -name '*.test.*' -o -name '*.spec.*' -o -name 'test_*.py' -o -name '*Test.php' \) | wc -l | tr -d ' ')
info "Fichiers de tests : $TESTS"
[ "$TESTS" -ge 5 ] && ok "Couverture de tests amorcée" || { [ "$TESTS" -gt 0 ] && warn "Tests insuffisants" || ko "Aucun test"; todo "Écrire des tests (auth, facturation, rendez-vous en priorité)"; }
pt 4 $([ "$TESTS" -ge 5 ] && echo 1 || echo 0)
chk(){ if [ -n "$(findf -maxdepth 3 -name "$2" | head -1)" ]; then ok "$1"; pt "$3" 1; else ko "$1 absent"; pt "$3" 0; todo "Ajouter : $1"; fi; }
chk "Config ESLint/Prettier/PHPCS"  ".eslintrc*" 1
chk ".env.example documenté"        ".env.example" 2
chk "Dockerfile"                    "Dockerfile" 2
chk ".gitignore"                    ".gitignore" 1
[ -d .github/workflows ] && { ok "CI GitHub Actions"; pt 3 1; } || { [ -f .gitlab-ci.yml ] && { ok "CI GitLab"; pt 3 1; } || { ko "Pas de CI/CD"; pt 3 0; todo "Mettre en place une CI (tests + lint + build)"; }; }
echo "  Dette technique :"
for k in TODO FIXME HACK XXX; do printf "     %-6s %s\n" "$k" "$(cnt_lines "\b$k\b")"; done
DT=$(cnt_lines "\b(TODO|FIXME|HACK|XXX)\b"); [ "$DT" -gt 0 ] && { echo "  Détail (20 premiers) :"; grep -rIEn "${EXD[@]}" "${SRC[@]}" -e '\b(TODO|FIXME|HACK|XXX)\b' . 2>/dev/null | head -20 | cut -c1-140 | sed 's/^/     /'; todo "Traiter les $DT marqueurs TODO/FIXME"; }
info "console.log / print de debug : $(cnt_lines 'console\.log\(|var_dump\(|dd\(|print_r\(|^\s*print\(')"
info "Code commenté suspect (// ... ;) : $(cnt_lines '^\s*//.*(function|return|const|let|if)\b')"

# =============================================================================
h1 "9. SÉCURITÉ (scan statique rapide)"
SEC=0
s(){ local c; c=$(cnt_lines "$2"); if [ "$c" -gt 0 ]; then ko "$1 : $c occurrence(s)"; SEC=$((SEC+1)); todo "Sécurité : $1"; else ok "$1 : RAS"; fi; }
s "Mots de passe/secrets en dur"      "(password|passwd|secret|api_?key|token)\s*[:=]\s*['\"][^'\"\$\{ ]{6,}['\"]"
s "Clés privées / tokens connus"      "BEGIN (RSA|EC|OPENSSH) PRIVATE KEY|AKIA[0-9A-Z]{16}|sk_live_|ghp_[A-Za-z0-9]{20,}"
s "Requêtes SQL concaténées (injection)" "(query|execute)\(\s*[\"'\`](SELECT|INSERT|UPDATE|DELETE)[^\"'\`]*[\"'\`]\s*\+|\\\$_(GET|POST|REQUEST)\[[^]]+\][^;]*(SELECT|INSERT|UPDATE|DELETE)"
s "eval()/innerHTML/dangerouslySetInnerHTML" "\beval\(|\.innerHTML\s*=|dangerouslySetInnerHTML"
s "CORS ouvert à tous (*)"            "origin\s*:\s*['\"]\*['\"]|Access-Control-Allow-Origin.*\*"
s "Mode debug activé"                 "DEBUG\s*=\s*True|APP_DEBUG\s*=\s*true|debug\s*:\s*true"
pt 5 $([ "$SEC" -eq 0 ] && echo 1 || echo 0)
if [ -d .git ]; then
  git ls-files 2>/dev/null | grep -E '(^|/)\.env$|\.pem$|id_rsa|\.p12$' | head -5 | while read -r f; do ko "Fichier sensible SUIVI par Git : $f"; done
fi
[ "$(cnt_files 'helmet|csurf|csrf|rate.?limit|express-validator|joi|zod|yup|validator')" -gt 0 ] && ok "Protections/validation détectées (helmet/csrf/rate-limit/validation)" || { warn "Aucune lib de validation/protection détectée"; todo "Ajouter validation des entrées, rate-limiting, en-têtes de sécurité"; }
[ "$(cnt_files 'rgpd|gdpr|consentement|consent|donnees.?personnelles|privacy')" -gt 0 ] && ok "Éléments de conformité données personnelles" || { warn "Aucune trace de conformité données personnelles"; todo "Prévoir politique de confidentialité / consentement / chiffrement des données sensibles"; }

# =============================================================================
if [ "$RUN" = "1" ]; then
h1 "10. EXÉCUTION RÉELLE (--run)"
run(){ echo "  ▶ $*"; if timeout 300 bash -c "$*" >/tmp/audit_out.$$ 2>&1; then ok "OK : $*"; else ko "ÉCHEC : $*"; tail -8 /tmp/audit_out.$$ | sed 's/^/       /'; todo "Corriger : $*"; fi; }
  if [ -f package.json ]; then
    [ -d node_modules ] || run "npm install --no-audit --no-fund"
    grep -q '"lint"'  package.json && run "npm run lint --silent"
    grep -q '"test"'  package.json && run "npm test --silent -- --watchAll=false"
    grep -q '"build"' package.json && run "npm run build --silent"
    echo "  ▶ npm audit"; npm audit --omit=dev 2>/dev/null | tail -6 | sed 's/^/     /'
    echo "  ▶ npm outdated (top 10)"; npm outdated 2>/dev/null | head -11 | sed 's/^/     /'
  fi
  [ -f artisan ] && run "php artisan test"
  [ -f manage.py ] && run "python3 manage.py check"
  [ -f pytest.ini -o -f pyproject.toml ] && have pytest && run "pytest -q"
  [ -f pubspec.yaml ] && have flutter && run "flutter analyze"
  rm -f /tmp/audit_out.$$
else
  echo; info "Astuce : relancez avec --run pour exécuter lint, tests, build et audit des dépendances."
fi

# =============================================================================
h1 "SYNTHÈSE"
PCT=0; [ "$MAXSCORE" -gt 0 ] && PCT=$((SCORE*100/MAXSCORE))
BAR=""; for i in $(seq 1 20); do [ $((i*5)) -le "$PCT" ] && BAR+="█" || BAR+="░"; done
printf "  ${B}Avancement estimé : %s%%  [%s]  (%s/%s pts)${N}\n" "$PCT" "$BAR" "$SCORE" "$MAXSCORE"
[ "$PCT" -ge 80 ] && ok "Projet mature : phase de finalisation / mise en production"
[ "$PCT" -lt 80 ] && [ "$PCT" -ge 50 ] && warn "Projet avancé : fonctionnalités et qualité à consolider"
[ "$PCT" -lt 50 ] && ko "Projet en phase de construction : plusieurs briques majeures manquantes"
echo; echo "  ${B}RESTE À FAIRE (priorisé par ordre de détection) :${N}"
if [ "${#TODO_LIST[@]}" -eq 0 ]; then ok "Rien de critique détecté"; else
  n=1; for t in "${TODO_LIST[@]}"; do printf "   %2d. %s\n" "$n" "$t"; n=$((n+1)); done; fi
echo; echo "  Note : détection heuristique par mots-clés – à valider avec Claude."
echo "  Rapport enregistré : $REPORT"
}

main 2>&1 | tee >(sed -r 's/\x1b\[[0-9;]*m//g' > "$REPORT")
