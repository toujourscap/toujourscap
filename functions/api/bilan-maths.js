// Bilan de maths CE1 (début : épreuves a1–a20, apb ; fin : n1–d1) : moyennes anonymes des passations (base D1 liée sous le nom DB).
// Aucun prénom, aucune adresse IP, aucun âge : seulement la classe, le moment de l'année et le score de chaque épreuve.
// POST /api/bilan-maths {p: id de passation, classe, periode: debut|milieu|fin, r: {epreuve: {pct, nb?}}}
// GET  /api/bilan-maths?classe=CE1&periode=debut → moyennes par épreuve pour la classe (toute l'année) et pour la classe à ce moment
import { db, json } from "../../lib/commentaires.js";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS bilan_maths (
    passation TEXT NOT NULL,
    epreuve TEXT NOT NULL,
    jour TEXT NOT NULL,
    classe TEXT NOT NULL,
    age_mois INTEGER NOT NULL,
    pct INTEGER NOT NULL,
    nb INTEGER,
    PRIMARY KEY (passation, epreuve)
  )`,
  "CREATE INDEX IF NOT EXISTS idx_bilan_maths_classe ON bilan_maths (classe, epreuve)",
];
const CLASSES = new Set(["CP", "CE1", "CE2", "Autre"]);
const EPREUVES = new Set(["n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8", "n9", "f1", "f2", "f3", "c1", "c2", "c3", "c4", "c5", "c6", "pb", "g1", "g2", "g3", "g4", "g5", "s1", "s2", "s3", "s4", "d1", "a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "a9", "a10", "a11", "a12", "a13", "apb", "a14", "a15", "a16", "a17", "a18", "a19", "a20"]);
const CHRONO = new Set(["c1", "c2", "c4", "a9", "a10", "a11"]);
const ID_RE = /^[a-z0-9]{8,24}$/;

const PERIODES = new Set(["debut", "milieu", "fin"]);
const MIGRATIONS = ["ALTER TABLE bilan_maths ADD COLUMN periode TEXT"];

let pret = false;
async function base(env) {
  const b = await db(env);
  if (!pret) {
    for (const q of SCHEMA) await b.prepare(q).run();
    for (const q of MIGRATIONS) { try { await b.prepare(q).run(); } catch { /* colonne déjà là */ } }
    pret = true;
  }
  return b;
}
const ent = (v, a, b) => { v = Math.round(+v); return Number.isFinite(v) && v >= a && v <= b ? v : null; };

export async function onRequestPost({ request, env }) {
  let d;
  try { d = JSON.parse((await request.text()).slice(0, 6000)); } catch { return json({ erreur: "Données illisibles" }, 400); }
  const p = String(d.p || ""), classe = String(d.classe || ""), periode = String(d.periode || "");
  if (!ID_RE.test(p) || !CLASSES.has(classe) || !PERIODES.has(periode) || !d.r || typeof d.r !== "object") return json({ erreur: "Données invalides" }, 400);
  let b;
  try { b = await base(env); } catch { return json({ erreur: "Enregistrement indisponible" }, 503); }
  const jour = new Date().toISOString().slice(0, 10);
  const lignes = [];
  for (const [e, v] of Object.entries(d.r).slice(0, 40)) {
    if (!EPREUVES.has(e) || !v || typeof v !== "object") continue;
    const pct = ent(v.pct, 0, 100);
    if (pct === null) continue;
    const nb = CHRONO.has(e) ? ent(v.nb, 0, 100) : null;
    lignes.push(b.prepare("INSERT OR REPLACE INTO bilan_maths (passation, epreuve, jour, classe, age_mois, periode, pct, nb) VALUES (?,?,?,?,0,?,?,?)")
      .bind(p, e, jour, classe, periode, pct, nb));
  }
  if (lignes.length) await b.batch(lignes);
  return json({ ok: true, n: lignes.length });
}

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const classe = String(u.searchParams.get("classe") || "");
  const periode = String(u.searchParams.get("periode") || "");
  if (!CLASSES.has(classe)) return json({ erreur: "Classe invalide" }, 400);
  let b;
  try { b = await base(env); } catch { return json({ erreur: "Moyennes indisponibles" }, 503); }
  const q = (ou, ...v) => b.prepare(`SELECT epreuve, COUNT(*) AS n, ROUND(AVG(pct)) AS pct, ROUND(AVG(nb)) AS nb FROM bilan_maths WHERE ${ou} GROUP BY epreuve`).bind(...v).all();
  const parClasse = (await q("classe = ?", classe)).results;
  const parPeriode = PERIODES.has(periode) ? (await q("classe = ? AND periode = ?", classe, periode)).results : [];
  return json({ classe: parClasse, periode: parPeriode });
}
