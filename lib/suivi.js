// Suivi de mes élèves (« Mes élèves » dans l'admin) — base D1 liée sous le nom DB.
// Aucun prénom n'est envoyé ni gardé ici : chaque élève a un pseudo d'animal (Lion, Panda…).
// La correspondance pseudo ↔ vrai prénom reste seulement dans le navigateur de l'enseignant (page /admin/eleves).
// Les élèves rejoignent la classe dans La tour de contrôle avec le code de classe (5 lettres).

export const ANIMAUX = [
  ["lion", "🦁", "Lion"], ["tigre", "🐯", "Tigre"], ["ours", "🐻", "Ours"], ["panda", "🐼", "Panda"],
  ["koala", "🐨", "Koala"], ["lapin", "🐰", "Lapin"], ["renard", "🦊", "Renard"], ["loup", "🐺", "Loup"],
  ["chat", "🐱", "Chat"], ["chien", "🐶", "Chien"], ["souris", "🐭", "Souris"], ["hibou", "🦉", "Hibou"],
  ["poussin", "🐥", "Poussin"], ["pingouin", "🐧", "Pingouin"], ["grenouille", "🐸", "Grenouille"], ["tortue", "🐢", "Tortue"],
  ["dauphin", "🐬", "Dauphin"], ["baleine", "🐳", "Baleine"], ["poulpe", "🐙", "Poulpe"], ["papillon", "🦋", "Papillon"],
  ["abeille", "🐝", "Abeille"], ["coccinelle", "🐞", "Coccinelle"], ["escargot", "🐌", "Escargot"], ["licorne", "🦄", "Licorne"],
  ["cheval", "🐴", "Cheval"], ["vache", "🐮", "Vache"], ["cochon", "🐷", "Cochon"], ["singe", "🐵", "Singe"],
  ["girafe", "🦒", "Girafe"], ["zebre", "🦓", "Zèbre"], ["elephant", "🐘", "Éléphant"], ["crocodile", "🐊", "Crocodile"],
  ["dragon", "🐉", "Dragon"], ["herisson", "🦔", "Hérisson"], ["castor", "🦫", "Castor"], ["paon", "🦚", "Paon"],
  ["perroquet", "🦜", "Perroquet"], ["flamant", "🦩", "Flamant"], ["requin", "🦈", "Requin"], ["crabe", "🦀", "Crabe"],
];
export const ANIMAL = Object.fromEntries(ANIMAUX.map(([id, emoji, nom]) => [id, { id, emoji, nom }]));

export const SCHEMA_SUIVI = [
  "CREATE TABLE IF NOT EXISTS suivi_reglages (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS suivi_eleves (pseudo TEXT PRIMARY KEY, cree INTEGER NOT NULL)",
  `CREATE TABLE IF NOT EXISTS suivi_vols (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pseudo TEXT NOT NULL,
    jeu TEXT NOT NULL,
    t INTEGER NOT NULL,
    ses TEXT NOT NULL DEFAULT '',
    cle TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT '',
    s REAL, n REAL, g INTEGER,
    niv TEXT NOT NULL DEFAULT '',
    d TEXT NOT NULL DEFAULT '',
    dur INTEGER NOT NULL DEFAULT 0
  )`,
  "CREATE INDEX IF NOT EXISTS idx_suivi_vols ON suivi_vols (pseudo, t)",
];

export const CODE_RE = /^[A-Z]{5}$/;
const LETTRES = "ABCDEFGHJKMNPQRSTUVWXYZ"; // sans I, L, O
export const MAX_VOLS = 3000;               // par élève (les plus anciens sont effacés)
export const GARDE = 400 * 86400000;        // résultats effacés au bout de 400 jours

export function nouveauCode() {
  return [...crypto.getRandomValues(new Uint8Array(5))].map((n) => LETTRES[n % LETTRES.length]).join("");
}

let pret = false;
export async function base(env) {
  if (!env.DB) throw new Error("Base D1 non reliée (liaison DB manquante)");
  if (!pret) { for (const q of SCHEMA_SUIVI) await env.DB.prepare(q).run(); pret = true; }
  return env.DB;
}

export async function codeClasse(db, creer = false) {
  const r = await db.prepare("SELECT valeur FROM suivi_reglages WHERE cle = 'code'").first();
  if (r) return r.valeur;
  if (!creer) return "";
  const c = nouveauCode();
  await db.prepare("INSERT OR REPLACE INTO suivi_reglages (cle, valeur) VALUES ('code', ?)").bind(c).run();
  return c;
}

// Un résultat envoyé par tour-de-controle.js, nettoyé (mêmes champs que le carnet de vol local).
const court = (x, n) => String(x == null ? "" : x).replace(/[<>]/g, "").slice(0, n);
export function nettoieVol(v) {
  if (!v || typeof v !== "object") return null;
  const jeu = court(v.j, 80);
  if (!/^[a-z0-9-]{1,80}$/.test(jeu)) return null;
  const t = Math.trunc(+v.t);
  if (!(t > 1.7e12 && t < Date.now() + 864e5)) return null;
  const nb = (x) => (typeof x === "number" && isFinite(x) ? x : null);
  return {
    jeu, t,
    ses: court(v.ses, 20), cle: court(v.cle, 60), type: v.type === "seance" ? "seance" : "",
    s: nb(v.s), n: nb(v.n) > 0 ? v.n : null, g: typeof v.g === "boolean" ? (v.g ? 1 : 0) : null,
    niv: court(v.niv, 40), d: court(v.d, 160), dur: Math.max(0, Math.min(36000, Math.trunc(+v.dur) || 0)),
  };
}

// Ligne de la base → objet du carnet de vol (format de tour-de-controle.js).
export function volCarnet(r) {
  const v = { j: r.jeu, t: r.t, ses: r.ses, dur: r.dur };
  if (r.cle) v.cle = r.cle;
  if (r.type) v.type = r.type;
  if (r.s != null) v.s = r.s;
  if (r.n != null) v.n = r.n;
  if (r.g != null) v.g = !!r.g;
  if (r.niv) v.niv = r.niv;
  if (r.d) v.d = r.d;
  return v;
}
