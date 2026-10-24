// /admin/stats : statistiques de visite (identifiant « admin », mot de passe = variable ADMIN_PASSWORD).
import { db } from "../../lib/commentaires.js";
import { SCHEMA_VUES, jourParis } from "../../lib/stats.js";
import { esc, autorise, refus, page } from "../../lib/admin.js";

const PERIODES = { 7: "7 jours", 30: "30 jours", 365: "12 mois" };
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const nb = (n) => Number(n || 0).toLocaleString("fr-FR");
const jourFr = (j) => { const [a, m, d] = j.split("-"); return `${Number(d)} ${MOIS[Number(m) - 1]}`; };
const moisFr = (m) => { const [a, mm] = m.split("-"); return `${MOIS[Number(mm) - 1]} ${a.slice(2)}`; };

function tableau(lignes, cols, vide) {
  if (!lignes.length) return `<p class="vide">${vide}</p>`;
  const max = Math.max(...lignes.map((l) => l.vues));
  return `<table><tr>${cols.map((c, i) => `<th${i ? ' class="n"' : ""}>${c}</th>`).join("")}</tr>
${lignes.map((l) => `<tr><td>${l.libelle}<div class="barre"><i style="width:${Math.round((l.vues / max) * 100)}%"></i></div></td>${l.chiffres.map((c) => `<td class="n">${c}</td>`).join("")}</tr>`).join("\n")}</table>`;
}

export async function onRequestGet({ request, env }) {
  if (!autorise(request, env)) return refus(env);
  let base;
  try {
    base = await db(env);
    for (const q of SCHEMA_VUES) await base.prepare(q).run();
  } catch {
    return page("Statistiques", "stats", "<h1>Statistiques</h1><p>La base D1 n'est pas encore reliée au site (liaison <code>DB</code>).</p>");
  }

  const url = new URL(request.url);
  const jours = PERIODES[url.searchParams.get("p")] ? Number(url.searchParams.get("p")) : 30;
  const aujourdhui = jourParis();
  const debut = jourParis(new Date(Date.now() - (jours - 1) * 86400000));

  // Titres des pages (fichier généré par build.py).
  let titres = {};
  try { titres = await (await env.ASSETS.fetch(new URL("/titres.json", url))).json(); } catch { /* titres indisponibles */ }

  const q = (sql, ...p) => base.prepare(sql).bind(...p).all().then((r) => r.results);
  const [[auj], [total], parJour, pages, sources, appareils] = await Promise.all([
    q("SELECT COUNT(*) AS vues, COUNT(DISTINCT visiteur) AS visiteurs FROM vues WHERE jour = ?", aujourdhui),
    q("SELECT COUNT(*) AS vues FROM vues WHERE jour >= ?", debut),
    q("SELECT jour, COUNT(*) AS vues, COUNT(DISTINCT visiteur) AS visiteurs FROM vues WHERE jour >= ? GROUP BY jour", debut),
    q("SELECT page, COUNT(*) AS vues, COUNT(DISTINCT jour || visiteur) AS visites FROM vues WHERE jour >= ? GROUP BY page ORDER BY vues DESC LIMIT 25", debut),
    q("SELECT source, COUNT(DISTINCT jour || visiteur) AS visites FROM vues WHERE jour >= ? GROUP BY source ORDER BY visites DESC LIMIT 12", debut),
    q("SELECT appareil, COUNT(DISTINCT jour || visiteur) AS visites FROM vues WHERE jour >= ? GROUP BY appareil ORDER BY visites DESC", debut),
  ]);
  const visites = parJour.reduce((s, j) => s + j.visiteurs, 0);

  // Courbe : une barre par jour (7 ou 30 jours) ou par mois (12 mois).
  const parCle = {};
  let cles = [];
  if (jours === 365) {
    for (const j of parJour) parCle[j.jour.slice(0, 7)] = (parCle[j.jour.slice(0, 7)] || 0) + j.visiteurs;
    const d = new Date(aujourdhui + "T12:00:00Z");
    for (let i = 11; i >= 0; i--) {
      const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
      cles.push(`${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, "0")}`);
    }
  } else {
    for (const j of parJour) parCle[j.jour] = j.visiteurs;
    for (let i = jours - 1; i >= 0; i--) cles.push(jourParis(new Date(Date.now() - i * 86400000)));
  }
  const fmt = jours === 365 ? moisFr : jourFr;
  const maxBarre = Math.max(1, ...cles.map((c) => parCle[c] || 0));
  const barres = cles.map((c) => {
    const v = parCle[c] || 0;
    return `<div style="height:${Math.max(1.5, (v / maxBarre) * 100)}%" title="${fmt(c)} : ${nb(v)} visite${v > 1 ? "s" : ""}"></div>`;
  }).join("");

  const nomPage = (p) => esc(p === "/" ? "Accueil" : titres[p] || p);
  const choix = Object.entries(PERIODES).map(([k, v]) =>
    `<a href="?p=${k}"${Number(k) === jours ? ' aria-current="page"' : ""}>${v}</a>`).join("");

  return page("Statistiques", "stats", `<h1>Statistiques</h1>
<p class="m">Visites de toujourscap.com. Tes propres visites, depuis les appareils où tu as ouvert l'admin, ne sont pas comptées.</p>
<nav class="adm" style="margin-top:16px">${choix}</nav>
<div class="tuiles">
  <div class="tuile"><b>${nb(auj.visiteurs)}</b><span>visiteurs aujourd'hui</span></div>
  <div class="tuile"><b>${nb(visites)}</b><span>visites sur ${PERIODES[jours]}</span></div>
  <div class="tuile"><b>${nb(total.vues)}</b><span>pages vues sur ${PERIODES[jours]}</span></div>
  <div class="tuile"><b>${visites ? (total.vues / visites).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) : "0"}</b><span>pages par visite</span></div>
</div>
<h2>Visites ${jours === 365 ? "par mois" : "par jour"}</h2>
<div class="jours">${barres}</div>
<div class="axe"><span>${fmt(cles[0])}</span><span>${fmt(cles[cles.length - 1])}</span></div>
<h2>Pages les plus vues</h2>
${tableau(pages.map((p) => ({ vues: p.vues, libelle: `<a href="${esc(p.page)}" target="_blank">${nomPage(p.page)}</a>`, chiffres: [nb(p.vues), nb(p.visites)] })),
    ["Page", "Vues", "Visites"], "Aucune visite pour l'instant.")}
<h2>D'où viennent les visiteurs</h2>
${tableau(sources.map((s) => ({ vues: s.visites, libelle: s.source ? esc(s.source) : "Accès direct ou favori", chiffres: [nb(s.visites)] })),
    ["Provenance", "Visites"], "Aucune donnée.")}
<h2>Appareils</h2>
${tableau(appareils.map((a) => ({ vues: a.visites, libelle: esc(a.appareil.charAt(0).toUpperCase() + a.appareil.slice(1)), chiffres: [`${Math.round((a.visites / Math.max(1, visites)) * 100)} %`] })),
    ["Appareil", "Part"], "Aucune donnée.")}
<p class="m" style="margin-top:28px">Les statistiques démarrent le jour de leur mise en ligne. Aucune adresse IP ni cookie de suivi : un visiteur n'est reconnu que pendant une journée.</p>`);
}
