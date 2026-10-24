// POST /api/vue : compte une page vue (envoyé par /stats.js sur chaque page du site).
// Respect de la vie privée : aucun cookie de suivi, aucune adresse IP enregistrée.
// Un visiteur est reconnu seulement le temps d'une journée, par une empreinte chiffrée qui change chaque jour.
import { db } from "../../lib/commentaires.js";
import { SCHEMA_VUES, jourParis } from "../../lib/stats.js";

const ROBOTS = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|pingdom|monitor|curl|wget|python|java\//i;

let pret = false;

export async function onRequestPost({ request, env }) {
  const vide = new Response(null, { status: 204 });
  const ua = request.headers.get("user-agent") || "";
  if (!ua || ROBOTS.test(ua)) return vide;
  if ((request.headers.get("cookie") || "").includes("tc_admin=1")) return vide;

  let d;
  try { d = JSON.parse(await request.text()); } catch { return vide; }
  let chemin = String(d.p || "/").split(/[?#]/)[0].slice(0, 200);
  if (!chemin.startsWith("/") || chemin.startsWith("/admin")) return vide;

  let source = "";
  try {
    const h = new URL(String(d.r || "")).hostname.replace(/^www\./, "");
    if (h && h !== new URL(request.url).hostname.replace(/^www\./, "")) source = h.slice(0, 100);
  } catch { /* pas de provenance */ }

  const appareil = /iPad|Tablet/i.test(ua) ? "tablette" : /Mobi|Android|iPhone/i.test(ua) ? "téléphone" : "ordinateur";
  const jour = jourParis();
  const ip = request.headers.get("cf-connecting-ip") || "";
  const empreinte = await crypto.subtle.digest("SHA-256",
    new TextEncoder().encode(`${jour}|${ip}|${ua}|${env.ADMIN_PASSWORD || "toujourscap"}`));
  const visiteur = [...new Uint8Array(empreinte).slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");

  try {
    const base = await db(env);
    if (!pret) {
      for (const q of SCHEMA_VUES) await base.prepare(q).run();
      pret = true;
    }
    await base.prepare("INSERT INTO vues (jour, page, source, appareil, visiteur) VALUES (?, ?, ?, ?, ?)")
      .bind(jour, chemin, source, appareil, visiteur).run();
  } catch { /* base indisponible : on ignore */ }
  return vide;
}
