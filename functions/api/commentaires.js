// GET  /api/commentaires?page=<slug>  → commentaires approuvés de l'article
// POST /api/commentaires               → nouveau commentaire, en attente de modération
import { db, json, PAGE_RE } from "../../lib/commentaires.js";

export async function onRequestGet({ request, env }) {
  const page = new URL(request.url).searchParams.get("page") || "";
  if (!PAGE_RE.test(page)) return json({ erreur: "Page invalide" }, 400);
  try {
    const { results } = await (await db(env))
      .prepare("SELECT nom, message, cree_le FROM commentaires WHERE page = ? AND approuve = 1 ORDER BY id")
      .bind(page).all();
    return json({ commentaires: results });
  } catch (e) {
    return json({ erreur: "Commentaires indisponibles" }, 503);
  }
}

export async function onRequestPost({ request, env }) {
  let d;
  try { d = await request.json(); } catch { return json({ erreur: "Requête invalide" }, 400); }

  // Anti-spam : champ piège invisible rempli, ou formulaire envoyé en moins de 3 secondes.
  if (d.site || !d.t || Date.now() - Number(d.t) < 3000) return json({ ok: true });

  const page = String(d.page || "");
  const nom = String(d.nom || "").trim().slice(0, 60);
  const message = String(d.message || "").trim().slice(0, 3000);
  if (!PAGE_RE.test(page)) return json({ erreur: "Page invalide" }, 400);
  if (!nom) return json({ erreur: "Merci d'indiquer un prénom ou un pseudo." }, 400);
  if (message.length < 2) return json({ erreur: "Le message est vide." }, 400);

  try {
    await (await db(env))
      .prepare("INSERT INTO commentaires (page, nom, message) VALUES (?, ?, ?)")
      .bind(page, nom, message).run();
    return json({ ok: true });
  } catch (e) {
    return json({ erreur: "Commentaires indisponibles pour le moment." }, 503);
  }
}
