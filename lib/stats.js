// Statistiques de visite (table « vues » dans la base D1 liée sous le nom DB).

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
];

// Date du jour à l'heure de Paris, au format AAAA-MM-JJ.
export function jourParis(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
