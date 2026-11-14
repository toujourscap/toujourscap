// Voix enregistrées de Fabrice (studio /admin/studio), rangées dans la base D1 (liaison DB).
export const CLE_RE = /^[a-z0-9-]{1,80}$/;

let pret = false;
export async function base(env) {
  if (!env.DB) throw new Error("Base D1 non reliée (liaison DB manquante)");
  if (!pret) {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS voix (
      cle TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      audio TEXT NOT NULL,
      maj INTEGER NOT NULL
    )`).run();
    pret = true;
  }
  return env.DB;
}

export function enBase64(buf) {
  const o = new Uint8Array(buf); let s = "";
  for (let i = 0; i < o.length; i += 0x8000) s += String.fromCharCode.apply(null, o.subarray(i, i + 0x8000));
  return btoa(s);
}

export function deBase64(b64) {
  const s = atob(b64), o = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) o[i] = s.charCodeAt(i);
  return o;
}
