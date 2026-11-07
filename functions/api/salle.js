// Parties à plusieurs écrans (voir lib/salle.js).
// GET  /api/salle?code=ABCD[&id=n]  → état de la salle (statut, réglages, départ, joueurs, heure du serveur)
// POST /api/salle {a:"creer", jeu, reglages}            → {code, hote}
//      {a:"rejoindre", code, nom}                       → {id, jeton}
//      {a:"partir", code, hote, reglages}               → départ dans 4 s pour tout le monde (aussi pour une revanche)
//      {a:"arreter", code, hote}                        → fin de la course (classement)
//      {a:"score", code, id, jeton, bons, erreurs, temps}
//      {a:"quitter", code, id, jeton}
//      {a:"avancer", code, hote, etape, delai}         → question suivante pour toute la salle (jeux par étapes)
import { db, json } from "../../lib/commentaires.js";
import {
  SCHEMA_SALLES, MIGRATIONS, JEUX, MAX_JOUEURS, DUREE_VIE, ABSENT, CODE_RE,
  nouveauCode, jeton, nettoieNom, nettoieReglages, nettoieDonnees,
} from "../../lib/salle.js";

let pret = false;
async function base(env) {
  const b = await db(env);
  if (!pret) {
    for (const q of SCHEMA_SALLES) await b.prepare(q).run();
    for (const q of MIGRATIONS) { try { await b.prepare(q).run(); } catch { /* colonne déjà là */ } }
    pret = true;
  }
  return b;
}

const DEPART = 4000; // ms entre « Partez ! » et le vrai départ (le temps que tous les écrans l'apprennent)

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const code = String(u.searchParams.get("code") || "").toUpperCase();
  const id = Math.trunc(+u.searchParams.get("id")) || 0;
  if (!CODE_RE.test(code)) return json({ erreur: "Code invalide" }, 400);
  let b;
  try { b = await base(env); } catch { return json({ erreur: "Parties à plusieurs indisponibles" }, 503); }
  const now = Date.now();
  const s = await b.prepare("SELECT jeu, statut, reglages, debut, manche, etape, etape_t FROM salles WHERE code = ?").bind(code).first();
  if (!s) return json({ erreur: "Aucune course avec ce code." }, 404);
  if (id) await b.prepare("UPDATE salle_joueurs SET vu = ? WHERE salle = ? AND id = ?").bind(now, code, id).run();
  const { results } = await b.prepare(
    "SELECT id, nom, bons, erreurs, temps, vu, donnees FROM salle_joueurs WHERE salle = ? ORDER BY id").bind(code).all();
  const joueurs = results
    .filter((j) => s.statut !== "attente" || now - j.vu < ABSENT)
    .map(({ id, nom, bons, erreurs, temps, donnees }) => ({ id, nom, bons, erreurs, temps, d: JSON.parse(donnees || "{}") }));
  return json({
    jeu: s.jeu, statut: s.statut, reglages: JSON.parse(s.reglages || "{}"),
    debut: s.debut, manche: s.manche, etape: s.etape, etape_t: s.etape_t, joueurs, maintenant: now,
  });
}

export async function onRequestPost({ request, env }) {
  let d;
  try { d = await request.json(); } catch { return json({ erreur: "Requête invalide" }, 400); }
  let b;
  try { b = await base(env); } catch { return json({ erreur: "Parties à plusieurs indisponibles" }, 503); }
  const now = Date.now();
  const code = String(d.code || "").toUpperCase();

  if (d.a === "creer") {
    const jeu = String(d.jeu || "");
    if (!JEUX.has(jeu)) return json({ erreur: "Jeu inconnu" }, 400);
    // Ménage : salles de plus de 24 h
    await b.prepare("DELETE FROM salle_joueurs WHERE salle IN (SELECT code FROM salles WHERE cree < ?)").bind(now - DUREE_VIE).run();
    await b.prepare("DELETE FROM salles WHERE cree < ?").bind(now - DUREE_VIE).run();
    const hote = jeton(), reglages = JSON.stringify(nettoieReglages(jeu, d.reglages));
    for (let essai = 0; essai < 8; essai++) {
      const c = nouveauCode();
      const r = await b.prepare("INSERT OR IGNORE INTO salles (code, jeu, hote, reglages, cree) VALUES (?, ?, ?, ?, ?)")
        .bind(c, jeu, hote, reglages, now).run();
      if (r.meta.changes) return json({ code: c, hote });
    }
    return json({ erreur: "Réessaie dans un instant." }, 503);
  }

  if (!CODE_RE.test(code)) return json({ erreur: "Code invalide" }, 400);
  const s = await b.prepare("SELECT hote, statut, jeu FROM salles WHERE code = ?").bind(code).first();
  if (!s) return json({ erreur: "Aucune course avec ce code." }, 404);

  if (d.a === "rejoindre") {
    const nom = nettoieNom(d.nom);
    if (!nom) return json({ erreur: "Écris un prénom ou un nom d'équipe." }, 400);
    if (s.statut === "course") return json({ erreur: "La course a déjà commencé : attends la prochaine !" }, 409);
    const { results } = await b.prepare("SELECT id, nom, vu FROM salle_joueurs WHERE salle = ?").bind(code).all();
    const presents = results.filter((j) => now - j.vu < ABSENT);
    if (presents.some((j) => j.nom.toLowerCase() === nom.toLowerCase()))
      return json({ erreur: `« ${nom} » est déjà pris : choisis un autre nom.` }, 409);
    if (presents.length >= MAX_JOUEURS) return json({ erreur: `Pas plus de ${MAX_JOUEURS} écrans par course.` }, 409);
    // Les écrans partis avant le départ libèrent leur place
    if (s.statut === "attente")
      await b.prepare("DELETE FROM salle_joueurs WHERE salle = ? AND vu < ?").bind(code, now - ABSENT).run();
    const j = jeton();
    for (let essai = 0; essai < 3; essai++) {
      const r = await b.prepare(
        `INSERT OR IGNORE INTO salle_joueurs (salle, id, jeton, nom, vu)
         SELECT ?, COALESCE(MAX(id), 0) + 1, ?, ?, ? FROM salle_joueurs WHERE salle = ?`)
        .bind(code, j, nom, now, code).run();
      if (r.meta.changes) {
        const row = await b.prepare("SELECT id FROM salle_joueurs WHERE salle = ? AND jeton = ?").bind(code, j).first();
        return json({ id: row.id, jeton: j, nom });
      }
    }
    return json({ erreur: "Réessaie dans un instant." }, 503);
  }

  if (d.a === "partir" || d.a === "arreter" || d.a === "avancer") {
    if (String(d.hote || "") !== s.hote) return json({ erreur: "Seul l'écran qui a créé la course peut faire ça." }, 403);
    if (d.a === "avancer") {
      const etape = Math.max(0, Math.min(100, Math.trunc(+d.etape) || 0));
      const delai = Math.max(0, Math.min(5000, Math.trunc(+d.delai) || 0));
      await b.prepare("UPDATE salles SET etape = ?, etape_t = ? WHERE code = ? AND etape < ?")
        .bind(etape, now + delai, code, etape).run();
      return json({ ok: true });
    }
    if (d.a === "arreter") {
      await b.prepare("UPDATE salles SET statut = 'fini' WHERE code = ?").bind(code).run();
      return json({ ok: true });
    }
    const reglages = JSON.stringify(nettoieReglages(s.jeu, d.reglages));
    await b.prepare("DELETE FROM salle_joueurs WHERE salle = ? AND vu < ?").bind(code, now - ABSENT).run();
    await b.prepare("UPDATE salle_joueurs SET bons = 0, erreurs = 0, temps = NULL, donnees = '{}' WHERE salle = ?").bind(code).run();
    await b.prepare("UPDATE salles SET statut = 'course', reglages = ?, debut = ?, manche = manche + 1, etape = 0, etape_t = ? WHERE code = ?")
      .bind(reglages, now + DEPART, now + DEPART, code).run();
    return json({ ok: true, debut: now + DEPART });
  }

  const id = Math.trunc(+d.id) || 0, jt = String(d.jeton || "");
  if (d.a === "score") {
    const bons = Math.max(0, Math.min(50, Math.trunc(+d.bons) || 0));
    const erreurs = Math.max(0, Math.min(999, Math.trunc(+d.erreurs) || 0));
    const temps = d.temps == null ? null : Math.max(0, Math.min(3600000, Math.trunc(+d.temps) || 0));
    await b.prepare("UPDATE salle_joueurs SET bons = ?, erreurs = ?, temps = ?, donnees = ?, vu = ? WHERE salle = ? AND id = ? AND jeton = ?")
      .bind(bons, erreurs, temps, nettoieDonnees(d.donnees), now, code, id, jt).run();
    return json({ ok: true });
  }
  if (d.a === "quitter") {
    await b.prepare("DELETE FROM salle_joueurs WHERE salle = ? AND id = ? AND jeton = ?").bind(code, id, jt).run();
    return json({ ok: true });
  }
  return json({ erreur: "Action inconnue" }, 400);
}
