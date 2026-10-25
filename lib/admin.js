// Outils partagés des pages /admin/* (identifiant « admin », mot de passe = variable ADMIN_PASSWORD).

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function egal(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function autorise(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const h = request.headers.get("authorization") || "";
  if (!h.startsWith("Basic ")) return false;
  let decode;
  try { decode = new TextDecoder().decode(Uint8Array.from(atob(h.slice(6)), (c) => c.charCodeAt(0))); } catch { return false; }
  const i = decode.indexOf(":");
  return egal(decode.slice(0, i), "admin") & egal(decode.slice(i + 1), env.ADMIN_PASSWORD);
}

export const refus = (env) => new Response(
  env.ADMIN_PASSWORD ? "Accès réservé." : "Mot de passe ADMIN_PASSWORD non configuré dans Cloudflare.",
  { status: 401, headers: { "www-authenticate": 'Basic realm="Moderation", charset="UTF-8"', "content-type": "text/plain; charset=utf-8" } });

// Le cookie « tc_admin » marque l'appareil de l'administrateur : ses propres visites ne sont pas comptées.
export const page = (titre, actif, corps) => new Response(`<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${titre}</title>
<style>
body{margin:0;background:#fbf7f0;color:#23302c;font:16px/1.55 system-ui,sans-serif}
main{max-width:820px;margin:0 auto;padding:24px 16px}
h1{font-size:1.6rem;margin:0 0 4px}h2{font-size:1.15rem;margin:32px 0 12px}
nav.adm{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px}
nav.adm a{white-space:nowrap;padding:6px 14px;border-radius:999px;border:1px solid #e7e0d4;background:#fff;text-decoration:none;color:#23302c;font-weight:600}
nav.adm a[aria-current]{background:#1f6f5c;border-color:#1f6f5c;color:#fff}
.c{background:#fff;border:1px solid #e7e0d4;border-radius:12px;padding:14px 16px;margin-bottom:12px}
.m{color:#66716d;font-size:.9rem}.txt{white-space:pre-wrap;margin:8px 0 12px}
form{display:inline}button{border:0;border-radius:999px;padding:8px 16px;font-weight:700;cursor:pointer;margin-right:6px}
.ok{background:#1f6f5c;color:#fff}.no{background:#f3d9cf;color:#7a2e12}.vide{color:#66716d}
a{color:#1f6f5c}
.tuiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
.tuile{background:#fff;border:1px solid #e7e0d4;border-radius:12px;padding:12px 16px}
.tuile b{display:block;font-size:1.8rem;line-height:1.2}.tuile span{color:#66716d;font-size:.9rem}
.jours{display:flex;align-items:flex-end;gap:2px;height:140px;background:#fff;border:1px solid #e7e0d4;border-radius:12px;padding:12px 10px 0}
.jours div{flex:1;background:#1f6f5c;border-radius:3px 3px 0 0;min-height:2px;opacity:.85}
.jours div:hover{opacity:1}
.axe{display:flex;justify-content:space-between;color:#66716d;font-size:.8rem;margin-top:4px}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e7e0d4;border-radius:12px;overflow:hidden}
td,th{padding:8px 12px;border-bottom:1px solid #f0ebe2;text-align:left;font-size:.95rem}
th{color:#66716d;font-weight:600}td.n,th.n{text-align:right;white-space:nowrap}
td a{word-break:break-word}
.barre{height:6px;background:#d8ebe5;border-radius:3px;margin-top:4px}.barre i{display:block;height:100%;background:#1f6f5c;border-radius:3px}
</style></head><body><main>
<nav class="adm"><a href="/admin/stats"${actif === "stats" ? ' aria-current="page"' : ""}>Statistiques</a><a href="/admin/commentaires"${actif === "commentaires" ? ' aria-current="page"' : ""}>Commentaires</a><a href="/">Voir le site</a></nav>
${corps}</main></body></html>`,
  { headers: [
    ["content-type", "text/html; charset=utf-8"], ["cache-control", "no-store"],
    ["set-cookie", "tc_admin=1; Path=/; Max-Age=31536000; Secure; SameSite=Lax; HttpOnly"],
    // Lisible par le site : affiche le lien « Admin » dans le menu, uniquement sur cet appareil.
    ["set-cookie", "tc_moi=1; Path=/; Max-Age=31536000; Secure; SameSite=Lax"],
  ] });
