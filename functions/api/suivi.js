// /api/suivi : résultats des élèves de la classe (pseudos d'animaux, aucun prénom).
//   GET  ?code=ABCDE                 → animaux de la classe { ok, animaux: [{id, emoji, nom}] }
//   GET  ?code=ABCDE&pseudo=lion     → + vols de cet élève (pour retrouver son carnet sur un autre appareil)
//   POST { code, pseudo, v }         → enregistre un résultat (même règle de remplacement que le carnet local)
import { json } from "../../lib/commentaires.js";
import { base, codeClasse, CODE_RE, ANIMAL, nettoieVol, volCarnet, MAX_VOLS } from "../../lib/suivi.js";

async function verifier(env, code, pseudo) {
  code = String(code || "").toUpperCase();
  if (!CODE_RE.test(code)) return { err: "code" };
  const db = await base(env);
  if ((await codeClasse(db)) !== code) return { err: "code" };
  if (pseudo != null) {
    if (!ANIMAL[pseudo]) return { err: "pseudo" };
    const e = await db.prepare("SELECT 1 FROM suivi_eleves WHERE pseudo = ?").bind(pseudo).first();
    if (!e) return { err: "pseudo" };
  }
  return { db };
}

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const pseudo = u.searchParams.get("pseudo");
  let r;
  try { r = await verifier(env, u.searchParams.get("code"), pseudo || null); } catch { return json({ ok: false, err: "base" }, 503); }
  if (r.err) return json({ ok: false, err: r.err }, 404);
  const { results } = await r.db.prepare("SELECT pseudo FROM suivi_eleves").all();
  const animaux = results.map((x) => ANIMAL[x.pseudo]).filter(Boolean).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  const rep = { ok: true, animaux };
  if (pseudo) {
    const { results: vols } = await r.db.prepare("SELECT * FROM suivi_vols WHERE pseudo = ? ORDER BY t DESC LIMIT 400").bind(pseudo).all();
    rep.vols = vols.reverse().map(volCarnet);
  }
  return json(rep);
}

export async function onRequestPost({ request, env }) {
  let d;
  try { d = JSON.parse(await request.text()); } catch { return json({ ok: false }, 400); }
  const v = nettoieVol(d && d.v);
  if (!v) return json({ ok: false, err: "vol" }, 400);
  let r;
  try { r = await verifier(env, d.code, String(d.pseudo || "")); } catch { return json({ ok: false, err: "base" }, 503); }
  if (r.err) return json({ ok: false, err: r.err }, 404);
  const p = d.pseudo, db = r.db;
  await db.batch([
    // même partie : la séance sans bilan et un résultat de même clé sont remplacés (comme dans le carnet local)
    db.prepare("DELETE FROM suivi_vols WHERE pseudo = ? AND ses = ? AND ses != '' AND (type = 'seance' OR (cle != '' AND cle = ?))").bind(p, v.ses, v.cle),
    db.prepare("INSERT INTO suivi_vols (pseudo, jeu, t, ses, cle, type, s, n, g, niv, d, dur) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(p, v.jeu, v.t, v.ses, v.cle, v.type, v.s, v.n, v.g, v.niv, v.d, v.dur),
    db.prepare("DELETE FROM suivi_vols WHERE pseudo = ? AND id NOT IN (SELECT id FROM suivi_vols WHERE pseudo = ? ORDER BY t DESC LIMIT ?)").bind(p, p, MAX_VOLS),
  ]);
  return json({ ok: true });
}
