// Parties à plusieurs tablettes (« salles ») : partagées par les jeux, gardées dans la base D1 (liaison DB).
// Aucun compte : un code à 4 lettres pour la salle, un prénom ou un nom d'équipe par tablette.
// Tout est effacé au bout de 24 h.

export const SCHEMA_SALLES = [
  `CREATE TABLE IF NOT EXISTS salles (
    code TEXT PRIMARY KEY,
    jeu TEXT NOT NULL,
    hote TEXT NOT NULL,
    statut TEXT NOT NULL DEFAULT 'attente',
    reglages TEXT NOT NULL DEFAULT '{}',
    debut INTEGER NOT NULL DEFAULT 0,
    manche INTEGER NOT NULL DEFAULT 0,
    cree INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS salle_joueurs (
    salle TEXT NOT NULL,
    id INTEGER NOT NULL,
    jeton TEXT NOT NULL,
    nom TEXT NOT NULL,
    bons INTEGER NOT NULL DEFAULT 0,
    erreurs INTEGER NOT NULL DEFAULT 0,
    temps INTEGER,
    vu INTEGER NOT NULL,
    PRIMARY KEY (salle, id)
  )`,
];
// Colonnes ajoutées ensuite (jeux par étapes : une question à la fois pour toute la salle).
// ALTER échoue si la colonne existe déjà : l'erreur est ignorée.
export const MIGRATIONS = [
  "ALTER TABLE salles ADD COLUMN etape INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE salles ADD COLUMN etape_t INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE salle_joueurs ADD COLUMN donnees TEXT NOT NULL DEFAULT '{}'",
];

export const JEUX = new Set(["course-additions", "course-multiplications", "tape-taupe"]);
export const MAX_JOUEURS = 8;
export const DUREE_VIE = 24 * 3600 * 1000;      // salle effacée après 24 h
export const ABSENT = 25 * 1000;                // tablette qui ne donne plus de nouvelles (avant le départ)
export const LETTRES = "ABCDEFGHJKMNPQRSTUVWXYZ"; // sans I, L, O (confusions avec 1, 0)
export const CODE_RE = /^[A-Z]{4}$/;

// Petites données propres à chaque jeu, envoyées par une tablette (objet de nombres, 300 caractères au plus).
export function nettoieDonnees(d) {
  const o = {};
  if (d && typeof d === "object") for (const [k, v] of Object.entries(d).slice(0, 8))
    if (/^[a-z]{1,8}$/i.test(k) && Number.isFinite(+v)) o[k] = Math.trunc(+v);
  const s = JSON.stringify(o);
  return s.length <= 300 ? s : "{}";
}

export function nouveauCode() {
  const a = crypto.getRandomValues(new Uint8Array(4));
  return [...a].map((n) => LETTRES[n % LETTRES.length]).join("");
}

export function jeton() {
  return [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Prénom ou nom d'équipe : court, sans balises ni caractères de contrôle.
export function nettoieNom(s) {
  return String(s || "").replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 16);
}

// Réglages envoyés par la tablette de l'adulte : on ne garde que ce que le jeu utilise.
export function nettoieReglages(jeu, r) {
  r = r && typeof r === "object" ? r : {};
  if (jeu === "course-additions" || jeu === "course-multiplications") {
    const qs = Array.isArray(r.qs) ? r.qs.slice(0, 20)
      .map((q) => (Array.isArray(q) ? [Math.trunc(+q[0]) || 0, Math.trunc(+q[1]) || 0] : [0, 0]))
      .map(([a, b]) => [Math.max(0, Math.min(20, a)), Math.max(0, Math.min(20, b))]) : [];
    const table = r.table === "tout" || r.table === "mix" ? r.table : Math.max(0, Math.min(10, Math.trunc(+r.table) || 0));
    return { table, qs };
  }
  if (jeu === "tape-taupe") {
    const ent = (v, a, b) => Math.max(a, Math.min(b, Math.trunc(+v) || 0));
    const un = (v, liste, def) => (liste.includes(v) ? v : def);
    const qs = Array.isArray(r.qs) ? r.qs.slice(0, 15).map((q) => ({
      a: ent(q && q.a, 0, 999), b: ent(q && q.b, 0, 999), s: ent(q && q.s, 0, 1998),
      op: un(q && q.op, ["add", "sub"], "add"),
      v: (Array.isArray(q && q.v) ? q.v : []).slice(0, 5).map((x) => ent(x, 0, 2100)),
    })) : [];
    return {
      op: un(r.op, ["add", "sub", "mix"], "add"), level: un(r.level, ["sans", "avec", "mix"], "mix"),
      n: ent(r.n, 3, 5), min: ent(r.min, 0, 999), max: ent(r.max, 0, 999), expl: !!r.expl, qs,
    };
  }
  return {};
}
