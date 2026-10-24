// /admin/commentaires : modération (identifiant « admin », mot de passe = variable ADMIN_PASSWORD).
import { db } from "../../lib/commentaires.js";
import { esc, autorise, refus, page as gabarit } from "../../lib/admin.js";

const page = (corps) => gabarit("Modération des commentaires", "commentaires", corps);


function bloc(c, attente) {
  return `<div class="c">
  <div class="m"><strong>${esc(c.nom)}</strong> · ${esc(c.cree_le)} UTC · <a href="/post/${esc(c.page)}/#commentaires" target="_blank">${esc(c.page)}</a></div>
  <div class="txt">${esc(c.message)}</div>
  ${attente ? `<form method="post"><input type="hidden" name="id" value="${c.id}"><button class="ok" name="action" value="approuver">Publier</button></form>` : ""}
  <form method="post" onsubmit="return confirm('Supprimer définitivement ce commentaire ?')"><input type="hidden" name="id" value="${c.id}"><button class="no" name="action" value="supprimer">Supprimer</button></form>
</div>`;
}

export async function onRequestGet({ request, env }) {
  if (!autorise(request, env)) return refus(env);
  let base;
  try { base = await db(env); } catch { return page("<h1>Modération</h1><p>La base D1 n'est pas encore reliée au site (liaison <code>DB</code>).</p>"); }
  const { results: attente } = await base.prepare("SELECT * FROM commentaires WHERE approuve = 0 ORDER BY id DESC").all();
  const { results: publies } = await base.prepare("SELECT * FROM commentaires WHERE approuve = 1 ORDER BY id DESC LIMIT 50").all();
  return page(`<h1>Modération des commentaires</h1>
<p class="m">Les commentaires n'apparaissent sur le site qu'après avoir cliqué sur « Publier ».</p>
<h2>En attente (${attente.length})</h2>
${attente.map((c) => bloc(c, true)).join("") || '<p class="vide">Aucun commentaire en attente.</p>'}
<h2>Publiés récemment</h2>
${publies.map((c) => bloc(c, false)).join("") || '<p class="vide">Aucun commentaire publié.</p>'}`);
}

export async function onRequestPost({ request, env }) {
  if (!autorise(request, env)) return refus(env);
  const f = await request.formData();
  const id = Number(f.get("id"));
  const base = await db(env);
  if (id && f.get("action") === "approuver") await base.prepare("UPDATE commentaires SET approuve = 1 WHERE id = ?").bind(id).run();
  if (id && f.get("action") === "supprimer") await base.prepare("DELETE FROM commentaires WHERE id = ?").bind(id).run();
  return Response.redirect(new URL(request.url).toString(), 303);
}
