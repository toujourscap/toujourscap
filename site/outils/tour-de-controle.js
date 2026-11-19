/* Carnet de vol de « La tour de contrôle » — commun à tous les jeux du site.
   L'élève donne son prénom dans la tour de contrôle (/outils/la-tour-de-controle.html) ;
   ensuite chaque jeu note ses résultats ici, dans le navigateur (localStorage).
   Pilote ordinaire (prénom) : rien n'est envoyé sur Internet, les résultats restent sur cet appareil.
   Pilote « de ma classe » (pseudo d'animal choisi avec le code de classe) : le résultat est aussi envoyé
   à /api/suivi, sans aucun prénom, pour la page privée « Mes élèves » de l'enseignant.

   Dans un jeu :  TDC.note({ s: 8, n: 10, d: "8 mots lus du premier coup", g: true, cle: "..." })
     s = score, n = sur combien, d = phrase de bilan, g = gagné (true/false), niv = niveau (sinon lu dans #niveau),
     cle = même clé qu'un résultat déjà noté pendant cette partie → il est remplacé (bilan recalculé). */
(function () {
  var CLE = "tdc-carnet", MAX = 400;
  var jeu = (location.pathname.split("/").pop() || "").replace(/\.html$/, "");
  var ses = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  var debut = Date.now(), dernier = Date.now(), noteFaite = false, seanceFaite = false;

  function lire() { try { var c = JSON.parse(localStorage.getItem(CLE) || "null"); if (c && c.pilotes) return c; } catch (e) {} return { actif: "", pilotes: {} }; }
  function ecrire(c) { try { localStorage.setItem(CLE, JSON.stringify(c)); return true; } catch (e) { return false; } }
  function propre(p) { p = String(p || "").replace(/[<>"&]/g, "").replace(/\s+/g, " ").trim().slice(0, 20); return p ? p.charAt(0).toUpperCase() + p.slice(1) : ""; }
  function niveauAuto() {
    var r = document.querySelector("input[name=niveau]:checked");
    if (r) { var t = r.closest("label"); var b = t && t.querySelector("b"); return (b ? b.textContent : /^\d+$/.test(r.value) ? "Niveau " + r.value : r.value).trim().slice(0, 40); }
    var e = document.getElementById("niveau") || document.querySelector("select[name=niveau]");
    if (!e) return "";
    if (e.tagName === "SELECT" && e.selectedIndex >= 0) return e.options[e.selectedIndex].text.trim().slice(0, 40);
    return "";
  }
  function ajouter(v) {
    var c = lire(), p = c.actif && c.pilotes[c.actif];
    if (!p) return false;
    p.vols = (p.vols || []).filter(function (x) { return !(x.ses === ses && (x.type === "seance" || (v.cle && x.cle === v.cle))); });
    p.vols.push(v);
    if (p.vols.length > MAX) p.vols = p.vols.slice(-MAX);
    var ok = ecrire(c);
    if (p.classe && p.pseudo) envoyer({ code: p.classe, pseudo: p.pseudo, v: v });
    return ok;
  }

  /* Pilote « de ma classe » (pseudo d'animal, jamais de prénom) : le résultat part aussi vers /api/suivi,
     pour que l'enseignant le voie sur sa page privée « Mes élèves ». Sans réseau : mis en attente, renvoyé plus tard. */
  var ATTENTE = "tdc-attente";
  function fileAttente(l) {
    try { if (l) { localStorage.setItem(ATTENTE, JSON.stringify(l.slice(-200))); return l; } return JSON.parse(localStorage.getItem(ATTENTE) || "[]") || []; }
    catch (e) { return []; }
  }
  function poster(m) {
    return fetch("/api/suivi", { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify(m) })
      .then(function (r) { return r.ok || r.status === 400 || r.status === 404; }, function () { return false; }); // 400/404 : inutile de réessayer
  }
  function envoyer(m) {
    if (!/^https?:$/.test(location.protocol)) return;
    poster(m).then(function (ok) { if (!ok) fileAttente(fileAttente().concat([m])); else vider(); });
  }
  var enCours = false;
  function vider() {
    var l = fileAttente();
    if (!l.length || enCours) return;
    enCours = true;
    fileAttente([]);
    var reste = [], i = 0;
    (function suite() {
      if (i >= l.length) { enCours = false; if (reste.length) fileAttente(fileAttente().concat(reste)); return; }
      var m = l[i++];
      poster(m).then(function (ok) { if (!ok) reste.push(m); suite(); });
    })();
  }
  setTimeout(vider, 1500);
  addEventListener("online", vider);

  /* Les jeux du site : fichier → titre, article (slug), image. Utilisé par la tour de contrôle et la page « Mes élèves ». */
  var JEUX = [
  ["Français : lire", [
    ["les-fleches-de-robin","Les flèches de Robin","les-fleches-de-robin"],
    ["la-roue-du-magicien","La roue du magicien","la-roue-du-magicien"],
    ["les-fusees-des-syllabes","Les fusées des syllabes","les-fusees-des-syllabes"],
    ["la-minute-des-syllabes","La minute des syllabes","la-minute-des-syllabes"],
    ["puissance-4-syllabique","Puissance 4 syllabique","puissance-4-syllabiques"],
    ["le-chemin-des-sons","Le chemin des sons","le-chemin-des-sons"],
    ["lecture-rapide-de-mots-avec-le-tachitoscope","Lecture rapide de mots","lecture-rapide-de-mots-tachistoscope"],
    ["images-du-quotidien","Images du quotidien","images-du-quotidien"],
    ["teleprompteur-a-l-ecoute","Téléprompteur à l'écoute","teleprompteur-a-l-ecoute"],
    ["teleprompteur-de-lecture","Téléprompteur de lecture","teleprompteur-de-lecture"],
    ["le-chateau-des-detectives","Le Château des Détectives","le-chateau-des-detectives"],
    ["la-bibliotheque-des-contes","La Bibliothèque des contes","la-bibliotheque-des-contes"],
    ["les-devinettes-de-la-foret","Les devinettes de la forêt","les-devinettes-de-la-foret"]
  ]],
  ["Français : contes, orthographe", [
    ["les-formules-du-sorcier","Les Formules du Sorcier","les-formules-du-sorcier"],
    ["le-jackpot-des-contes","Le Jackpot des contes","le-jackpot-des-contes","/images/contes/le-jackpot-des-contes.jpg"],
    ["la-dictee-de-la-feuille-pliee","Prépare ta dictée !","la-dictee-de-la-feuille-pliee"],
    ["redis-la-regle","Apprends les règles d'orthographe","redis-la-regle"],
    ["la-machine-a-conjuguer","La machine à conjuguer","la-machine-a-conjuguer"]
  ]],
  ["Maths", [
    ["tour-des-nombres","La tour des nombres","la-tour-des-nombres"],
    ["le-chateau-des-nombres","Le château des nombres","le-chateau-des-nombres"],
    ["le-puzzle-du-chateau","Le puzzle du château","le-puzzle-du-chateau-des-nombres"],
    ["la-maison-de-briques","La maison de briques","la-maison-de-briques"],
    ["la-course-des-additions","La Course des Additions","la-course-des-additions"],
    ["la-course-des-multiplications","La Course des Multiplications","la-course-des-multiplications"],
    ["le-tape-taupe-des-additions","Le Tape-taupe des additions","le-tape-taupe-des-additions"],
    ["le-secret-de-la-pyramide","Le secret de la pyramide","le-secret-de-la-pyramide"]
  ]],
  ["Mieux apprendre", [
    ["le-mistigri-des-attitudes","Le Mistigri des attitudes","le-mistigri-des-attitudes"],
    ["les-explorateurs-du-cerveau","Les explorateurs du cerveau","les-explorateurs-du-cerveau"]
  ]]
];

  var TDC = window.TDC = {
    jeu: jeu, JEUX: JEUX, vider: vider,
    pilote: function () { return lire().actif || ""; },
    lire: lire, ecrire: ecrire, propre: propre,
    note: function (r) {
      r = r || {};
      if (!TDC.pilote() || jeu === "la-tour-de-controle") return false;
      var maintenant = Date.now();
      var v = { j: jeu, t: maintenant, ses: ses, dur: Math.round((maintenant - (r.cle && TDC._debutCle === r.cle ? TDC._t0Cle : dernier)) / 1000) };
      if (typeof r.s === "number" && isFinite(r.s)) v.s = r.s;
      if (typeof r.n === "number" && isFinite(r.n) && r.n > 0) v.n = r.n;
      if (typeof r.g === "boolean") v.g = r.g;
      var niv = r.niv != null ? String(r.niv) : niveauAuto(); if (niv) v.niv = niv.slice(0, 40);
      if (r.d) v.d = String(r.d).slice(0, 160);
      if (r.cle) { v.cle = String(r.cle); if (TDC._debutCle !== r.cle) { TDC._debutCle = r.cle; TDC._t0Cle = dernier; } }
      dernier = maintenant; noteFaite = true;
      var ok = ajouter(v);
      if (ok) badge(true);
      return ok;
    }
  };

  /* Séance sans bilan (outil sans score, partie arrêtée en route) : notée si l'élève a joué au moins 45 s. */
  function seance() {
    if (noteFaite || seanceFaite || jeu === "la-tour-de-controle" || window.TDC_SANS_UI || !TDC.pilote()) return;
    var s = Math.round((Date.now() - debut) / 1000);
    if (s < 45) return;
    seanceFaite = true;
    ajouter({ j: jeu, t: Date.now(), ses: ses, dur: s, type: "seance" });
  }
  addEventListener("pagehide", seance);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") seance(); else seanceFaite = false; });

  /* Petit badge discret : rappelle à l'élève que ses vols sont enregistrés. */
  var b = null;
  function badge(flash) {
    var p = TDC.pilote();
    if (!p || jeu === "la-tour-de-controle" || window.TDC_SANS_UI || !document.body) return;
    if (!b) {
      b = document.createElement("div");
      b.setAttribute("aria-hidden", "true");
      b.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:2147483000;pointer-events:none;font:600 12px/1 system-ui,sans-serif;" +
        "background:rgba(15,40,70,.78);color:#fff;padding:6px 10px;border-radius:999px;opacity:.75;transition:transform .3s,opacity .3s,background .3s";
      document.body.appendChild(b);
    }
    b.textContent = "✈️ " + p;
    if (flash) {
      b.textContent = "✈️ " + p + " · vol enregistré";
      b.style.background = "rgba(30,130,70,.92)"; b.style.opacity = "1"; b.style.transform = "scale(1.15)";
      setTimeout(function () { b.style.transform = ""; }, 400);
      setTimeout(function () { b.textContent = "✈️ " + p; b.style.background = "rgba(15,40,70,.78)"; b.style.opacity = ".75"; }, 3500);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { badge(false); }); else badge(false);

  /* Fin de partie : boutons « 🎮 Autres jeux » (retour à la rubrique du site) et, pour les jeux qui n'ont pas
     déjà de bouton Réglages, « ☰ Menu du jeu » (retour à l'écran de départ).
     b = bouton de fin du jeu (Rejouer…) : les boutons s'ajoutent à côté et s'affichent en même temps que lui.
     box = zone de fin sans bouton (si = texte qui signale la fin). menu = ajouter « Menu du jeu ». */
  var FIN = {
    "images-du-quotidien": { b: "#again" },
    "la-bibliotheque-des-contes": { b: "#again", menu: 1 },
    "la-course-des-additions": { b: "#again" },
    "la-course-des-multiplications": { b: "#again" },
    "la-dictee-de-la-feuille-pliee": { b: "#refaire" },
    "la-machine-a-conjuguer": { b: "#again" },
    "la-maison-de-briques": { b: "#reglages" },
    "la-minute-des-syllabes": { b: "#btnRejouer" },
    "la-roue-du-magicien": { b: "#b-rejouer" },
    "le-chateau-des-detectives": { b: "#again" },
    "le-chateau-des-nombres": { b: "#finRejouer" },
    "le-chemin-des-sons": { b: "#b-rejouer" },
    "le-mistigri-des-attitudes": { b: "#vSuite", menu: 1 },
    "le-puzzle-du-chateau": { b: "#finNouveau" },
    "le-secret-de-la-pyramide": { b: "#finBoutons button" },
    "le-tape-taupe-des-additions": { b: "#again" },
    "les-devinettes-de-la-foret": { b: "#again" },
    "les-explorateurs-du-cerveau": { b: "#rejouer", menu: 1 },
    "les-fleches-de-robin": { b: "#b-rejouer" },
    "les-formules-du-sorcier": { b: "#again" },
    "les-fusees-des-syllabes": { b: "#rejouer" },
    "redis-la-regle": { b: "#rejouer", menu: 1 },
    "tour-des-nombres": { b: "#btnRejouer" },
    "lecture-rapide-de-mots-avec-le-tachitoscope": { box: "#word-display", si: /BRAVO/ },
    "teleprompteur-de-lecture": { box: "#done" },
    "teleprompteur-a-l-ecoute": { box: "#done" }
  };
  var FIN_TXT = /rejouer|recommencer|refaire|nouvelle partie|nouveau puzzle|réessayer|réglages/i;

  function urlAutresJeux() {
    try {
      var a = window.top.document.querySelectorAll("nav.crumbs a");
      if (a.length) return a[a.length - 1].href;
    } catch (e) {}
    return "/outils-pedagogiques/";
  }
  function bouton(txt, cls, fn, style) {
    var x = document.createElement("button");
    x.type = "button"; x.className = cls || ""; x.textContent = txt;
    if (style) x.style.cssText = style;
    x.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); fn(); });
    return x;
  }
  function autresJeux() {
    var u = urlAutresJeux();
    try { window.top.location.href = u; } catch (e) { location.href = u; }
  }
  function boutonsFin(cfg, cls, style) {
    var s = document.createElement("span");
    s.className = "tdc-fin"; s.style.display = "contents";
    if (cfg.menu) { s.appendChild(bouton("☰ Menu du jeu", cls, function () { location.reload(); }, style)); s.appendChild(document.createTextNode(" ")); }
    s.appendChild(bouton("🎮 Autres jeux", cls, autresJeux, style));
    return s;
  }
  function visible(el) {
    for (var e = el; e && e !== document.body; e = e.parentElement) {
      if (e.hidden) return false;
      if (e === el && getComputedStyle(e).display === "none") return false;
    }
    return true;
  }
  function verifierFin() {
    var cfg = FIN[jeu];
    if (!cfg) return;
    if (cfg.box) {
      var z = document.querySelector(cfg.box);
      if (!z || z.querySelector(".tdc-fin")) return;
      if (cfg.si && !cfg.si.test(z.textContent)) return;
      var p = boutonsFin(cfg, "", "font:600 15px system-ui,sans-serif;margin:8px 4px 0;padding:8px 14px;border-radius:999px;border:0;background:#1e6fd9;color:#fff;cursor:pointer");
      p.style.display = "block"; p.style.textAlign = "center"; p.style.whiteSpace = "normal";
      z.appendChild(p);
      return;
    }
    var bs = document.querySelectorAll(cfg.b);
    for (var i = 0; i < bs.length; i++) {
      var a = bs[i];
      if (!FIN_TXT.test(a.textContent)) continue;
      var par = a.parentElement, s = par.querySelector(":scope > .tdc-fin");
      if (!s) {
        /* même style que les autres boutons secondaires de la fin (Réglages, Accueil…), sinon que le bouton Rejouer */
        var modele = a, autres = par.querySelectorAll(":scope > button");
        for (var k = 0; k < autres.length; k++) if (autres[k] !== a && !FIN_TXT.test(autres[k].textContent) || /réglages/i.test(autres[k].textContent)) { if (autres[k] !== a) { modele = autres[k]; break; } }
        s = boutonsFin(cfg, modele.className);
        par.appendChild(document.createTextNode(" "));
        par.appendChild(s);
        s._a = a;
      }
      var d = visible(s._a || a) ? "contents" : "none";
      if (s.style.display !== d) s.style.display = d;
    }
  }
  var attente = false;
  function planifier() { if (attente) return; attente = true; requestAnimationFrame(function () { attente = false; verifierFin(); }); }
  function demarrerFin() {
    if (!FIN[jeu] || !document.body) return;
    new MutationObserver(planifier).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "class", "style"] });
    verifierFin();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", demarrerFin); else demarrerFin();
})();
