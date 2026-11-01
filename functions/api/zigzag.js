// GET  /api/zigzag → { actif, turnstile } : la page sait si la correction par IA est disponible.
// POST /api/zigzag { jeu, element, texte, token? } → { trouvees: [bool], message, hors_sujet }
//
// Protections (site ouvert à tous) :
//  - consignes et contenus côté serveur (lib/zigzag.js) : l'IA ne sait faire que corriger les jeux prévus ;
//  - texte limité à 300 caractères, réponse courte ;
//  - quota par visiteur et par heure + plafond global par jour (base D1, aucune adresse IP enregistrée) ;
//  - requêtes acceptées seulement depuis le site lui-même ;
//  - vérification anti-robot Cloudflare Turnstile si TURNSTILE_SECRET est réglé ;
//  - et surtout : limite de dépense mensuelle fixée dans la console Anthropic.
//
// Réglages du projet Pages : secret ANTHROPIC_API_KEY (sans lui, la correction IA reste masquée),
// facultatifs : IA_MAX_HEURE (40), IA_MAX_JOUR (2000), TURNSTILE_SITEKEY + TURNSTILE_SECRET.
import { json } from "../../lib/commentaires.js";
import { JEUX, MAX_TEXTE, consigne, lireReponse } from "../../lib/zigzag.js";

const MODELE = "claude-haiku-5-5";
const SCHEMA = "CREATE TABLE IF NOT EXISTS ia_quota (cle TEXT PRIMARY KEY, jour TEXT NOT NULL, n INTEGER NOT NULL)";
let pret = false;

const actif = (env) => !!(env.ANTHROPIC_API_KEY && env.DB);

export async function onRequestGet({ env }) {
  return json({ actif: actif(env), turnstile: (env.TURNSTILE_SECRET && env.TURNSTILE_SITEKEY) || null });
}

export async function onRequestPost({ request, env }) {
  if (!actif(env)) return json({ erreur: "Le professeur Zigzag fait la sieste." }, 503);

  const origine = request.headers.get("origin");
  if (!origine || new URL(origine).host !== new URL(request.url).host) return json({ erreur: "Origine refusée" }, 403);

  let d;
  try { d = await request.json(); } catch { return json({ erreur: "Requête invalide" }, 400); }
  const jeu = JEUX[d.jeu];
  const el = jeu && Object.hasOwn(jeu.elements, d.element) ? jeu.elements[d.element] : null;
  const texte = String(d.texte || "").replace(/\s+/g, " ").trim();
  if (!el) return json({ erreur: "Jeu inconnu" }, 400);
  if (texte.length < 3) return json({ erreur: "Écris ou dis un peu plus !" }, 400);
  if (texte.length > MAX_TEXTE) return json({ erreur: `C'est trop long : ${MAX_TEXTE} caractères au maximum.` }, 400);

  const ip = request.headers.get("cf-connecting-ip") || "";
  if (env.TURNSTILE_SECRET && !(await turnstileOk(env.TURNSTILE_SECRET, d.token, ip))) {
    return json({ erreur: "Vérification anti-robot échouée. Recharge la page." }, 403);
  }

  // Quotas
  const maintenant = new Date().toISOString();
  const jour = maintenant.slice(0, 10), heure = maintenant.slice(0, 13);
  try {
    if (!pret) { await env.DB.prepare(SCHEMA).run(); pret = true; }
    const visiteur = await empreinte(`${heure}|${ip}|${request.headers.get("user-agent") || ""}|${env.ANTHROPIC_API_KEY.slice(-8)}`);
    const nV = await compter(env.DB, "v:" + visiteur, jour);
    const nJ = await compter(env.DB, "jour:" + jour, jour);
    if (nV > Number(env.IA_MAX_HEURE || 40)) return json({ erreur: "Ouf, tu as beaucoup travaillé ! Le professeur Zigzag se repose un peu : reviens dans une heure." }, 429);
    if (nJ > Number(env.IA_MAX_JOUR || 2000)) return json({ erreur: "Le professeur Zigzag a corrigé énormément aujourd'hui : il revient demain !" }, 429);
    if (Math.random() < 0.02) await env.DB.prepare("DELETE FROM ia_quota WHERE jour < ?").bind(jour).run();
  } catch (e) {
    console.log("Quota", e.message);
    return json({ erreur: "Le professeur Zigzag fait la sieste." }, 503);
  }

  // Appel à l'IA
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: env.IA_MODELE || MODELE,
        max_tokens: 400,
        system: consigne(jeu, el),
        messages: [{ role: "user", content: `<eleve>${texte.replace(/[<>]/g, " ")}</eleve>` }],
      }),
    });
    if (!r.ok) { console.log("Anthropic", r.status, (await r.text()).slice(0, 300)); throw new Error("API"); }
    const data = await r.json();
    const rep = lireReponse((data.content || []).map((c) => c.text || "").join(""), el.idees.length);
    if (!rep) throw new Error("Réponse illisible");
    return json({ ...rep, idees: el.idees });
  } catch (e) {
    return json({ erreur: "Le professeur Zigzag fait la sieste. Réessaie dans un moment !" }, 502);
  }
}

async function compter(db, cle, jour) {
  const row = await db.prepare(
    "INSERT INTO ia_quota (cle, jour, n) VALUES (?, ?, 1) ON CONFLICT(cle) DO UPDATE SET n = n + 1 RETURNING n",
  ).bind(cle, jour).first();
  return row ? row.n : 1;
}

async function empreinte(s) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(h).slice(0, 10)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function turnstileOk(secret, token, ip) {
  if (!token) return false;
  try {
    const f = new FormData();
    f.append("secret", secret); f.append("response", String(token)); if (ip) f.append("remoteip", ip);
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: f });
    return (await r.json()).success === true;
  } catch { return false; }
}
