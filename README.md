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
La table est créée automatiquement. Tant que la base n'est pas reliée, la section reste masquée.
