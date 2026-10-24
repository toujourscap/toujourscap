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
