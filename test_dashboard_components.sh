#!/bin/bash

clear
echo "====================================================================="
echo "🔬 DIAGNOSTIC CODE SPACE - RECHERCHE DES SITES DE CRASH (DOUKE)"
echo "====================================================================="
echo ""

# 1. Vérification des appels de données non sécurisés (.map)
echo "1️⃣  Fichiers du tableau de bord utilisant des boucles (.map) potentiellement instables :"
echo "---------------------------------------------------------------------"
# On cherche les .map dans l'application qui pourraient tenter de lire un tableau vide/null
grep -rnE "\.map\(" ./app ./components --include=\*.{ts,tsx} 2>/dev/null | grep -v "node_modules"
echo ""

# 2. Détection des anciennes références textuelles ou UUIDs obsolètes
echo "2️⃣  Recherche d'anciens ID utilisateurs ou organisations figés en dur :"
echo "---------------------------------------------------------------------"
grep -rnw ./app ./components ./lib -e 'irina.admin' -e 'org_douke_01' --include=\*.{ts,tsx,js,jsx} 2>/dev/null
echo ""

# 3. Test de validité de syntaxe TypeScript / React
echo "3️⃣  Vérification de la compilation des types (Détection des erreurs bloquantes) :"
echo "---------------------------------------------------------------------"
if [ -f "node_modules/.bin/tsc" ]; then
    echo "Analyse des types en cours (TypeScript Lint)..."
    npx tsc --noEmit --project tsconfig.json
    if [ $? -eq 0 ]; then
        echo "✅ Aucun problème de type majeur détecté par le compilateur."
    fi
else
    echo "💡 Les dépendances ne semblent pas toutes compilées. Exécution de npx tsc..."
    npx tsc --noEmit 2>/dev/null
fi
echo ""

# 4. Traque de l'utilisation des variables de session Supabase
echo "4️⃣  Analyse de l'extraction de la session (Vérification des filtres d'ID) :"
echo "---------------------------------------------------------------------"
grep -rnE "session\?.user|user\?.id" ./app ./components --include=\*.{ts,tsx} 2>/dev/null
echo ""

echo "====================================================================="
echo "📋 ANALYSE CODESPACE TERMINÉE"
echo "====================================================================="
