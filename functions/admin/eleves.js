// /admin/eleves : « Mes élèves » — ce que fait chaque élève dans les jeux (identifiant « admin », mot de passe ADMIN_PASSWORD).
// Le serveur ne connaît que des pseudos d'animaux. Les vrais prénoms sont écrits et gardés
// dans le navigateur de l'enseignant (localStorage « suivi-prenoms »), jamais envoyés.
import { esc, autorise, refus, page } from "../../lib/admin.js";
import { json } from "../../lib/commentaires.js";
import { base, codeClasse, nouveauCode, ANIMAUX, ANIMAL, volCarnet, GARDE } from "../../lib/suivi.js";

const titre = "Mes élèves";

export async function onRequestGet({ request, env }) {
  if (!autorise(request, env)) return refus(env);
  let db;
  try { db = await base(env); } catch {
    return page(titre, "eleves", `<h1>${titre}</h1><p>La base D1 n'est pas encore reliée au site (liaison <code>DB</code>).</p>`);
  }
  const u = new URL(request.url);

  // Détail d'un élève (appelé par la page en JavaScript)
  const pseudo = u.searchParams.get("pseudo");
  if (pseudo) {
    if (!ANIMAL[pseudo]) return json({ ok: false }, 404);
    const { results } = await db.prepare("SELECT * FROM suivi_vols WHERE pseudo = ? ORDER BY t DESC LIMIT 1000").bind(pseudo).all();
    return json({ ok: true, vols: results.map(volCarnet) });
  }

  await db.prepare("DELETE FROM suivi_vols WHERE t < ?").bind(Date.now() - GARDE).run();
  const code = await codeClasse(db, true);
  const semaine = Date.now() - 7 * 86400000;
  const { results: eleves } = await db.prepare(`SELECT e.pseudo, e.cree, COUNT(v.id) AS vols, MAX(v.t) AS dernier,
      SUM(CASE WHEN v.t >= ? THEN 1 ELSE 0 END) AS semaine, COUNT(DISTINCT v.jeu) AS jeux
    FROM suivi_eleves e LEFT JOIN suivi_vols v ON v.pseudo = e.pseudo GROUP BY e.pseudo`).bind(semaine).all();
  const donnees = {
    code,
    eleves: eleves.filter((e) => ANIMAL[e.pseudo]).map((e) => ({ ...ANIMAL[e.pseudo], vols: e.vols, dernier: e.dernier, semaine: e.semaine || 0, jeux: e.jeux })),
    libres: ANIMAUX.filter(([id]) => !eleves.some((e) => e.pseudo === id)).map(([id, emoji, nom]) => ({ id, emoji, nom })),
  };
  const data = JSON.stringify(donnees).replace(/</g, "\\u003c");

  return page(titre, "eleves", `<style>
.code{font:800 2rem/1 ui-monospace,monospace;letter-spacing:.3em;background:#fff;border:2px dashed #1f6f5c;border-radius:12px;padding:8px 16px;display:inline-block}
input.pr{font:inherit;padding:6px 10px;border:1px solid #d9d1c3;border-radius:8px;width:100%;max-width:220px}
.em{font-size:1.6rem;line-height:1}
.libres{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
.libres button{background:#fff;border:1px solid #e7e0d4;font-weight:600}
.libres button:hover{background:#d8ebe5}
.fiche{margin-top:20px}
.fiche h2{display:flex;align-items:center;gap:10px}
td.bon{color:#1f6f5c;font-weight:700}td.faible{color:#a23b17;font-weight:700}
details summary{cursor:pointer;font-weight:600}
textarea{width:100%;min-height:120px;font:14px ui-monospace,monospace;border:1px solid #d9d1c3;border-radius:8px;padding:8px}
.sec{background:#fff;border:1px solid #e7e0d4;color:#23302c}
#etiquettes{display:none}
@media print{
  body *{visibility:hidden}
  #etiquettes,#etiquettes *{visibility:visible}
  #etiquettes{display:grid!important;position:absolute;inset:0;grid-template-columns:repeat(3,1fr);gap:8mm;padding:8mm}
  .etq{border:1.5px dashed #555;border-radius:10px;padding:6mm;text-align:center;font:600 14pt system-ui,sans-serif;break-inside:avoid}
  .etq span{display:block;font-size:40pt;line-height:1.1}.etq b{display:block;font-size:18pt}.etq small{font-size:10pt;color:#555}
}
</style>
<h1>👩‍🏫 ${titre}</h1>
<p class="m">Ce que font tes élèves dans les jeux du site. En ligne, chaque élève n'est qu'un <b>animal</b> : les vrais prénoms que tu écris ici restent <b>seulement dans ce navigateur</b> (jamais envoyés). Résultats effacés automatiquement au bout de 400 jours.</p>

<h2>1. Le code de la classe</h2>
<p>Les élèves l'écrivent une fois dans <a href="/post/la-tour-de-controle/" target="_blank">La tour de contrôle</a> (bouton « 🏫 Mon enseignant m'a donné un code »), puis choisissent leur animal.</p>
<p><span class="code">${esc(code)}</span>
<form method="post" onsubmit="return confirm('Changer le code ? Les appareils des élèves devront saisir le nouveau code (les résultats sont gardés).')"><button class="sec" name="action" value="code">Changer le code</button></form></p>

<h2>2. Mes élèves</h2>
<div id="liste"></div>
<details style="margin-top:12px"><summary>➕ Ajouter des animaux</summary>
  <p class="m">Clique sur un animal pour l'ajouter à la classe, ou ajoute-en plusieurs d'un coup.</p>
  <div class="libres" id="libres"></div>
  <form method="post"><input type="hidden" name="action" value="plusieurs"><label>Ajouter <input name="n" type="number" min="1" max="40" value="5" style="width:70px"> animaux</label> <button class="ok">Ajouter</button></form>
</details>
<p style="margin-top:12px"><button class="sec" type="button" id="imprimer">🖨️ Imprimer les étiquettes (animal + prénom)</button></p>

<div id="fiche" class="fiche"></div>

<h2>3. Changer d'appareil</h2>
<details><summary>Copier / coller la liste des prénoms</summary>
  <p class="m">Pour retrouver les prénoms sur un autre ordinateur : copie cette liste, puis colle-la sur l'autre appareil (page « Mes élèves ») et clique « Enregistrer ».</p>
  <textarea id="corresp" spellcheck="false"></textarea>
  <p><button class="ok" type="button" id="enreg">Enregistrer</button> <button class="sec" type="button" id="copier">📋 Copier</button> <span class="m" id="msg"></span></p>
</details>
<details style="margin-top:12px"><summary>Tout effacer</summary>
  <form method="post" onsubmit="return confirm('Effacer TOUS les animaux et TOUS les résultats de la classe ?')"><button class="no" name="action" value="tout">Effacer tous les élèves et leurs résultats</button></form>
</details>

<div id="etiquettes"></div>

<script>window.TDC_SANS_UI = true;</script>
<script src="/outils/tour-de-controle.js"></script>
<script>
var D = ${data};
var CLE = "suivi-prenoms";
var $ = function (id) { return document.getElementById(id); };
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function prenoms() { try { return JSON.parse(localStorage.getItem(CLE) || "{}") || {}; } catch (e) { return {}; } }
function garder(p) { try { localStorage.setItem(CLE, JSON.stringify(p)); } catch (e) {} }
var INFO = {}; (window.TDC && TDC.JEUX || []).forEach(function (z) { z[1].forEach(function (j) { INFO[j[0]] = j[1]; }); });
function titreJeu(j) { return INFO[j] || j.replace(/-/g, " ").replace(/^./, function (c) { return c.toUpperCase(); }); }
function jour(t) { if (!t) return "—"; var d = new Date(t); return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }) + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); }
function duree(s) { s = Math.round(s || 0); var m = Math.round(s / 60); return m < 1 ? s + " s" : m < 60 ? m + " min" : Math.floor(m / 60) + " h " + String(m % 60).padStart(2, "0"); }
function pct(v) { return (typeof v.s === "number" && v.n) ? Math.max(0, Math.min(1, v.s / v.n)) : (v.g === true ? 1 : v.g === false ? 0 : null); }
function resultat(v) {
  if (v.type === "seance") return "Séance (" + duree(v.dur) + ")";
  if (typeof v.s === "number" && v.n) return v.s + " / " + v.n + " (" + Math.round(100 * pct(v)) + " %)";
  if (typeof v.s === "number") return String(v.s);
  if (v.g === true) return "Gagné"; if (v.g === false) return "Perdu";
  return "Joué";
}

function liste() {
  var P = prenoms();
  var L = D.eleves.slice().sort(function (a, b) { return (P[a.id] || "~" + a.nom).localeCompare(P[b.id] || "~" + b.nom, "fr"); });
  $("liste").innerHTML = L.length ? '<table><tr><th>Animal</th><th>Prénom (sur cet appareil)</th><th class="n">Parties</th><th class="n">7 jours</th><th>Dernière partie</th><th></th></tr>' +
    L.map(function (e) {
      return '<tr><td><span class="em">' + e.emoji + '</span> ' + esc(e.nom) + '</td><td><input class="pr" data-id="' + e.id + '" value="' + esc(P[e.id] || "") + '" placeholder="Prénom de l\\'élève" maxlength="40"></td>' +
        '<td class="n">' + e.vols + '</td><td class="n">' + e.semaine + '</td><td>' + jour(e.dernier) + '</td>' +
        '<td class="n"><button class="ok" type="button" data-voir="' + e.id + '">Voir</button>' +
        '<form method="post" onsubmit="return confirm(\\'Retirer ' + esc(e.nom) + ' de la classe et effacer ses résultats ?\\')"><input type="hidden" name="id" value="' + e.id + '"><button class="no" name="action" value="retirer" title="Retirer">✕</button></form></td></tr>';
    }).join("") + "</table>"
    : '<p class="vide">Aucun élève pour l\\'instant : ajoute des animaux ci-dessous (un par élève).</p>';
  $("libres").innerHTML = D.libres.map(function (a) { return '<form method="post"><input type="hidden" name="action" value="ajouter"><input type="hidden" name="id" value="' + a.id + '"><button title="Ajouter ' + esc(a.nom) + '">' + a.emoji + " " + esc(a.nom) + "</button></form>"; }).join("");
  annexes();
}
function annexes() {
  var P = prenoms();
  var L = D.eleves.slice().sort(function (a, b) { return (P[a.id] || "~" + a.nom).localeCompare(P[b.id] || "~" + b.nom, "fr"); });
  $("corresp").value = L.filter(function (e) { return P[e.id]; }).map(function (e) { return e.id + " = " + P[e.id]; }).join("\\n");
  $("etiquettes").innerHTML = L.map(function (e) { return '<div class="etq"><span>' + e.emoji + "</span><b>" + esc(e.nom) + "</b>" + esc(P[e.id] || "") + "<br><small>Code de la classe : " + esc(D.code) + "</small></div>"; }).join("");
}
$("liste").addEventListener("input", function (e) {
  var i = e.target.closest("input.pr"); if (!i) return;
  var P = prenoms(), v = i.value.trim(); if (v) P[i.dataset.id] = v; else delete P[i.dataset.id]; garder(P); annexes();
});
$("liste").addEventListener("click", function (e) { var b = e.target.closest("[data-voir]"); if (b) fiche(b.dataset.voir); });

function fiche(id) {
  var e = D.eleves.filter(function (x) { return x.id === id; })[0]; if (!e) return;
  var P = prenoms(), nom = P[id] || e.nom;
  $("fiche").innerHTML = '<h2><span class="em">' + e.emoji + "</span> " + esc(nom) + ' <span class="m">(' + esc(e.nom) + ")</span></h2><p class='m'>Chargement…</p>";
  $("fiche").scrollIntoView({ behavior: "smooth" });
  fetch("?pseudo=" + encodeURIComponent(id), { credentials: "same-origin" }).then(function (r) { return r.json(); }).then(function (d) {
    var vols = d.vols || [], parJeu = {};
    vols.forEach(function (v) { (parJeu[v.j] = parJeu[v.j] || []).push(v); });
    var temps = vols.reduce(function (s, v) { return s + (v.dur || 0); }, 0);
    var jeux = Object.keys(parJeu).sort(function (a, b) { return parJeu[b][0].t - parJeu[a][0].t; });
    var resume = jeux.map(function (j) {
      var L = parJeu[j], notes = L.map(pct).filter(function (q) { return q != null; });
      var moy = notes.length ? Math.round(100 * notes.reduce(function (s, q) { return s + q; }, 0) / notes.length) : null;
      var der = notes.length ? Math.round(100 * notes[0]) : null;
      return "<tr><td>" + esc(titreJeu(j)) + '</td><td class="n">' + L.length + '</td><td class="n">' + (moy == null ? "—" : moy + " %") + '</td><td class="n ' + (der == null ? "" : der >= 60 ? "bon" : "faible") + '">' + (der == null ? "—" : der + " %") + "</td><td>" + jour(L[0].t) + "</td></tr>";
    }).join("");
    var detail = vols.slice(0, 300).map(function (v) {
      var q = pct(v);
      return "<tr><td>" + jour(v.t) + "</td><td>" + esc(titreJeu(v.j)) + '</td><td class="' + (q == null ? "" : q >= .6 ? "bon" : "faible") + '">' + esc(resultat(v)) + "</td><td>" + esc(v.niv || "") + "</td><td>" + esc(v.d || "") + '</td><td class="n">' + duree(v.dur) + "</td></tr>";
    }).join("");
    $("fiche").innerHTML = '<h2><span class="em">' + e.emoji + "</span> " + esc(nom) + ' <span class="m">(' + esc(e.nom) + ")</span></h2>" +
      '<div class="tuiles"><div class="tuile"><b>' + vols.length + '</b><span>parties</span></div><div class="tuile"><b>' + jeux.length + '</b><span>jeux différents</span></div><div class="tuile"><b>' + duree(temps) + "</b><span>temps de jeu</span></div></div>" +
      (vols.length ? "<h2>Par jeu</h2><table><tr><th>Jeu</th><th class='n'>Parties</th><th class='n'>Moyenne</th><th class='n'>Dernière</th><th>Dernière fois</th></tr>" + resume + "</table>" +
        "<h2>Toutes les parties</h2><div style='overflow:auto'><table><tr><th>Quand</th><th>Jeu</th><th>Résultat</th><th>Niveau</th><th>Bilan</th><th class='n'>Durée</th></tr>" + detail + "</table></div>" +
        '<p><form method="post" onsubmit="return confirm(\\'Effacer les résultats de ' + esc(nom) + ' ? (l’animal reste dans la classe)\\')"><input type="hidden" name="id" value="' + id + '"><button class="no" name="action" value="vider">Effacer ses résultats</button></form></p>'
        : '<p class="vide">Pas encore de partie enregistrée avec cet animal.</p>');
  }, function () { $("fiche").innerHTML = "<p>Impossible de charger les résultats.</p>"; });
}

$("enreg").addEventListener("click", function () {
  var P = prenoms(), n = 0;
  $("corresp").value.split(/\\n/).forEach(function (l) { var m = l.match(/^\\s*([a-z]+)\\s*=\\s*(.+?)\\s*$/); if (m) { P[m[1]] = m[2].slice(0, 40); n++; } });
  garder(P); liste(); $("msg").textContent = n + " prénom" + (n > 1 ? "s" : "") + " enregistré" + (n > 1 ? "s" : "") + " sur cet appareil.";
});
$("copier").addEventListener("click", function () { $("corresp").select(); try { navigator.clipboard.writeText($("corresp").value); } catch (e) { document.execCommand("copy"); } $("msg").textContent = "Liste copiée."; });
$("imprimer").addEventListener("click", function () { liste(); print(); });
liste();
</script>`);
}

export async function onRequestPost({ request, env }) {
  if (!autorise(request, env)) return refus(env);
  const f = await request.formData();
  const action = f.get("action"), id = String(f.get("id") || "");
  const db = await base(env);
  const maintenant = Date.now();
  if (action === "code") {
    await db.prepare("INSERT OR REPLACE INTO suivi_reglages (cle, valeur) VALUES ('code', ?)").bind(nouveauCode()).run();
  } else if (action === "ajouter" && ANIMAL[id]) {
    await db.prepare("INSERT OR IGNORE INTO suivi_eleves (pseudo, cree) VALUES (?, ?)").bind(id, maintenant).run();
  } else if (action === "plusieurs") {
    const n = Math.max(1, Math.min(40, Number(f.get("n")) || 0));
    const { results } = await db.prepare("SELECT pseudo FROM suivi_eleves").all();
    const pris = new Set(results.map((r) => r.pseudo));
    const libres = ANIMAUX.map(([a]) => a).filter((a) => !pris.has(a)).slice(0, n);
    if (libres.length) await db.batch(libres.map((a) => db.prepare("INSERT OR IGNORE INTO suivi_eleves (pseudo, cree) VALUES (?, ?)").bind(a, maintenant)));
  } else if (action === "retirer" && ANIMAL[id]) {
    await db.batch([db.prepare("DELETE FROM suivi_vols WHERE pseudo = ?").bind(id), db.prepare("DELETE FROM suivi_eleves WHERE pseudo = ?").bind(id)]);
  } else if (action === "vider" && ANIMAL[id]) {
    await db.prepare("DELETE FROM suivi_vols WHERE pseudo = ?").bind(id).run();
  } else if (action === "tout") {
    await db.batch([db.prepare("DELETE FROM suivi_vols"), db.prepare("DELETE FROM suivi_eleves")]);
  }
  return Response.redirect(new URL(new URL(request.url).pathname, request.url).toString(), 303);
}
