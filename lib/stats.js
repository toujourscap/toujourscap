// Statistiques de visite (tables « vues » et « jeux_ev » dans la base D1 liée sous le nom DB).

export const SCHEMA_VUES = [
  `CREATE TABLE IF NOT EXISTS vues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jour TEXT NOT NULL,
    page TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT '',
    appareil TEXT NOT NULL DEFAULT '',
    visiteur TEXT NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS idx_vues_jour ON vues (jour)",
  // Événements des jeux : ouvert, commence, fin, duree (valeur = secondes), doc, word, impr.
  `CREATE TABLE IF NOT EXISTS jeux_ev (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jour TEXT NOT NULL,
    heure INTEGER,
    jeu TEXT NOT NULL,
    type TEXT NOT NULL,
    valeur INTEGER NOT NULL DEFAULT 0,
    ses TEXT NOT NULL DEFAULT '',
    visiteur TEXT NOT NULL DEFAULT ''
  )`,
  "CREATE INDEX IF NOT EXISTS idx_jeux_ev_jour ON jeux_ev (jour)",
];

// Colonnes ajoutées le 26/11/2026 (ALTER TABLE échoue si la colonne existe déjà : on ignore).
const COLONNES = ["vid TEXT", "duree INTEGER", "heure INTEGER", "pays TEXT", "region TEXT", "nouveau INTEGER"];

let pret = false;
export async function prepareStats(base) {
  if (pret) return;
  for (const q of SCHEMA_VUES) await base.prepare(q).run();
  for (const c of COLONNES) {
    try { await base.prepare(`ALTER TABLE vues ADD COLUMN ${c}`).run(); } catch { /* déjà là */ }
  }
  await base.prepare("CREATE INDEX IF NOT EXISTS idx_vues_vid ON vues (vid)").run();
  pret = true;
}

// Date du jour à l'heure de Paris, au format AAAA-MM-JJ.
export function jourParis(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
// Heure de Paris (0 à 23).
export function heureParis(date = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23" }).format(date)) % 24;
}

// Provenance → [catégorie, nom lisible].
const REGLES = [
  [/(^|\.)google\.|googlequicksearchbox/, "Moteurs de recherche", "Google"],
  [/(^|\.)bing\.com$/, "Moteurs de recherche", "Bing"],
  [/qwant/, "Moteurs de recherche", "Qwant"],
  [/duckduckgo/, "Moteurs de recherche", "DuckDuckGo"],
  [/ecosia/, "Moteurs de recherche", "Ecosia"],
  [/yahoo/, "Moteurs de recherche", "Yahoo"],
  [/lilo\.org|startpage|search\.brave|yandex|baidu|seznam|search\./, "Moteurs de recherche", null],
  [/pinterest|^pin\.it$/, "Pinterest", "Pinterest"],
  [/instagram/, "Instagram", "Instagram"],
  [/facebook|^fb\.|messenger|^m\.me$/, "Facebook", "Facebook"],
  [/chatgpt|openai|perplexity|claude\.ai|gemini\.google|copilot|mistral|^chat\./, "Assistants IA", null],
  [/^mail\.|webmail|outlook|^gm$|android\.gm$|zimbra|laposte|messagerie|courrier|^mail$|thunderbird/, "Messagerie (e-mail)", null],
  [/(^|\.)ac-[a-z-]+\.fr$|education\.gouv|eduscol|reseau-canope|(^|\.)ent\d*\.|e-?primo|eclat-bfc|index-education|pronote|beneylu|toutatice|monbureaunumerique|ecollege|educonnect|tribu|magistere/, "Éducation nationale / ENT", null],
  [/youtube|youtu\.be/, "YouTube", "YouTube"],
  [/^t\.co$|twitter|(^|\.)x\.com$/, "X (Twitter)", "X"],
  [/linkedin|lnkd\.in/, "LinkedIn", "LinkedIn"],
  [/whatsapp|telegram|signal|snapchat|tiktok/, "Autres réseaux et messageries", null],
  [/toujourscap\.pages\.dev$/, "Accès direct ou favori", null],
];
export function categorie(source) {
  const s = String(source || "").toLowerCase();
  if (!s) return ["Accès direct ou favori", ""];
  for (const [re, cat, nom] of REGLES) if (re.test(s)) return [cat, nom || s];
  return ["Autres sites", s];
}
