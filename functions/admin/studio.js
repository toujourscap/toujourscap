// /admin/studio : enregistrer sa voix pour les jeux (identifiant « admin », mot de passe = variable ADMIN_PASSWORD).
// POST /admin/studio?cle=<cle>   (corps : WAV) → enregistre ou remplace
// DELETE /admin/studio?cle=<cle>                → supprime
import { autorise, refus, page } from "../../lib/admin.js";
import { base, CLE_RE, enBase64 } from "../../lib/voix.js";

export async function onRequestGet({ request, env }) {
  if (!autorise(request, env)) return refus(env);
  return page("Studio voix", "studio", STUDIO);
}

export async function onRequestPost({ request, env }) {
  if (!autorise(request, env)) return refus(env);
  const cle = new URL(request.url).searchParams.get("cle") || "";
  if (!CLE_RE.test(cle)) return Response.json({ erreur: "Clé invalide" }, { status: 400 });
  const type = (request.headers.get("content-type") || "audio/wav").split(";")[0];
  if (!/^audio\/[a-z0-9.+-]+$/.test(type)) return Response.json({ erreur: "Format invalide" }, { status: 400 });
  const buf = await request.arrayBuffer();
  if (buf.byteLength < 100 || buf.byteLength > 1_450_000) return Response.json({ erreur: "Enregistrement vide ou trop long" }, { status: 400 });
  const maj = Date.now();
  await (await base(env)).prepare("INSERT OR REPLACE INTO voix (cle, type, audio, maj) VALUES (?, ?, ?, ?)")
    .bind(cle, type, enBase64(buf), maj).run();
  return Response.json({ ok: true, maj });
}

export async function onRequestDelete({ request, env }) {
  if (!autorise(request, env)) return refus(env);
  const cle = new URL(request.url).searchParams.get("cle") || "";
  if (!CLE_RE.test(cle)) return Response.json({ erreur: "Clé invalide" }, { status: 400 });
  await (await base(env)).prepare("DELETE FROM voix WHERE cle = ?").bind(cle).run();
  return Response.json({ ok: true });
}

const STUDIO = `<h1>🎙️ Studio voix</h1>
<p class="m">⚠️ Les nombres enregistrés avant le 14/11 à 18 h ont le début coupé : refais-les (clique sur la case, puis enregistre par-dessus).</p>
<p class="m">Ta voix remplace celle de l'ordinateur dans les jeux, dès que tout ce que le jeu doit dire est enregistré (sinon c'est la voix de l'ordinateur pour cette fois). Rien à envoyer sur GitHub : c'est en ligne tout de suite.</p>
<style>
.barre-liste{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:16px 0}
select,input[type=text]{font:inherit;padding:8px 12px;border:1px solid #e7e0d4;border-radius:10px;background:#fff}
.poste{background:#fff;border:1px solid #e7e0d4;border-radius:16px;padding:20px;text-align:center;position:sticky;top:0;z-index:2;box-shadow:0 4px 14px #0001}
.grand.long{font-family:inherit;font-size:1.3rem;font-weight:600;line-height:1.5;text-align:left;max-height:40vh;overflow:auto;padding:4px 8px}
.case[title]{}
.grand{font-family:Georgia,serif;font-size:clamp(2.4rem,9vw,4.5rem);font-weight:700;line-height:1.1;margin:4px 0}
.aide{color:#66716d;min-height:1.4em}
.micro{width:150px;height:150px;border-radius:50%;border:0;background:#c2410c;color:#fff;font-weight:800;font-size:1rem;margin:12px auto;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:4px;touch-action:none;user-select:none;-webkit-user-select:none}
.micro span{font-size:2.6rem;line-height:1}
.micro.rec{background:#dc2626;animation:pulse 1s infinite}
@keyframes pulse{50%{box-shadow:0 0 0 18px #dc262633}}
.micro:disabled{background:#c9c2b6}
.outils button{background:#eef6f3;color:#1f6f5c}
.groupe{margin-top:22px}
.cases{display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:6px}
.cases.mots{grid-template-columns:repeat(auto-fill,minmax(210px,1fr))}
.cases.mots .case{font-weight:600;font-size:.9rem;text-align:left;padding:8px 10px}
.case{border:1px solid #e7e0d4;background:#fff;border-radius:10px;padding:8px 4px;font-weight:700;cursor:pointer;text-align:center;margin:0}
.case.fait{background:#d8ebe5;border-color:#9bc9b9}
.case.fait::after{content:" ✓";color:#1f6f5c}
.case.actif{outline:3px solid #c2410c}
.etat{font-weight:700}.etat.err{color:#b91c1c}
.compteur{color:#66716d}
</style>
<div class="barre-liste">
  <label>Liste : <select id="liste"></select></label>
  <span class="compteur" id="compteur"></span>
</div>
<div class="poste">
  <div class="aide" id="consigne">Choisis une case, puis maintiens le bouton rouge appuyé pendant que tu parles.</div>
  <div class="grand" id="texte">—</div>
  <div class="aide" id="dire"></div>
  <button class="micro" id="micro" type="button"><span>🎙️</span>Maintenir<br>pour parler</button>
  <div class="outils" style="margin-top:10px">
    <button type="button" id="prec">◀ Précédent</button>
    <button type="button" id="ecouter">▶ Écouter</button>
    <button type="button" id="suiv">Suivant ▶</button>
    <button type="button" id="effacer" class="no">Supprimer</button>
  </div>
  <p class="etat" id="etat"></p>
  <label class="m"><input type="checkbox" id="auto" checked> Après chaque enregistrement : réécouter puis passer à la case vide suivante</label>
</div>
<div id="groupes"></div>
<h2>Essayer comme dans un jeu</h2>
<p class="m">Tape (ou colle) un nombre jusqu'à 1 000, une phrase ou tout un texte : le site l'assemble avec tes enregistrements.</p>
<p><textarea id="essai" rows="2" style="width:100%;font:inherit;padding:8px;border:1px solid #e7e0d4;border-radius:10px">234</textarea><br> <button type="button" class="ok" id="btnEssai">▶ Écouter</button> <span id="essaiEtat" class="m"></span></p>
<script src="/outils/voix.js"></script>
<script>
(function(){
const $ = (id) => document.getElementById(id);
const VF = window.VoixSite, slug = VF.slug;

const UNITES = ["zéro","un","deux","trois","quatre","cinq","six","sept","huit","neuf","dix","onze","douze","treize","quatorze","quinze","seize"];
const DIZ = {20:"vingt",30:"trente",40:"quarante",50:"cinquante",60:"soixante"};
function enLettres(n){
  if(n<=16) return UNITES[n];
  if(n<20) return "dix-" + UNITES[n-10];
  if(n===100) return "cent";
  if(n===1000) return "mille";
  if(n>100) return UNITES[n/100] + " cents";
  if(n<70){ const d=Math.floor(n/10)*10, u=n%10; return DIZ[d] + (u===0 ? "" : u===1 ? " et un" : "-" + UNITES[u]); }
  if(n<80) return n===71 ? "soixante et onze" : "soixante-" + enLettres(n-60);
  if(n===80) return "quatre-vingts";
  return "quatre-vingt-" + enLettres(n-80);
}

const nombres = (a, b, pas=1) => { const l=[]; for(let n=a;n<=b;n+=pas) l.push({cle:"n"+n, texte:String(n), dire:enLettres(n)}); return l; };
// Textes à enregistrer : même nettoyage que dans les jeux, sans doublon.
const phrases = (l) => { const vu = new Set(), r = [];
  for(let t of l){ t = String(t).replace(/\\{[a-z]+:([^}]*)\\}/g, "$1").replace(/[«»]/g, "").replace(/<[^>]+>/g, "").replace(/\\s+/g, " ").trim();
    const c = VF.cle(t); if(t && c && !vu.has(c)){ vu.add(c); r.push({cle:c, texte:t}); } }
  return r; };

// Les textes des jeux sont lus directement dans les jeux : s'ils changent, le studio suit.
async function donnees(page, nom, fin){
  const s = await (await fetch("/outils/" + page + ".html", {cache:"no-store"})).text();
  const a = s.indexOf("const " + nom + " =");
  if(a < 0) throw new Error(nom + " introuvable dans " + page);
  const debut = s.indexOf("=", a) + 1, b = s.indexOf(fin, debut);
  return new Function("return (" + s.slice(debut, b + fin.length - (fin.endsWith(";") ? 1 : 0)) + ")")();
}

const NIVEAUX = {cp:"CP", ce1:"CE1", ce2:"CE2"};
const LISTES = [
  { id:"nombres", titre:"Maths – jeux sur les nombres", groupes:[
    { titre:"Nombres de 0 à 100", items:nombres(0,100) },
    { titre:"Centaines et mille (pour fabriquer tous les nombres jusqu'à 1 000)", items:nombres(200,900,100).concat(nombres(1000,1000)) },
    { titre:"Mots des jeux", mots:true, items:phrases(["plus","briques","est plus grand que","est plus petit que","est égal à"]) },
    { titre:"Phrases des jeux", mots:true, items:phrases(["Bravo ! La maison est construite.","Le loup a soufflé. On réessaie ?","Bravo ! La tour est construite !"]) },
  ]},
  { id:"bilan-lecture", titre:"Évaluations – Bilan de lecture (mots dits à l'élève)", charger: async () => {
    const PAIRES = await donnees("bilan-de-lecture", "PAIRES", "];");
    const AUD = await donnees("bilan-de-lecture", "AUD", "];");
    const DSYL = await donnees("bilan-de-lecture", "DSYL", "];");
    const DMOT = await donnees("bilan-de-lecture", "DMOT", "];");
    return [
      { titre:"Pareil ou différent ? (dis les deux mots dans un seul enregistrement, avec un petit silence entre les deux)", mots:true, items:phrases(PAIRES.map(([a,b]) => a + " … " + b)) },
      { titre:"b, d, p, c (auditif) : par quelle lettre commence ce mot ?", mots:true, items:phrases(AUD.map((x) => x[0])) },
      { titre:"Syllabes dictées", mots:true, items:phrases(DSYL) },
      { titre:"Mots dictés", mots:true, items:phrases(DMOT) },
    ];
  }},
  { id:"devinettes", titre:"Compréhension – Les devinettes de la forêt", charger: async () => {
    const DEV = await donnees("les-devinettes-de-la-foret", "DEV", "\\n];");
    return [{ titre:"Fin de chaque devinette", mots:true, items:phrases(["Qui suis-je ?"]) }]
      .concat(Object.keys(NIVEAUX).map((n) => ({ titre:"Devinettes " + NIVEAUX[n], mots:true, items:phrases(DEV.map((d) => d[n])) })));
  }},
  { id:"detectives", titre:"Compréhension – Le château des détectives", charger: async () => {
    const DATA = await donnees("le-chateau-des-detectives", "DATA", "};");
    return DATA.cats.map((c) => ({ titre:c.nom + " (texte, question, puis chaque réponse)", mots:true,
      items:phrases(DATA.cartes.filter((x) => x.cat === c.id).flatMap((x) => [x.texte, x.q].concat(x.rep))) }));
  }},
  { id:"contes", titre:"Compréhension – La bibliothèque des contes", charger: async () => {
    const CONTES = await donnees("la-bibliotheque-des-contes", "CONTES", "\\n];");
    const g = [{ titre:"Lettres des réponses", mots:true, items:phrases(["A","B","C","D","E"]) }];
    for(const c of CONTES) for(const [niv, n] of Object.entries(c.niveaux)){
      if(n.audio) continue; // déjà lu avec un enregistrement
      g.push({ titre:c.titre + " – " + niv + " : l'histoire (un paragraphe par case)", mots:true, items:phrases(n.texte) });
      g.push({ titre:c.titre + " – " + niv + " : questions et réponses", mots:true,
        items:phrases(n.questions.flatMap((q) => [q.q].concat(q.choix || q.ordre || []))) });
    }
    return g;
  }},
];

let liste = LISTES[0], items = [], courant = -1, voix = {}, flux = null, enreg = false, debut = 0;

function etat(t, err){ $("etat").textContent = t; $("etat").className = "etat" + (err ? " err" : ""); }

async function chargerVoix(){
  try { const r = await fetch("/api/voix?t=" + Date.now(), {cache:"no-store"}); voix = (await r.json()).voix || {}; } catch(e){ voix = {}; }
}

async function dessiner(){
  if(!liste.groupes){
    $("groupes").innerHTML = '<p class="m">Chargement des textes du jeu…</p>';
    try { liste.groupes = await liste.charger(); } catch(e){ $("groupes").innerHTML = '<p class="etat err">Impossible de lire les textes du jeu (' + e.message + ').</p>'; items = []; maj(); return; }
  }
  items = liste.groupes.flatMap((g) => g.items);
  const court = (t) => t.length > 70 ? t.slice(0, 66).replace(/\\s+\\S*$/, "") + " …" : t;
  const esc = (t) => t.replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  $("groupes").innerHTML = liste.groupes.map((g) => {
    const f = g.items.filter((it) => voix[it.cle]).length;
    return '<div class="groupe"><h2>' + esc(g.titre) + ' <small class="m" data-g="' + liste.groupes.indexOf(g) + '">' + f + ' / ' + g.items.length + '</small></h2><div class="cases' + (g.mots ? ' mots' : '') + '">' +
    g.items.map((it) => '<button type="button" class="case" data-cle="' + it.cle + '" title="' + esc(it.texte) + '">' + esc(court(it.texte)) + '</button>').join("") + '</div></div>'; }).join("");
  $("groupes").querySelectorAll(".case").forEach((b) => b.onclick = () => choisir(items.findIndex((it) => it.cle === b.dataset.cle)));
  maj();
}

function maj(){
  $("groupes").querySelectorAll(".case").forEach((b) => {
    b.classList.toggle("fait", !!voix[b.dataset.cle]);
    b.classList.toggle("actif", items[courant] && items[courant].cle === b.dataset.cle);
  });
  const faits = items.filter((it) => voix[it.cle]).length;
  $("compteur").textContent = faits + " / " + items.length + " enregistrés";
  const it = items[courant];
  $("texte").textContent = it ? it.texte : "—";
  const long = !!(it && it.texte.length > 40);
  $("consigne").textContent = long ? "Texte long : appuie une fois sur le bouton rouge (ou la barre d'espace) pour commencer, une fois pour arrêter." : "Mot court : maintiens le bouton rouge (ou la barre d'espace) pendant que tu parles, lâche une demi-seconde après.";
  if(liste.groupes) $("groupes").querySelectorAll("small[data-g]").forEach((e) => { const g = liste.groupes[+e.dataset.g]; e.textContent = g.items.filter((x) => voix[x.cle]).length + " / " + g.items.length; });
  $("texte").classList.toggle("long", long);
  if(!enreg) $("micro").innerHTML = long ? "<span>🎙️</span>Appuie pour<br>commencer" : "<span>🎙️</span>Maintenir<br>pour parler";
  $("dire").textContent = it && it.dire ? "Dire : « " + it.dire + " »" : "";
  $("ecouter").disabled = $("effacer").disabled = !(it && voix[it.cle]);
}

function choisir(i){ if(i < 0 || i >= items.length) return; courant = i; etat(""); maj();
  const b = $("groupes").querySelector('[data-cle="' + items[i].cle + '"]'); if(b) b.scrollIntoView({block:"nearest"}); }

const url = (cle) => "/api/voix/" + cle + "?v=" + voix[cle];
let lecteur = null;
function ecouter(cles, fin){
  if(lecteur) lecteur.pause();
  let i = 0;
  const suite = () => { if(i >= cles.length){ if(fin) fin(); return; } lecteur = new Audio(url(cles[i++])); lecteur.onended = suite; lecteur.onerror = suite; lecteur.play().catch(suite); };
  suite();
}

// Le micro écoute en continu dès qu'il est ouvert : on garde toujours les 0,8 dernières secondes,
// pour que le début du mot ne soit jamais coupé (même si on parle en appuyant).
let ctxA = null, avant = [], prises = null, sr = 48000, fin = null;
async function micro(){
  if(flux){ if(ctxA.state !== "running") await ctxA.resume(); return true; }
  try { flux = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false, noiseSuppression:false, autoGainControl:false}}); }
  catch(e){ etat("Micro refusé : autorise le micro pour ce site dans le navigateur.", true); return false; }
  ctxA = new (window.AudioContext || window.webkitAudioContext)();
  sr = ctxA.sampleRate;
  const src = ctxA.createMediaStreamSource(flux), proc = ctxA.createScriptProcessor(2048, 1, 1);
  proc.onaudioprocess = (e) => {
    const d = new Float32Array(e.inputBuffer.getChannelData(0));
    if(prises) prises.push(d);
    else { avant.push(d); let n = 0; for(let i = avant.length - 1; i >= 0; i--){ n += avant[i].length; if(n > sr * .8){ avant = avant.slice(i); break; } } }
  };
  src.connect(proc); proc.connect(ctxA.destination);
  if(ctxA.state !== "running") await ctxA.resume();
  return true;
}

async function demarrer(){
  if(enreg || prises || courant < 0){ if(courant < 0) etat("Choisis d'abord une case.", true); return; }
  if(!(await micro())) return;
  prises = avant.slice(); avant = []; enreg = true; debut = Date.now();
  $("micro").classList.add("rec"); etat("🔴 Je t'écoute…");
  if(estLong()) $("micro").innerHTML = "<span>⏹</span>Appuie pour<br>arrêter";
}
function arreter(){
  if(!enreg) return;
  enreg = false; $("micro").classList.remove("rec"); maj();
  clearTimeout(fin);
  fin = setTimeout(() => { const p = prises; prises = null; traiter(p); }, 350); // garde la fin du mot
}

async function traiter(p){
  const it = items[courant];
  if(Date.now() - debut < 400){ etat("Trop court : parle pendant que le bouton est rouge.", true); return; }
  etat("Préparation…");
  try {
    const x = new Float32Array(p.reduce((s, a) => s + a.length, 0)); let o = 0;
    for(const a of p){ x.set(a, o); o += a.length; }
    const wav = nettoyer(x, sr);
    if(!wav){ if(!/Trop long/.test($("etat").textContent)) etat("Je n'ai rien entendu : parle un peu plus fort.", true); return; }
    etat("Envoi…");
    const r = await fetch("/admin/studio?cle=" + it.cle, {method:"POST", headers:{"content-type":"audio/wav"}, body:wav});
    const d = await r.json();
    if(!r.ok || !d.ok) throw new Error(d.erreur || r.status);
    voix[it.cle] = d.maj; maj(); etat("✓ « " + it.texte + " » enregistré");
    if($("auto").checked) ecouter([it.cle], () => {
      if(items[courant] !== it) return;
      let j = items.findIndex((x, k) => k > courant && !voix[x.cle]);
      if(j < 0) j = items.findIndex((x) => !voix[x.cle]);
      if(j >= 0) choisir(j); else etat("🎉 Toute la liste est enregistrée !");
    });
  } catch(e){ etat("Échec de l'enregistrement (" + e.message + "). Réessaie.", true); }
}

// Coupe les silences au début et à la fin (en gardant les sons doux comme « s », « f », « ch »),
// met au même volume, et convertit en WAV mono 22 kHz.
function nettoyer(x, sr){
  const fen = Math.round(sr * .01), nb = Math.floor(x.length / fen);
  if(nb < 10) return null;
  let pic = 0; for(let i=0;i<x.length;i++) pic = Math.max(pic, Math.abs(x[i]));
  if(pic < .01) return null;
  const e = new Float32Array(nb);
  for(let w=0; w<nb; w++){ let s=0; for(let i=w*fen;i<(w+1)*fen;i++) s+=x[i]*x[i]; e[w] = Math.sqrt(s/fen); }
  const tri = Array.from(e).sort((a,b)=>a-b), bruit = tri[Math.floor(nb*.15)], fort = tri[nb-1];
  if(fort < bruit * 4) return null;
  const seuil = bruit + (fort - bruit) * .12, doux = bruit * 2.2 + (fort - bruit) * .015;
  let a = 0; while(a < nb && e[a] < seuil) a++;
  while(a > 0 && e[a-1] > doux) a--;
  let b = nb - 1; while(b > a && e[b] < seuil) b--;
  while(b < nb - 1 && e[b+1] > doux) b++;
  a = Math.max(0, a*fen - Math.round(sr*.12)); b = Math.min(x.length, (b+1)*fen + Math.round(sr*.15));
  if((b - a) / sr > 44){ etat("Trop long (45 s au plus) : coupe ce texte en deux.", true); return null; }
  const out = (b - a) / sr > 30 ? 16000 : 22050, k = sr / out, n = Math.floor((b - a) / k), gain = .9 / pic;
  const buf = new ArrayBuffer(44 + n*2), v = new DataView(buf);
  const ecr = (o, s) => { for(let i=0;i<s.length;i++) v.setUint8(o+i, s.charCodeAt(i)); };
  ecr(0,"RIFF"); v.setUint32(4, 36 + n*2, true); ecr(8,"WAVE"); ecr(12,"fmt "); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
  v.setUint32(24,out,true); v.setUint32(28,out*2,true); v.setUint16(32,2,true); v.setUint16(34,16,true); ecr(36,"data"); v.setUint32(40,n*2,true);
  const fondu = Math.round(out * .01);
  for(let i=0;i<n;i++){
    const p = a + i*k, j = Math.floor(p), f = p - j;
    let s = ((x[j] || 0) * (1-f) + (x[j+1] || 0) * f) * gain;
    if(i < fondu) s *= i / fondu; if(n - i < fondu) s *= (n - i) / fondu;
    v.setInt16(44 + i*2, Math.max(-1, Math.min(1, s)) * 0x7fff, true);
  }
  return new Blob([buf], {type:"audio/wav"});
}

const m = $("micro");
// Mot court : on maintient le bouton. Texte long : un appui pour commencer, un autre pour arrêter.
const estLong = () => !!(items[courant] && items[courant].texte.length > 40);
function basculer(){ if(enreg) arreter(); else demarrer(); }
m.addEventListener("pointerdown", (e) => { e.preventDefault();
  if(estLong()){ basculer(); return; }
  try{ m.setPointerCapture(e.pointerId); }catch(x){} demarrer(); });
["pointerup","pointercancel","lostpointercapture"].forEach((t) => m.addEventListener(t, () => { if(!estLong()) arreter(); }));
m.addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("keydown", (e) => {
  if(/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
  if(e.code === "Space"){ e.preventDefault(); if(e.repeat) return; if(estLong()) basculer(); else demarrer(); }
  if(e.key === "ArrowRight") choisir(courant + 1);
  if(e.key === "ArrowLeft") choisir(courant - 1);
});
document.addEventListener("keyup", (e) => { if(e.code === "Space" && !/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)){ e.preventDefault(); if(!estLong()) arreter(); } });
// La barre d'espace sert au micro : elle ne doit pas « recliquer » le dernier bouton utilisé.
document.addEventListener("click", (e) => { if(e.target.closest && e.target.closest("button")) e.target.closest("button").blur(); });
$("prec").onclick = () => choisir(courant - 1);
$("suiv").onclick = () => choisir(courant + 1);
$("ecouter").onclick = () => { const it = items[courant]; if(it && voix[it.cle]) ecouter([it.cle]); };
$("effacer").onclick = async () => {
  const it = items[courant]; if(!it || !voix[it.cle] || !confirm("Supprimer l'enregistrement « " + it.texte + " » ?")) return;
  const r = await fetch("/admin/studio?cle=" + it.cle, {method:"DELETE"});
  if(r.ok){ delete voix[it.cle]; maj(); etat("Supprimé : les jeux reprennent la voix de l'ordinateur pour ce texte."); }
};

const decouper = (t) => VF.decouper(t, voix);
$("btnEssai").onclick = () => {
  const r = decouper($("essai").value);
  if(r.manque){ $("essaiEtat").textContent = "Il manque : " + r.manque + " → la voix de l'ordinateur parlera."; return; }
  $("essaiEtat").textContent = "Morceaux : " + r.cles.join(" + ");
  ecouter(r.cles);
};

$("liste").innerHTML = LISTES.map((l) => '<option value="' + l.id + '">' + l.titre + '</option>').join("");
$("liste").onchange = () => { liste = LISTES.find((l) => l.id === $("liste").value); courant = -1; dessiner().then(() => { const j = items.findIndex((x) => !voix[x.cle]); choisir(j < 0 ? 0 : j); }); };
if(!navigator.mediaDevices) etat("Ce navigateur ne sait pas enregistrer : utilise Chrome.", true);
micro(); // ouvre le micro dès l'arrivée (le navigateur demande l'autorisation)
chargerVoix().then(() => { dessiner(); const j = items.findIndex((x) => !voix[x.cle]); choisir(j < 0 ? 0 : j); });
})();
</script>`;
