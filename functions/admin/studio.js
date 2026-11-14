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
  if (buf.byteLength < 100 || buf.byteLength > 1_200_000) return Response.json({ erreur: "Enregistrement vide ou trop long" }, { status: 400 });
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
<p class="m">Ta voix remplace celle de l'ordinateur dans les jeux, dès qu'un texte est enregistré. Rien à envoyer sur GitHub : c'est en ligne tout de suite.</p>
<style>
.barre-liste{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:16px 0}
select,input[type=text]{font:inherit;padding:8px 12px;border:1px solid #e7e0d4;border-radius:10px;background:#fff}
.poste{background:#fff;border:1px solid #e7e0d4;border-radius:16px;padding:20px;text-align:center;position:sticky;top:0;z-index:2;box-shadow:0 4px 14px #0001}
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
  <div class="aide">Ordinateur : tu peux aussi maintenir la <b>barre d'espace</b>.</div>
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
<p class="m">Tape un nombre (jusqu'à 1 000) ou une phrase : le site l'assemble avec tes enregistrements.</p>
<p><input type="text" id="essai" value="234" size="30"> <button type="button" class="ok" id="btnEssai">▶ Écouter</button> <span id="essaiEtat" class="m"></span></p>
<script>
(function(){
const $ = (id) => document.getElementById(id);
const slug = (t) => String(t).normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase()
  .replace(/œ/g, "oe").replace(/æ/g, "ae").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

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
const phrases = (l) => l.map((t) => ({cle:slug(t), texte:t}));

const LISTES = [
  { id:"nombres", titre:"Maths – jeux sur les nombres", groupes:[
    { titre:"Nombres de 0 à 100", items:nombres(0,100) },
    { titre:"Centaines et mille (pour fabriquer tous les nombres jusqu'à 1 000)", items:nombres(200,900,100).concat(nombres(1000,1000)) },
    { titre:"Mots des jeux", mots:true, items:phrases(["plus","briques","est plus grand que","est plus petit que","est égal à"]) },
    { titre:"Phrases des jeux", mots:true, items:phrases(["Bravo ! La maison est construite.","Le loup a soufflé. On réessaie ?","Bravo ! La tour est construite !"]) },
  ]},
];

let liste = LISTES[0], items = [], courant = -1, voix = {}, flux = null, rec = null, morceaux = [], enreg = false, debut = 0;

function etat(t, err){ $("etat").textContent = t; $("etat").className = "etat" + (err ? " err" : ""); }

async function chargerVoix(){
  try { const r = await fetch("/api/voix?t=" + Date.now(), {cache:"no-store"}); voix = (await r.json()).voix || {}; } catch(e){ voix = {}; }
}

function dessiner(){
  items = liste.groupes.flatMap((g) => g.items);
  $("groupes").innerHTML = liste.groupes.map((g, gi) => '<div class="groupe"><h2>' + g.titre + '</h2><div class="cases' + (g.mots ? ' mots' : '') + '">' +
    g.items.map((it) => '<button type="button" class="case" data-cle="' + it.cle + '">' + it.texte + '</button>').join("") + '</div></div>').join("");
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

async function micro(){
  if(flux) return true;
  try { flux = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true, noiseSuppression:true, autoGainControl:true}}); return true; }
  catch(e){ etat("Micro refusé : autorise le micro pour ce site dans le navigateur.", true); return false; }
}

async function demarrer(){
  if(enreg || courant < 0){ if(courant < 0) etat("Choisis d'abord une case.", true); return; }
  if(!(await micro())) return;
  morceaux = []; enreg = true; debut = Date.now();
  rec = new MediaRecorder(flux);
  rec.ondataavailable = (e) => { if(e.data.size) morceaux.push(e.data); };
  rec.onstop = traiter;
  rec.start();
  $("micro").classList.add("rec"); etat("🔴 Je t'écoute…");
}
function arreter(){
  if(!enreg) return;
  enreg = false; $("micro").classList.remove("rec");
  setTimeout(() => { if(rec && rec.state !== "inactive") rec.stop(); }, 250); // garde la fin du mot
}

async function traiter(){
  const it = items[courant];
  if(Date.now() - debut < 400){ etat("Trop court : maintiens le bouton pendant que tu parles.", true); return; }
  etat("Préparation…");
  try {
    const blob = new Blob(morceaux, {type: rec.mimeType});
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const son = await ctx.decodeAudioData(await blob.arrayBuffer());
    ctx.close();
    const wav = nettoyer(son);
    if(!wav){ etat("Je n'ai rien entendu : parle un peu plus fort.", true); return; }
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

// Coupe les silences au début et à la fin, met au même volume, et convertit en WAV mono 22 kHz.
function nettoyer(son){
  const sr = son.sampleRate, x = son.getChannelData(0), fen = Math.round(sr * .01);
  let pic = 0; for(let i=0;i<x.length;i++) pic = Math.max(pic, Math.abs(x[i]));
  if(pic < .02) return null;
  const seuil = Math.max(.012, pic * .08);
  const rms = (a) => { let s=0, n=0; for(let i=a;i<Math.min(a+fen,x.length);i++){ s+=x[i]*x[i]; n++; } return Math.sqrt(s/n); };
  let a = 0; while(a < x.length && rms(a) < seuil * .5) a += fen;
  let b = x.length - fen; while(b > a && rms(b) < seuil * .35) b -= fen;
  a = Math.max(0, a - Math.round(sr*.04)); b = Math.min(x.length, b + fen + Math.round(sr*.1));
  const out = 22050, k = sr / out, n = Math.floor((b - a) / k), gain = .9 / pic;
  const buf = new ArrayBuffer(44 + n*2), v = new DataView(buf);
  const ecr = (o, s) => { for(let i=0;i<s.length;i++) v.setUint8(o+i, s.charCodeAt(i)); };
  ecr(0,"RIFF"); v.setUint32(4, 36 + n*2, true); ecr(8,"WAVE"); ecr(12,"fmt "); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
  v.setUint32(24,out,true); v.setUint32(28,out*2,true); v.setUint16(32,2,true); v.setUint16(34,16,true); ecr(36,"data"); v.setUint32(40,n*2,true);
  const fondu = Math.round(out * .015);
  for(let i=0;i<n;i++){
    const p = a + i*k, j = Math.floor(p), f = p - j;
    let s = ((x[j] || 0) * (1-f) + (x[j+1] || 0) * f) * gain;
    if(i < fondu) s *= i / fondu; if(n - i < fondu) s *= (n - i) / fondu;
    v.setInt16(44 + i*2, Math.max(-1, Math.min(1, s)) * 0x7fff, true);
  }
  return new Blob([buf], {type:"audio/wav"});
}

const m = $("micro");
m.addEventListener("pointerdown", (e) => { e.preventDefault(); try{ m.setPointerCapture(e.pointerId); }catch(x){} demarrer(); });
["pointerup","pointercancel","lostpointercapture"].forEach((t) => m.addEventListener(t, arreter));
m.addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("keydown", (e) => {
  if(e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
  if(e.code === "Space"){ e.preventDefault(); if(!e.repeat) demarrer(); }
  if(e.key === "ArrowRight") choisir(courant + 1);
  if(e.key === "ArrowLeft") choisir(courant - 1);
});
document.addEventListener("keyup", (e) => { if(e.code === "Space") arreter(); });
$("prec").onclick = () => choisir(courant - 1);
$("suiv").onclick = () => choisir(courant + 1);
$("ecouter").onclick = () => { const it = items[courant]; if(it && voix[it.cle]) ecouter([it.cle]); };
$("effacer").onclick = async () => {
  const it = items[courant]; if(!it || !voix[it.cle] || !confirm("Supprimer l'enregistrement « " + it.texte + " » ?")) return;
  const r = await fetch("/admin/studio?cle=" + it.cle, {method:"DELETE"});
  if(r.ok){ delete voix[it.cle]; maj(); etat("Supprimé : les jeux reprennent la voix de l'ordinateur pour ce texte."); }
};

// Même découpage que /outils/voix.js dans les jeux.
function decouper(t){
  t = String(t).trim(); const entier = slug(t); if(voix[entier]) return {cles:[entier]};
  t = t.replace(/\\+/g, " plus ").replace(/=/g, " égal ").replace(/(\\d)\\s+(?=\\d{3}\\b)/g, "$1");
  const cles = [];
  for(const mo of t.split(/(\\d+)/)){
    if(/^\\d+$/.test(mo)){ const n = +mo; if(n > 1000) return {manque:mo};
      if(n <= 100 || n === 1000) cles.push("n"+n); else { const c = Math.floor(n/100)*100; cles.push("n"+c); if(n%100) cles.push("n"+(n%100)); } }
    else { const s = slug(mo); if(s) cles.push(s); }
  }
  const manque = cles.filter((c) => !voix[c]);
  return manque.length ? {manque: manque.join(", ")} : {cles};
}
$("btnEssai").onclick = () => {
  const r = decouper($("essai").value);
  if(r.manque){ $("essaiEtat").textContent = "Il manque : " + r.manque + " → la voix de l'ordinateur parlera."; return; }
  $("essaiEtat").textContent = "Morceaux : " + r.cles.join(" + ");
  ecouter(r.cles);
};

$("liste").innerHTML = LISTES.map((l) => '<option value="' + l.id + '">' + l.titre + '</option>').join("");
$("liste").onchange = () => { liste = LISTES.find((l) => l.id === $("liste").value); courant = -1; dessiner(); };
if(!window.MediaRecorder) etat("Ce navigateur ne sait pas enregistrer : utilise Chrome.", true);
chargerVoix().then(() => { dessiner(); const j = items.findIndex((x) => !voix[x.cle]); choisir(j < 0 ? 0 : j); });
})();
</script>`;
