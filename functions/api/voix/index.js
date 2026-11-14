// GET /api/voix → { voix: { cle: version } } : la liste des voix enregistrées, lue par /outils/voix.js.
import { base } from "../../../lib/voix.js";

export async function onRequestGet({ env }) {
  let voix = {};
  try {
    const { results } = await (await base(env)).prepare("SELECT cle, maj FROM voix").all();
    for (const r of results) voix[r.cle] = r.maj;
  } catch (e) { voix = {}; }
  return new Response(JSON.stringify({ voix }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60" },
  });
}
