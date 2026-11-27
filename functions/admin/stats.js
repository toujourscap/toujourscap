// /admin/stats : statistiques de visite (identifiant « admin », mot de passe = variable ADMIN_PASSWORD).
// Paramètres : p = 7 | 30 | 90 | 365 (jours), ou du / au (AAAA-MM-JJ) ; f = une page (/post/…/) ; csv = pages | jeux | sources | jours.
import { db } from "../../lib/commentaires.js";
import { prepareStats, jourParis, categorie } from "../../lib/stats.js";
import { esc, autorise, refus, page } from "../../lib/admin.js";

const PERIODES = { 7: "7 jours", 30: "30 jours", 90: "3 mois", 365: "12 mois" };
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const SEMAINE = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const nb = (n) => Math.round(Number(n || 0)).toLocaleString("fr-FR");
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : "–");
const jourFr = (j) => { const [, m, d] = j.split("-"); return `${Number(d)} ${MOIS[Number(m) - 1]}`; };
const jourLong = (j) => `${jourFr(j)} ${j.slice(0, 4)}`;
const moisFr = (m) => { const [a, mm] = m.split("-"); return `${MOIS[Number(mm) - 1]} ${a.slice(2)}`; };
const decale = (j, k) => { const [a, m, d] = j.split("-").map(Number); return new Date(Date.UTC(a, m - 1, d + k)).toISOString().slice(0, 10); };
const ecart = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function temps(s) {
  s = Math.round(Number(s || 0));
  if (!s) return "–";
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")}`;
  return `${Math.floor(s / 3600)} h ${String(Math.round((s % 3600) / 60)).padStart(2, "0")}`;
}

// Évolution par rapport à la période précédente.
function evol(a, b, inverse = false) {
  a = Number(a || 0); b = Number(b || 0);
  if (!b) return a ? '<em class="ev">nouveau</em>' : "";
  const d = Math.round(((a - b) / b) * 100);
  if (!d) return '<em class="ev">=</em>';
  const bon = inverse ? d < 0 : d > 0;
  return `<em class="ev ${bon ? "up" : "down"}">${d > 0 ? "↗ +" : "↘ "}${d} %</em>`;
}

let nTab = 0;
function tableau(lignes, cols, vide) {
  if (!lignes.length) return `<p class="vide">${vide}</p>`;
  const id = `t${++nTab}`;
  const max = Math.max(1, ...lignes.map((l) => l.poids || 0));
  return `<div class="tab"><button class="cp" data-t="${id}" title="Copier pour coller dans un tableur">📋 Copier</button><table id="${id}"><tr>${cols.map((c, i) => `<th${i ? ' class="n"' : ""}>${c}</th>`).join("")}</tr>
${lignes.map((l) => `<tr><td>${l.libelle}${l.poids != null ? `<div class="barre"><i style="width:${Math.round((l.poids / max) * 100)}%"></i></div>` : ""}</td>${l.chiffres.map((c) => `<td class="n">${c}</td>`).join("")}</tr>`).join("\n")}</table></div>`;
}

function barres(cles, valeurs, etiquette, libelles) {
  const max = Math.max(1, ...cles.map((c) => valeurs[c] || 0));
  const b = cles.map((c) => {
    const v = valeurs[c] || 0;
    return `<div style="height:${Math.max(1.5, (v / max) * 100)}%" title="${etiquette(c)} : ${nb(v)} visite${v > 1 ? "s" : ""}"></div>`;
  }).join("");
  const lab = libelles ? `<div class="lab">${libelles.map((l) => `<span>${l}</span>`).join("")}</div>` : "";
  return `<div class="jours">${b}</div>${lab}`;
}

function csv(nom, entetes, lignes) {
  const c = (x) => { const s = String(x ?? ""); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const txt = "﻿" + [entetes, ...lignes].map((l) => l.map(c).join(";")).join("\r\n");
  return new Response(txt, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${nom}.csv"`, "cache-control": "no-store" } });
}

let nomsPays = null;
function nomPays(code) {
  if (!code) return "Inconnu";
  try { nomsPays = nomsPays || new Intl.DisplayNames(["fr"], { type: "region" }); return nomsPays.of(code) || code; } catch { return code; }
}

// Calcule toutes les statistiques d'une période à partir des vues triées par jour, visiteur, id.
// f = filtre sur une page (ou "") : on ne garde alors que les visites passées par cette page.
function analyse(lignes, f) {
  const plus = (m, k, n = 1) => m.set(k, (m.get(k) || 0) + n);
  const liste = (m, nom) => [...m].map(([k, n]) => ({ [nom]: k, n })).sort((a, b) => b.n - a.n);
  const tot = { vues: 0, visites: 0, duree: null };
  const vis = { n: 0, une: 0, neufs: 0, connus: 0, pages: 0 };
  const jours = new Map(), pages = new Map(), sources = new Map(), pays = new Map(), regions = new Map(),
    heures = new Map(), semaine = new Map(), appareils = new Map(), entrees = new Map(), sorties = new Map(),
    avant = new Map(), apres = new Map();
  let dS = 0, dN = 0;
  for (let i = 0; i < lignes.length;) {
    // vs = les vues d'une même visite (même jour, même visiteur), dans l'ordre.
    let j = i;
    while (j < lignes.length && lignes[j].jour === lignes[i].jour && lignes[j].visiteur === lignes[i].visiteur) j++;
    const vs = lignes.slice(i, j);
    i = j;
    const vues = f ? vs.filter((r) => r.page === f) : vs;
    if (!vues.length) continue;

    // Totaux, visites par jour, pages les plus vues.
    tot.vues += vues.length;
    tot.visites++;
    plus(jours, vs[0].jour);
    const dejaCompte = new Set();
    for (const r of vues) {
      if (r.duree > 0) { dS += r.duree; dN++; }
      let p = pages.get(r.page);
      if (!p) pages.set(r.page, (p = { page: r.page, vues: 0, visites: 0, s: 0, k: 0 }));
      p.vues++;
      if (r.duree > 0) { p.s += r.duree; p.k++; }
      if (!dejaCompte.has(r.page)) { dejaCompte.add(r.page); p.visites++; }
    }

    // Première page de la visite (e) : provenance, pays, heure, appareil…
    const e = vs[0], nb = vs.length;
    vis.n++;
    vis.pages += nb;
    if (nb === 1) vis.une++;
    if (e.nouveau != null) { vis.connus++; if (e.nouveau === 1) vis.neufs++; }
    plus(sources, e.source);
    plus(pays, e.pays);
    plus(appareils, e.appareil);
    if (e.region != null) plus(regions, JSON.stringify([e.region, e.pays]));
    if (e.heure != null) plus(heures, e.heure);
    plus(semaine, new Date(e.jour + "T00:00:00Z").getUTCDay());
    let en = entrees.get(e.page);
    if (!en) entrees.set(e.page, (en = { page: e.page, n: 0, une: 0 }));
    en.n++;
    if (nb === 1) en.une++;
    if (nb > 1) plus(sorties, vs[nb - 1].page);

    // Avec un filtre : pages vues juste avant et juste après la page.
    if (f) for (let k = 0; k < nb; k++) if (vs[k].page === f) {
      if (k > 0 && vs[k - 1].page !== f) plus(avant, vs[k - 1].page);
      if (k < nb - 1 && vs[k + 1].page !== f) plus(apres, vs[k + 1].page);
    }
  }
  tot.duree = dN ? dS / dN : null;
  return {
    tot, vis,
    parJour: [...jours].map(([jour, visites]) => ({ jour, visites })),
    pagesL: [...pages.values()].map((p) => ({ page: p.page, vues: p.vues, visites: p.visites, duree: p.k ? p.s / p.k : null }))
      .sort((a, b) => b.vues - a.vues),
    sourcesL: [...sources].map(([source, n]) => ({ source, n })),
    paysL: liste(pays, "pays"),
    regionsL: [...regions].map(([k, n]) => { const [region, p] = JSON.parse(k); return { region, pays: p, n }; })
      .sort((a, b) => b.n - a.n),
    heuresL: [...heures].map(([heure, n]) => ({ heure, n })),
    semaineL: [...semaine].map(([w, n]) => ({ w, n })),
    appareilsL: liste(appareils, "appareil"),
    entreesL: [...entrees.values()].sort((a, b) => b.n - a.n),
    sortiesL: liste(sorties, "page"),
    avantL: liste(avant, "page"),
    apresL: liste(apres, "page"),
  };
}

export async function onRequestGet({ request, env }) {
  if (!autorise(request, env)) return refus(env);
  let base;
  try {
    base = await db(env);
    await prepareStats(base);
  } catch {
    return page("Statistiques", "stats", "<h1>Statistiques</h1><p>La base D1 n'est pas encore reliée au site (liaison <code>DB</code>).</p>");
  }
  nTab = 0;
  const url = new URL(request.url);
  const sp = url.searchParams;
  const aujourdhui = jourParis();

  // Période choisie et période précédente de même durée.
  let debut, fin, libelle, perso = false;
  if (DATE.test(sp.get("du") || "") && DATE.test(sp.get("au") || "") && sp.get("du") <= sp.get("au")) {
    debut = sp.get("du"); fin = sp.get("au") > aujourdhui ? aujourdhui : sp.get("au"); perso = true;
    libelle = `du ${jourLong(debut)} au ${jourLong(fin)}`;
  } else {
    const p = PERIODES[sp.get("p")] ? Number(sp.get("p")) : 30;
    fin = aujourdhui; debut = decale(aujourdhui, -(p - 1)); libelle = `sur ${PERIODES[p]}`;
  }
  const duree = ecart(debut, fin) + 1;
  const pfin = decale(debut, -1), pdebut = decale(pfin, -(duree - 1));
  const f = (sp.get("f") || "").startsWith("/") ? sp.get("f").slice(0, 200) : "";
  const lien = (x) => { const u = new URLSearchParams(sp); u.delete("csv"); for (const [k, v] of Object.entries(x)) v == null ? u.delete(k) : u.set(k, v); const s = u.toString(); return s ? `?${s}` : "?"; };

  // Titres des pages et des jeux, avec l'article de chaque jeu (fichiers écrits par build.py).
  let titres = {}, jeux = {};
  try { titres = await (await env.ASSETS.fetch(new URL("/titres.json", url))).json(); } catch { /* indisponible */ }
  try { jeux = await (await env.ASSETS.fetch(new URL("/jeux.json", url))).json(); } catch { /* indisponible */ }
  const nomPage = (p) => (p === "/" ? "Accueil" : titres[p] || p);
  const nomJeu = (j) => (jeux[j] ? jeux[j].titre : j.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()));

  const q = (sql, p) => base.prepare(sql).bind(...p).all().then((r) => r.results);
  const jeuxDe = f ? Object.keys(jeux).filter((j) => jeux[j].article === f) : null;
  const JF = jeuxDe ? ` AND jeu IN (${jeuxDe.map(() => "?").join(",") || "''"})` : "";
  const jf = jeuxDe || [];

  const SQL_JEUX = `SELECT jeu, SUM(type = 'ouvert') AS o, SUM(type = 'commence') AS c, SUM(type = 'fin') AS f,
  SUM(CASE WHEN type = 'duree' THEN valeur ELSE 0 END) AS d, SUM(type = 'doc') AS doc, SUM(type = 'word') AS w, SUM(type = 'impr') AS i
  FROM jeux_ev WHERE jour BETWEEN ? AND ?${JF}`;

  // Une seule lecture de la table vues par période ; tous les calculs se font ensuite en JavaScript (analyse).
  const COLS = "id, jour, visiteur, page, source, appareil, pays, region, nouveau, heure, duree";
  const lire = (d1, d2) => q(`SELECT ${COLS} FROM vues WHERE jour BETWEEN ? AND ? ORDER BY jour, visiteur, id`, [d1, d2]);
  const [lignes, plignes, jeuxL, [pjeux]] = await Promise.all([
    lire(debut, fin),
    lire(pdebut, pfin),
    q(`${SQL_JEUX} GROUP BY jeu ORDER BY c DESC, o DESC`, [debut, fin, ...jf]),
    q(SQL_JEUX, [pdebut, pfin, ...jf]),
  ]);
  const A = analyse(lignes, f), B = analyse(plignes, f);
  const tot = A.tot, ptot = B.tot, vis = A.vis, pvis = B.vis, parJour = A.parJour;
  const pagesL = f ? [] : A.pagesL.slice(0, 60), pagesP = f ? [] : B.pagesL;
  const sourcesL = A.sourcesL, paysL = A.paysL.slice(0, 15), regionsL = A.regionsL.slice(0, 15);
  const heuresL = A.heuresL, semaineL = A.semaineL, appareilsL = A.appareilsL;
  const entreesL = f ? [] : A.entreesL.slice(0, 15), sortiesL = f ? [] : A.sortiesL.slice(0, 15);
  const avantL = f ? A.avantL.slice(0, 10) : [], apresL = f ? A.apresL.slice(0, 10) : [];

  // Provenance regroupée.
  const cats = {}, details = {};
  for (const s of sourcesL) {
    const [cat, nom] = categorie(s.source);
    cats[cat] = (cats[cat] || 0) + s.n;
    if (nom) details[nom] = { cat, n: (details[nom]?.n || 0) + s.n };
  }
  const catsL = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  const detailsL = Object.entries(details).sort((a, b) => b[1].n - a[1].n).slice(0, 25);
  const tj = jeuxL.reduce((s, j) => ({ c: s.c + j.c, f: s.f + j.f, d: s.d + j.d, o: s.o + j.o }), { c: 0, f: 0, d: 0, o: 0 });

  // Export CSV (séparateur « ; » pour Excel en français).
  const nomFic = (x) => `stats-${x}-${debut}-${fin}`;
  switch (sp.get("csv")) {
    case "pages": return csv(nomFic("pages"), ["Page", "Adresse", "Vues", "Visites", "Temps moyen (s)", "Vues période précédente"],
      pagesL.map((p) => [nomPage(p.page), p.page, p.vues, p.visites, Math.round(p.duree || 0), pagesP.find((x) => x.page === p.page)?.vues || 0]));
    case "jeux": return csv(nomFic("jeux"), ["Jeu", "Ouvert", "Commencé", "Fini", "Temps de jeu (s)", "Documents ouverts", "Téléchargés", "Imprimés"],
      jeuxL.map((j) => [nomJeu(j.jeu), j.o, j.c, j.f, j.d, j.doc, j.w, j.i]));
    case "sources": return csv(nomFic("provenance"), ["Catégorie", "Site", "Visites"],
      Object.entries(details).sort((a, b) => b[1].n - a[1].n).map(([nom, d]) => [d.cat, nom, d.n]).concat([["Accès direct ou favori", "", cats["Accès direct ou favori"] || 0]]));
    case "jours": return csv(nomFic("jours"), ["Jour", "Visites"], parJour.sort((a, b) => (a.jour < b.jour ? -1 : 1)).map((j) => [j.jour, j.visites]));
  }

  // Courbe des visites : par jour jusqu'à 62 jours, sinon par mois.
  const parCle = {}, cles = [];
  const mensuel = duree > 62;
  for (const j of parJour) { const k = mensuel ? j.jour.slice(0, 7) : j.jour; parCle[k] = (parCle[k] || 0) + j.visites; }
  if (mensuel) { for (let m = debut.slice(0, 7); m <= fin.slice(0, 7); m = decale(m + "-01", 32).slice(0, 7)) cles.push(m); }
  else for (let j = debut; j <= fin; j = decale(j, 1)) cles.push(j);
  const fmt = mensuel ? moisFr : jourFr;

  const heures = {}; for (const h of heuresL) heures[h.heure] = h.n;
  const semaine = {}; for (const s of semaineL) semaine[(s.w + 6) % 7] = s.n;
  const nVis = vis.n || 0;

  // En-tête : périodes, dates, filtre.
  const choix = Object.entries(PERIODES).map(([k, v]) =>
    `<a href="${lien({ p: k, du: null, au: null })}"${!perso && libelle === `sur ${v}` ? ' aria-current="page"' : ""}>${v}</a>`).join("");
  const filtre = f ? `<div class="c filtre">🔎 Page : <b><a href="${esc(f)}" target="_blank">${esc(nomPage(f))}</a></b> <a class="m" href="${lien({ f: null })}">✖ voir toutes les pages</a></div>` : "";
  const lienPage = (p) => `<a href="${lien({ f: p })}" title="Statistiques de cette page">${esc(nomPage(p))}</a> <a class="ext" href="${esc(p)}" target="_blank" title="Ouvrir la page">↗</a>`;
  const exp = (x) => `<a class="csv" href="${lien({ csv: x })}">⬇ CSV</a>`;

  const tuile = (val, txt, ev = "") => `<div class="tuile"><b>${val}</b><span>${txt}</span>${ev ? `<div>${ev}</div>` : ""}</div>`;

  return page("Statistiques", "stats", `<style>
.ev{font-style:normal;font-size:.8rem;font-weight:700;color:#66716d}.ev.up{color:#1f6f5c}.ev.down{color:#b0452a}
.periode{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0 16px}.periode input{font:inherit;padding:5px 8px;border:1px solid #e7e0d4;border-radius:8px}
.periode button{background:#1f6f5c;color:#fff;padding:6px 14px}
.lab{display:flex;justify-content:space-between;color:#66716d;font-size:.75rem;margin-top:4px;padding:0 10px}.lab span{flex:1;min-width:0;text-align:center;white-space:nowrap}
.deux{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}.deux h2{margin-top:24px}
.tab{position:relative}.cp{position:absolute;right:6px;top:-34px;background:#fff;border:1px solid #e7e0d4;font-weight:600;padding:4px 10px;font-size:.8rem}
.csv{float:right;font-size:.85rem;font-weight:600;margin-top:4px}h2 .csv{float:none;margin-left:10px}
.ext{text-decoration:none;color:#66716d;font-size:.85rem}.filtre{margin:12px 0}
.ok-cp{background:#d8ebe5!important}
</style>
<h1>Statistiques</h1>
<p class="m">Visites de toujourscap.com ${esc(libelle)}, comparées aux ${duree} jours précédents (du ${jourLong(pdebut)} au ${jourLong(pfin)}). Tes propres visites, depuis les appareils où tu as ouvert l'admin, ne sont pas comptées.</p>
<nav class="adm" style="margin-top:16px">${choix}</nav>
<form class="periode" method="get">${f ? `<input type="hidden" name="f" value="${esc(f)}">` : ""}
  Du <input type="date" name="du" value="${debut}" max="${aujourdhui}"> au <input type="date" name="au" value="${fin}" max="${aujourdhui}"> <button>Afficher</button></form>
${filtre}
<div class="tuiles">
  ${tuile(nb(tot.visites), "visites", evol(tot.visites, ptot.visites))}
  ${tuile(nb(tot.vues), f ? "vues de cette page" : "pages vues", evol(tot.vues, ptot.vues))}
  ${f ? "" : tuile(nVis ? (vis.pages / nVis).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) : "0", "pages par visite", evol(nVis && vis.pages / nVis, pvis.n && pvis.pages / pvis.n))}
  ${tuile(temps(tot.duree), f ? "temps moyen sur la page" : "temps moyen sur une page", evol(tot.duree, ptot.duree))}
  ${tuile(pct(vis.une, nVis), "visites d'une seule page", evol(nVis && vis.une / nVis, pvis.n && pvis.une / pvis.n, true))}
  ${tuile(pct(vis.neufs, vis.connus), "nouveaux visiteurs", evol(vis.connus && vis.neufs / vis.connus, pvis.connus && pvis.neufs / pvis.connus))}
  ${tuile(nb(tj.c), "parties de jeu commencées", evol(tj.c, pjeux?.c))}
  ${tuile(nb(tj.f), "parties finies", evol(tj.f, pjeux?.f))}
  ${tuile(temps(tj.d), "temps de jeu au total", evol(tj.d, pjeux?.d))}
</div>

<h2>Visites ${mensuel ? "par mois" : "par jour"} ${exp("jours")}</h2>
${barres(cles, parCle, fmt)}
<div class="axe"><span>${fmt(cles[0])}</span><span>${fmt(cles[cles.length - 1])}</span></div>
<p class="m">Période précédente : ${nb(ptot.visites)} visites, ${nb(ptot.vues)} pages vues.</p>

${f ? `<div class="deux"><div><h2>Venus de quelle page</h2>
${tableau(avantL.map((p) => ({ poids: p.n, libelle: lienPage(p.page), chiffres: [nb(p.n)] })), ["Page précédente", "Fois"], "Aucune : on arrive surtout directement sur cette page.")}</div>
<div><h2>Partis vers quelle page</h2>
${tableau(apresL.map((p) => ({ poids: p.n, libelle: lienPage(p.page), chiffres: [nb(p.n)] })), ["Page suivante", "Fois"], "Aucune : on quitte le site depuis cette page.")}</div></div>`
    : `<h2>Pages les plus vues ${exp("pages")}</h2>
<p class="m">Clique sur une page pour voir ses statistiques à elle seule (provenance, pages avant et après, jeux).</p>
${tableau(pagesL.map((p) => ({ poids: p.vues, libelle: lienPage(p.page), chiffres: [nb(p.vues), evol(p.vues, pagesP.find((x) => x.page === p.page)?.vues), nb(p.visites), temps(p.duree)] })),
    ["Page", "Vues", "Évolution", "Visites", "Temps moyen"], "Aucune visite pour l'instant.")}
<div class="deux"><div><h2>Pages d'arrivée</h2>
${tableau(entreesL.map((p) => ({ poids: p.n, libelle: lienPage(p.page), chiffres: [nb(p.n), pct(p.une, p.n)] })), ["Page", "Arrivées", "Repartis aussitôt"], "Aucune donnée.")}</div>
<div><h2>Pages de sortie</h2>
${tableau(sortiesL.map((p) => ({ poids: p.n, libelle: lienPage(p.page), chiffres: [nb(p.n)] })), ["Dernière page vue", "Visites"], "Aucune donnée.")}
<p class="m">Visites de plusieurs pages seulement.</p></div></div>`}

<h2>Jeux réellement joués ${exp("jeux")}</h2>
<p class="m">Ouvert = le jeu s'affiche ; commencé = premier clic ou première touche ; fini = bilan de fin de partie. Temps de jeu = onglet visible, avec une action dans les 3 dernières minutes. Documents = fiches et bilans ouverts, téléchargés, imprimés.</p>
${tableau(jeuxL.map((j) => ({ poids: j.c, libelle: jeux[j.jeu]?.article ? `<a href="${lien({ f: jeux[j.jeu].article })}">${esc(nomJeu(j.jeu))}</a>` : esc(nomJeu(j.jeu)),
    chiffres: [nb(j.o), nb(j.c), nb(j.f), pct(j.f, j.c), temps(j.c ? j.d / j.c : 0), `${nb(j.doc)} / ${nb(j.w)} / ${nb(j.i)}`] })),
    ["Jeu", "Ouvert", "Commencé", "Fini", "Taux de fin", "Temps par partie", "Docs / ⬇ / 🖨"], "Aucune partie pour l'instant (mesure en place depuis le 26 novembre 2026).")}

<div class="deux"><div><h2>D'où viennent les visiteurs ${exp("sources")}</h2>
${tableau(catsL.map(([c, n]) => ({ poids: n, libelle: esc(c), chiffres: [nb(n), pct(n, nVis)] })), ["Provenance", "Visites", "Part"], "Aucune donnée.")}</div>
<div><h2>Sites précis</h2>
${tableau(detailsL.map(([nom, d]) => ({ poids: d.n, libelle: `${esc(nom)}${d.cat !== nom ? `<span class="m"> · ${esc(d.cat)}</span>` : ""}`, chiffres: [nb(d.n)] })), ["Site", "Visites"], "Aucun site pour l'instant.")}</div></div>
<p class="m">Les mots tapés dans Google ne sont pas transmis aux sites : ils sont dans la Search Console. Pour suivre une publication Pinterest ou Instagram, ajoute <code>?utm_source=pinterest</code> (ou instagram) à la fin du lien.</p>

<div class="deux"><div><h2>Pays</h2>
${tableau(paysL.map((p) => ({ poids: p.n, libelle: esc(nomPays(p.pays)), chiffres: [nb(p.n), pct(p.n, nVis)] })), ["Pays", "Visites", "Part"], "Aucune donnée (mesure en place depuis le 26 novembre 2026).")}</div>
<div><h2>Régions</h2>
${tableau(regionsL.map((r) => ({ poids: r.n, libelle: `${esc(r.region)}${r.pays && r.pays !== "FR" ? `<span class="m"> · ${esc(nomPays(r.pays))}</span>` : ""}`, chiffres: [nb(r.n)] })), ["Région", "Visites"], "Aucune donnée.")}</div></div>

<div class="deux"><div><h2>Heures de visite</h2>
${barres([...Array(24).keys()], heures, (h) => `${h} h – ${h + 1} h`, ["0 h", "", "", "", "", "", "6 h", "", "", "", "", "", "12 h", "", "", "", "", "", "18 h", "", "", "", "", "23 h"])}</div>
<div><h2>Jours de la semaine</h2>
${barres([0, 1, 2, 3, 4, 5, 6], semaine, (i) => SEMAINE[i], SEMAINE)}</div></div>

<div class="deux"><div><h2>Appareils</h2>
${tableau(appareilsL.map((a) => ({ poids: a.n, libelle: esc(a.appareil.charAt(0).toUpperCase() + a.appareil.slice(1)), chiffres: [pct(a.n, nVis)] })), ["Appareil", "Part"], "Aucune donnée.")}</div>
<div><h2>Nouveaux ou déjà venus</h2>
${tableau(vis.connus ? [{ poids: vis.neufs, libelle: "Première visite", chiffres: [nb(vis.neufs), pct(vis.neufs, vis.connus)] }, { poids: vis.connus - vis.neufs, libelle: "Déjà venus", chiffres: [nb(vis.connus - vis.neufs), pct(vis.connus - vis.neufs, vis.connus)] }] : [],
    ["Visiteurs", "Visites", "Part"], "Aucune donnée (mesure en place depuis le 26 novembre 2026).")}</div></div>

<p class="m" style="margin-top:28px">Aucune adresse IP, aucun cookie de suivi, aucun prénom : un visiteur n'est reconnu que pendant une journée. « Déjà venu » est un simple repère gardé dans le navigateur, sans identifiant. Le pays et la région viennent de Cloudflare. Le temps passé, les jeux, la provenance détaillée, le pays et les heures sont mesurés depuis le 26 novembre 2026.</p>
<script>
document.querySelectorAll(".cp").forEach(function (b) {
  b.onclick = function () {
    var t = document.getElementById(b.dataset.t);
    var txt = [].map.call(t.rows, function (r) { return [].map.call(r.cells, function (c) { return c.innerText.replace(/\\s*↗\\s*$/, "").replace(/\\s+/g, " ").trim(); }).join("\\t"); }).join("\\n");
    var fini = function () { b.textContent = "✔ Copié"; b.classList.add("ok-cp"); setTimeout(function () { b.textContent = "📋 Copier"; b.classList.remove("ok-cp"); }, 1500); };
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(fini, function () { b.textContent = "Copie impossible"; });
  };
});
</script>`);
}
