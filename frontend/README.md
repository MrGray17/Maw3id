# Maw3id Web

Application web React/TypeScript destinée aux patients et cabinets médicaux. Cette première tranche fournit la recherche publique mobile-first avec des états explicites, une validation stricte des réponses API et un emplacement réservé à la carte réelle.

## Démarrage local

```bash
npm ci
cp .env.example .env.local
npm run dev
```

L'API locale est attendue sur `http://127.0.0.1:3000/api/v1`. Le fond de carte reste volontairement désactivé tant que `VITE_MAP_STYLE_URL` ne pointe pas vers un fournisseur autorisé pour la production.

## Contrôles

```bash
npm run check
```

Cette commande exécute le typage TypeScript, ESLint, les tests Vitest et la construction de production.
