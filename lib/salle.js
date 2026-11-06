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

export const JEUX = new Set(["course-additions"]);
export const MAX_JOUEURS = 8;
export const DUREE_VIE = 24 * 3600 * 1000;      // salle effacée après 24 h
export const ABSENT = 25 * 1000;                // tablette qui ne donne plus de nouvelles (avant le départ)
export const LETTRES = "ABCDEFGHJKMNPQRSTUVWXYZ"; // sans I, L, O (confusions avec 1, 0)
export const CODE_RE = /^[A-Z]{4}$/;

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
  if (jeu === "course-additions") {
    const qs = Array.isArray(r.qs) ? r.qs.slice(0, 20)
      .map((q) => (Array.isArray(q) ? [Math.trunc(+q[0]) || 0, Math.trunc(+q[1]) || 0] : [0, 0]))
      .map(([a, b]) => [Math.max(0, Math.min(20, a)), Math.max(0, Math.min(20, b))]) : [];
    const table = r.table === "tout" ? "tout" : Math.max(0, Math.min(10, Math.trunc(+r.table) || 0));
    return { table, qs };
  }
  return {};
}
