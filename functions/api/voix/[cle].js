// GET /api/voix/<cle>?v=<version> → l'enregistrement (WAV). L'adresse change à chaque nouvel enregistrement,
// donc le navigateur peut le garder en cache longtemps.
import { base, CLE_RE, deBase64 } from "../../../lib/voix.js";

export async function onRequestGet({ params, env }) {
  const cle = String(params.cle || "");
  if (!CLE_RE.test(cle)) return new Response("Clé invalide", { status: 400 });
  let r = null;
  try { r = await (await base(env)).prepare("SELECT type, audio FROM voix WHERE cle = ?").bind(cle).first(); } catch (e) {}
  if (!r) return new Response("Voix absente", { status: 404, headers: { "cache-control": "no-store" } });
  return new Response(deBase64(r.audio), {
    headers: { "content-type": r.type, "cache-control": "public, max-age=31536000, immutable" },
  });
}
