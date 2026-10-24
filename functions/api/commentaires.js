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

export async function onRequestPost({ request, env, waitUntil }) {
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
  } catch (e) {
    return json({ erreur: "Commentaires indisponibles pour le moment." }, 503);
  }
  waitUntil(alerter(env, page, nom, message));
  return json({ ok: true });
}

// E-mail d'alerte via Resend (variables RESEND_API_KEY + NOTIF_EMAIL). Sans elles : pas d'e-mail.
async function alerter(env, page, nom, message) {
  if (!env.RESEND_API_KEY || !env.NOTIF_EMAIL) return;
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: env.NOTIF_FROM || "Toujours cap ! <onboarding@resend.dev>",
        to: [env.NOTIF_EMAIL],
        subject: `Nouveau commentaire de ${nom} (${page})`,
        html: `<p><strong>${esc(nom)}</strong> a commenté <a href="https://toujourscap.com/post/${page}/">${page}</a> :</p>
<blockquote style="white-space:pre-wrap;border-left:3px solid #1f6f5c;padding-left:12px">${esc(message)}</blockquote>
<p><a href="https://toujourscap.com/admin/commentaires">Modérer les commentaires</a></p>`,
      }),
    });
    if (!r.ok) console.log("Resend", r.status, await r.text());
  } catch (e) {
    console.log("Resend erreur", e.message);
  }
}
