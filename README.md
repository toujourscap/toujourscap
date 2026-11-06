# Toujours cap !

Ressources pédagogiques pour le cycle 2 (GS, CP, CE1, CE2) — https://toujourscap.com

- `site/` : le site publié (dossier de sortie pour Cloudflare Pages).
- `build.py` : régénère `site/` à partir de `posts.json` et `assets/`.
- `assets/` : feuille de style, favicon, outils autonomes.
- `functions/` + `lib/` : commentaires sous les articles (Cloudflare Pages Functions + base D1).

## Commentaires

Les messages sont enregistrés dans une base Cloudflare D1 et n'apparaissent qu'après validation sur
https://toujourscap.com/admin/commentaires (identifiant `admin`, mot de passe = variable `ADMIN_PASSWORD`).
Réglages du projet Pages : liaison D1 nommée `DB` + variable secrète `ADMIN_PASSWORD`.
Alerte e-mail à chaque nouveau commentaire (facultatif) : secret `RESEND_API_KEY` (compte resend.com)
+ variable `NOTIF_EMAIL` (adresse du compte Resend).
La table est créée automatiquement. Tant que la base n'est pas reliée, la section reste masquée.

## Statistiques

Compteur de visites maison, consultable sur https://toujourscap.com/admin/stats (mêmes identifiants que la modération).
Chaque page envoie une requête à `/api/vue`, enregistrée dans la table `vues` de la même base D1.
Aucun cookie de suivi ni adresse IP stockée : un visiteur est reconnu seulement le temps d'une journée.
Les visites faites depuis un appareil où l'admin a été ouvert ne sont pas comptées (cookie `tc_admin`).

## Correction par IA (professeur Zigzag)

`functions/api/zigzag.js` + `lib/zigzag.js` : correction des phrases d'élèves par Claude (Anthropic), partagée par tous les jeux.
Jeux branchés : Redis la règle (redire la règle), Le secret de la pyramide (redire le problème, étape 2 facultative), La Bibliothèque des contes (questions « avec mes mots » en fin de lecture ; entrées générées depuis le jeu : conte-niveau-n°).
Les consignes et les contenus de chaque jeu sont dans `lib/zigzag.js` (la page n'envoie que le nom du jeu, l'élément et la phrase).
Réglages du projet Pages : secret `ANTHROPIC_API_KEY` (sans lui, la correction reste masquée et les jeux fonctionnent sans IA),
liaison D1 `DB` (déjà utilisée par les commentaires, pour les quotas).
Facultatif : `IA_MAX_HEURE` (40 corrections par visiteur et par heure), `IA_MAX_JOUR` (2000 pour tout le site),
`TURNSTILE_SITEKEY` + `TURNSTILE_SECRET` (anti-robot Cloudflare Turnstile).
Fixer une limite de dépense mensuelle dans la console Anthropic (console.anthropic.com → Limits).

## Parties à plusieurs tablettes

`functions/api/salle.js` + `lib/salle.js` : une course partagée entre plusieurs tablettes (code à 4 lettres, jusqu'à 8 tablettes),
gardée dans la même base D1 `DB` (tables `salles` et `salle_joueurs`, créées automatiquement, effacées au bout de 24 h).
Les tablettes interrogent le serveur toutes les 0,8 à 1,5 s ; le départ est fixé à l'heure du serveur pour que le compte à rebours soit le même partout.
Jeux branchés : La course des additions et La course des multiplications (mode « 📱 Plusieurs tablettes »). Aucun réglage Cloudflare supplémentaire.
