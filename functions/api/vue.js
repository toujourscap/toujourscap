// POST /api/vue : mesure d'audience du site (envoyé par chaque page et par chaque jeu).
// Respect de la vie privée : aucun cookie de suivi, aucune adresse IP enregistrée, aucun prénom.
// Un visiteur est reconnu seulement le temps d'une journée, par une empreinte chiffrée qui change chaque jour.
// Messages reçus :
//   { p, r, u, v, n }  page vue (chemin, provenance, utm_source, identifiant de la vue, nouveau visiteur 1/0)
//   { v, t }           temps passé sur cette vue (secondes visibles, total depuis l'ouverture)
//   { e, j, s, x }     événement de jeu (type, jeu, séance, valeur)
import { db } from "../../lib/commentaires.js";
import { prepareStats, jourParis, heureParis } from "../../lib/stats.js";

const ROBOTS = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|pingdom|monitor|curl|wget|python|java\//i;
const EVENEMENTS = new Set(["ouvert", "commence", "fin", "duree", "doc", "word", "impr"]);
const propre = (x, n) => String(x || "").toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, n);

async function empreinte(jour, request, env) {
  const ip = request.headers.get("cf-connecting-ip") || "";
  const ua = request.headers.get("user-agent") || "";
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${jour}|${ip}|${ua}|${env.ADMIN_PASSWORD || "toujourscap"}`));
  return [...new Uint8Array(h).slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Provenance : utm_source, sinon site d'origine, sinon application (navigateur intégré d'Instagram, Facebook, Pinterest).
function provenance(d, request, ua) {
  const utm = propre(d.u, 40);
  if (utm) return utm.includes(".") ? utm.replace(/^www\./, "") : `${utm}.com`;
  try {
    const h = new URL(String(d.r || "")).hostname.replace(/^www\./, "");
    if (h && h !== new URL(request.url).hostname.replace(/^www\./, "")) return h.slice(0, 100);
    if (h) return "";
  } catch { /* pas de provenance */ }
  if (/Instagram/.test(ua)) return "instagram.com";
  if (/FBAN|FBAV|FB_IAB/.test(ua)) return "facebook.com";
  if (/Pinterest/i.test(ua)) return "pinterest.com";
  return "";
}

export async function onRequestPost({ request, env }) {
  const vide = new Response(null, { status: 204 });
  const ua = request.headers.get("user-agent") || "";
  if (!ua || ROBOTS.test(ua)) return vide;
  if ((request.headers.get("cookie") || "").includes("tc_admin=1")) return vide;

  let d;
  try { d = JSON.parse(await request.text()); } catch { return vide; }
  if (!d || typeof d !== "object") return vide;

  try {
    const base = await db(env);
    await prepareStats(base);
    const vid = propre(d.v, 16);

    // Temps passé sur une page déjà comptée.
    if (vid && d.t != null && d.p == null) {
      const t = Math.max(0, Math.min(1800, Math.round(Number(d.t) || 0)));
      if (t) await base.prepare("UPDATE vues SET duree = MAX(COALESCE(duree, 0), ?) WHERE vid = ?").bind(t, vid).run();
      return vide;
    }

    const jour = jourParis(), heure = heureParis();
    const visiteur = await empreinte(jour, request, env);

    // Événement de jeu.
    if (d.e != null) {
      const type = String(d.e), jeu = propre(d.j, 80);
      if (!EVENEMENTS.has(type) || !jeu) return vide;
      const valeur = type === "duree" ? Math.max(0, Math.min(3600, Math.round(Number(d.x) || 0))) : 0;
      if (type === "duree" && !valeur) return vide;
      await base.prepare("INSERT INTO jeux_ev (jour, heure, jeu, type, valeur, ses, visiteur) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(jour, heure, jeu, type, valeur, propre(d.s, 16), visiteur).run();
      return vide;
    }

    // Page vue.
    const chemin = String(d.p || "/").split(/[?#]/)[0].slice(0, 200);
    if (!chemin.startsWith("/") || chemin.startsWith("/admin")) return vide;
    const source = provenance(d, request, ua);
    const appareil = /iPad|Tablet/i.test(ua) ? "tablette" : /Mobi|Android|iPhone/i.test(ua) ? "téléphone" : "ordinateur";
    const cf = request.cf || {};
    const pays = propre(cf.country, 2).toUpperCase() || null;
    const region = cf.region ? String(cf.region).slice(0, 60) : null;
    const nouveau = d.n === true ? 1 : d.n === false ? 0 : null;
    await base.prepare("INSERT INTO vues (jour, page, source, appareil, visiteur, vid, heure, pays, region, nouveau) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(jour, chemin, source, appareil, visiteur, vid || null, heure, pays, region, nouveau).run();
  } catch { /* base indisponible : on ignore */ }
  return vide;
}
