// Bilan de lecture cycle 2 : moyennes anonymes des passations (base D1 liée sous le nom DB).
// Aucun prénom, aucune adresse IP : seulement la classe, l'âge en mois et le score de chaque épreuve.
// POST /api/bilan-lecture {p: id de passation, classe, age: mois, r: {epreuve: {pct, mclm?}}}
// GET  /api/bilan-lecture?classe=CP&age=80 → moyennes par épreuve pour la classe et pour la même année d'âge
import { db, json } from "../../lib/commentaires.js";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS bilan_lecture (
    passation TEXT NOT NULL,
    epreuve TEXT NOT NULL,
    jour TEXT NOT NULL,
    classe TEXT NOT NULL,
    age_mois INTEGER NOT NULL,
    pct INTEGER NOT NULL,
    mclm INTEGER,
    PRIMARY KEY (passation, epreuve)
  )`,
  "CREATE INDEX IF NOT EXISTS idx_bilan_classe ON bilan_lecture (classe, epreuve)",
];
const CLASSES = new Set(["GS", "CP", "CE1", "CE2", "Autre"]);
const EPREUVES = new Set(["vs", "vc", "ms", "mc", "ts", "tc", "vis", "aud", "par", "e1", "e2", "e3"]);
const ID_RE = /^[a-z0-9]{8,24}$/;

let pret = false;
async function base(env) {
  const b = await db(env);
  if (!pret) { for (const q of SCHEMA) await b.prepare(q).run(); pret = true; }
  return b;
}
const ent = (v, a, b) => { v = Math.round(+v); return Number.isFinite(v) && v >= a && v <= b ? v : null; };

export async function onRequestPost({ request, env }) {
  let d;
  try { d = JSON.parse((await request.text()).slice(0, 3000)); } catch { return json({ erreur: "Données illisibles" }, 400); }
  const p = String(d.p || ""), classe = String(d.classe || ""), age = ent(d.age, 36, 144);
  if (!ID_RE.test(p) || !CLASSES.has(classe) || age === null || !d.r || typeof d.r !== "object") return json({ erreur: "Données invalides" }, 400);
  let b;
  try { b = await base(env); } catch { return json({ erreur: "Enregistrement indisponible" }, 503); }
  const jour = new Date().toISOString().slice(0, 10);
  const lignes = [];
  for (const [e, v] of Object.entries(d.r).slice(0, 12)) {
    if (!EPREUVES.has(e) || !v || typeof v !== "object") continue;
    const pct = ent(v.pct, 0, 100);
    if (pct === null) continue;
    const mclm = e === "ts" || e === "tc" ? ent(v.mclm, 0, 300) : null;
    lignes.push(b.prepare("INSERT OR REPLACE INTO bilan_lecture (passation, epreuve, jour, classe, age_mois, pct, mclm) VALUES (?,?,?,?,?,?,?)")
      .bind(p, e, jour, classe, age, pct, mclm));
  }
  if (lignes.length) await b.batch(lignes);
  return json({ ok: true, n: lignes.length });
}

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const classe = String(u.searchParams.get("classe") || "");
  const age = ent(u.searchParams.get("age"), 36, 144);
  if (!CLASSES.has(classe)) return json({ erreur: "Classe invalide" }, 400);
  let b;
  try { b = await base(env); } catch { return json({ erreur: "Moyennes indisponibles" }, 503); }
  const q = (ou, ...v) => b.prepare(`SELECT epreuve, COUNT(*) AS n, ROUND(AVG(pct)) AS pct, ROUND(AVG(mclm)) AS mclm FROM bilan_lecture WHERE ${ou} GROUP BY epreuve`).bind(...v).all();
  const parClasse = (await q("classe = ?", classe)).results;
  let parAge = [];
  if (age !== null) { const an = Math.floor(age / 12); parAge = (await q("age_mois >= ? AND age_mois < ?", an * 12, an * 12 + 12)).results; }
  return json({ classe: parClasse, age: parAge });
}
