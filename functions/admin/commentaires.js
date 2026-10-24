// /admin/commentaires : modération (identifiant « admin », mot de passe = variable ADMIN_PASSWORD).
import { db } from "../../lib/commentaires.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function egal(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function autorise(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const h = request.headers.get("authorization") || "";
  if (!h.startsWith("Basic ")) return false;
  let decode;
  try { decode = new TextDecoder().decode(Uint8Array.from(atob(h.slice(6)), (c) => c.charCodeAt(0))); } catch { return false; }
  const i = decode.indexOf(":");
  return egal(decode.slice(0, i), "admin") & egal(decode.slice(i + 1), env.ADMIN_PASSWORD);
}

const refus = (env) => new Response(
  env.ADMIN_PASSWORD ? "Accès réservé." : "Mot de passe ADMIN_PASSWORD non configuré dans Cloudflare.",
  { status: 401, headers: { "www-authenticate": 'Basic realm="Moderation", charset="UTF-8"', "content-type": "text/plain; charset=utf-8" } });

const page = (corps) => new Response(`<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Modération des commentaires</title>
<style>
body{margin:0;background:#fbf7f0;color:#23302c;font:16px/1.55 system-ui,sans-serif}
main{max-width:820px;margin:0 auto;padding:24px 16px}
h1{font-size:1.6rem;margin:0 0 4px}h2{font-size:1.15rem;margin:32px 0 12px}
.c{background:#fff;border:1px solid #e7e0d4;border-radius:12px;padding:14px 16px;margin-bottom:12px}
.m{color:#66716d;font-size:.9rem}.txt{white-space:pre-wrap;margin:8px 0 12px}
form{display:inline}button{border:0;border-radius:999px;padding:8px 16px;font-weight:700;cursor:pointer;margin-right:6px}
.ok{background:#1f6f5c;color:#fff}.no{background:#f3d9cf;color:#7a2e12}.vide{color:#66716d}
a{color:#1f6f5c}
</style></head><body><main>${corps}</main></body></html>`,
  { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

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
