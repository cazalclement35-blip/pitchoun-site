# Backend "Montres connectées" — Suivi Sportif

Ce dossier contient un backend [Cloudflare Worker](https://workers.cloudflare.com/) optionnel
qui permet à l'app `/tracker` de récupérer automatiquement le nombre de pas
depuis une montre connectée (Apple Watch, Fitbit/Pixel Watch, Withings, Polar).

**L'app fonctionne très bien sans ce backend** (tout reste en local dans le
navigateur). Ce backend n'est nécessaire que si tu veux le suivi automatique
des pas.

## Ce qu'il faut savoir avant de se lancer

- **Garmin n'est pas supporté.** Le programme développeur Garmin est fermé
  aux particuliers (réservé aux entreprises), il n'y a pas de solution.
- **Aucune de ces intégrations ne fonctionne "app fermée" au sens strict** —
  ce backend interroge les API cloud de chaque service (Withings, Polar,
  Google Health), qui elles-mêmes reçoivent les données de ta montre en
  arrière-plan de façon native (hors navigateur). C'est ce détour qui rend la
  chose possible malgré les limites des PWA expliquées plus haut dans la
  conversation.
- **Fitbit / Google Health API est l'intégration la moins certaine.** C'est
  une API très récente (mi-2026), déployée après la date de mes
  connaissances : l'authentification est fiable, mais la structure exacte de
  la réponse de l'endpoint des pas (`src/providers/googlehealth.js`) est une
  estimation à vérifier. Si ça ne remonte pas de données, regarde les logs
  (`wrangler tail`) et ajuste ce fichier en te basant sur
  https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints/dailyRollUp
- **Polar** ne renvoie que les données déjà synchronisées entre la montre et
  l'appli Polar Flow du téléphone — "aujourd'hui" peut être en retard tant
  que cette synchro n'a pas eu lieu.
- **Apple Watch** ne passe pas par une vraie API : il faut une app tierce sur
  l'iPhone (payante, ex. *Health Auto Export*) configurée pour pousser le
  total de pas du jour vers l'URL webhook de ce backend, via une
  automatisation Raccourcis. Voir étape 6.

## 1. Prérequis

- Un compte Cloudflare gratuit : https://dash.cloudflare.com/sign-up
- Node.js installé sur ta machine (pour lancer `npm` / `wrangler`)

## 2. Déployer le Worker

```bash
cd backend
npm install
npx wrangler login          # ouvre une fenêtre pour connecter ton compte Cloudflare
npx wrangler kv namespace create TRACKER_KV
```

La dernière commande affiche un `id`. Colle-le dans `wrangler.toml` à la
place de `REMPLACE_MOI_AVEC_L_ID_KV`.

Modifie aussi dans `wrangler.toml` :
- `ALLOWED_ORIGIN` → l'URL exacte où tourne `/tracker` (ex.
  `https://cazalclement35-blip.github.io`), pour que le navigateur autorise
  les requêtes. Laisser `*` fonctionne aussi mais est moins strict.
- `APP_URL` → l'URL complète de l'app (ex.
  `https://cazalclement35-blip.github.io/pitchoun-site/tracker/`), utilisée
  pour la page "Connecté ✅" après une connexion réussie.

Choisis un mot de passe perso pour protéger l'API (evite qu'un inconnu qui
tombe sur l'URL du Worker puisse lire/modifier tes connexions) :

```bash
npx wrangler secret put APP_PASSCODE
```

Déploie :

```bash
npm run deploy
```

Note l'URL affichée à la fin (du type
`https://suivi-sportif-backend.<ton-sous-domaine>.workers.dev`) — c'est
celle à renseigner dans l'app (icône ⌚ en haut à droite → "URL du
backend").

## 3. Connecter Withings

1. Crée un compte développeur sur https://developer.withings.com (avec ton
   compte Withings existant).
2. Crée une application. Renseigne comme **Callback URL** :
   `https://<ton-worker>.workers.dev/auth/withings/callback`
3. Récupère le Client ID et le Client Secret, puis :
   ```bash
   npx wrangler secret put WITHINGS_CLIENT_ID
   npx wrangler secret put WITHINGS_CLIENT_SECRET
   ```
4. Redéploie (`npm run deploy`) si le Worker tournait déjà.

## 4. Connecter Polar

1. Va sur https://admin.polaraccesslink.com, connecte-toi avec ton compte
   Polar Flow (gratuit si tu n'en as pas).
2. Crée un client. **Callback URL** :
   `https://<ton-worker>.workers.dev/auth/polar/callback`
3. ```bash
   npx wrangler secret put POLAR_CLIENT_ID
   npx wrangler secret put POLAR_CLIENT_SECRET
   ```
4. Redéploie.

## 5. Connecter Fitbit / Pixel Watch (Google Health API)

1. Crée un projet sur https://console.cloud.google.com
2. Active l'**API Google Health** pour ce projet
   (https://developers.google.com/health).
3. Configure l'écran de consentement OAuth (type "Externe", toi-même comme
   utilisateur de test suffit pour un usage perso).
4. Crée des identifiants **OAuth 2.0 — Application Web**. Ajoute comme URI de
   redirection autorisée :
   `https://<ton-worker>.workers.dev/auth/googlehealth/callback`
5. ```bash
   npx wrangler secret put GOOGLEHEALTH_CLIENT_ID
   npx wrangler secret put GOOGLEHEALTH_CLIENT_SECRET
   ```
6. Redéploie. Si la connexion réussit mais que le nombre de pas reste vide,
   lance `npx wrangler tail` pendant que tu cliques sur "Synchroniser" dans
   l'app pour voir l'erreur exacte renvoyée par Google, et ajuste
   `src/providers/googlehealth.js` en conséquence.

## 6. Connecter une Apple Watch

Il n'y a pas de bouton "Connecter" pour Apple : configure plutôt l'envoi
depuis ton iPhone.

1. Installe **Health Auto Export** (ou *Health Webhook*) depuis l'App Store.
2. Dans l'app, ouvre `/tracker` → icône ⌚ → renseigne l'URL et le mot de
   passe du backend → l'URL du webhook Apple s'affiche, avec un bouton
   "Copier".
3. Dans Health Auto Export, crée une automatisation d'export **REST API**
   vers cette URL, avec :
   - la métrique **Pas** activée,
   - un agrégation en **total cumulé du jour** (pas en "delta"/incrémental —
     sinon les chiffres seront faux),
   - un déclenchement régulier via l'app **Raccourcis** (ex. toutes les
     heures, ou sur une automatisation "à l'arrivée à la maison"/horaire).
4. Une fois qu'un premier envoi a eu lieu, l'app affichera "Apple Watch"
   comme connecté avec l'heure de dernière synchro.

## 7. Utiliser le suivi des pas dans l'app

Dans `/tracker`, icône ⌚ en haut à droite :
1. Renseigne l'URL du Worker + le mot de passe → Enregistrer.
2. Pour chaque service voulu, clique "Connecter" (ouvre un nouvel onglet
   pour l'autorisation), reviens ensuite dans l'app.
3. Choisis l'habitude à cocher automatiquement (ex. "7 000 pas") et
   l'objectif de pas.

Le widget en haut de l'onglet Habitudes affiche alors le nombre de pas du
jour (le maximum entre toutes les sources connectées, pour éviter les
doublons), et coche automatiquement la case du jour dans la semaine la plus
récente si l'objectif est atteint.

## Sécurité

- Toutes les routes de lecture/écriture (`/api/*`, `/auth/*/start`,
  `/webhook/apple`) exigent le mot de passe `APP_PASSCODE` — sans lui,
  personne ne peut lire ou modifier tes connexions même en connaissant
  l'URL du Worker.
- Les tokens OAuth sont stockés côté serveur (Cloudflare KV), jamais dans le
  navigateur.
- Ne partage ni l'URL du Worker ni le mot de passe.
