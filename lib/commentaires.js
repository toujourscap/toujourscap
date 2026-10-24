// Outils partagés pour les commentaires (base Cloudflare D1 liée sous le nom DB).

export const SCHEMA = `CREATE TABLE IF NOT EXISTS commentaires (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page TEXT NOT NULL,
  nom TEXT NOT NULL,
  message TEXT NOT NULL,
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  approuve INTEGER NOT NULL DEFAULT 0
)`;

let pret = false;
export async function db(env) {
  if (!env.DB) throw new Error("Base D1 non reliée (liaison DB manquante)");
  if (!pret) {
    await env.DB.prepare(SCHEMA).run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_page ON commentaires (page, approuve)").run();
    pret = true;
  }
  return env.DB;
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export const PAGE_RE = /^[a-z0-9-]{1,120}$/;
