/* Voix enregistrées dans les jeux (enregistrées dans le studio /admin/studio).
   Ce script se place devant la synthèse vocale : quand un jeu demande de dire un texte
   et qu'on peut le reconstituer entièrement avec des enregistrements (un texte, une question,
   chaque réponse… ou un nombre : 234 = « deux cents » + « trente-quatre »), on joue les enregistrements ;
   sinon, la voix de l'ordinateur parle comme avant.
   Il suffit d'ajouter <script src="voix.js"></script> dans un jeu. Le studio utilise les mêmes outils (window.VoixSite). */
(function () {
  if (window.VoixSite) return;

  function slug(t) {
    return String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/œ/g, "oe").replace(/æ/g, "ae").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }
  function fnv(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ("0000000" + h.toString(16)).slice(-8);
  }
  // Nom de l'enregistrement d'un texte (les textes longs sont raccourcis + empreinte).
  function cleMots(s) { return s.length <= 60 ? s : s.slice(0, 40).replace(/-+$/, "") + "-" + fnv(s); }
  function prep(t) {
    return String(t || "").replace(/\+/g, " plus ").replace(/=/g, " égal ").replace(/(\d)[\s  ]+(?=\d{3}\b)/g, "$1");
  }
  function cle(t) { return cleMots(slug(prep(t))); }
  function nombre(n) {
    n = parseInt(n, 10);
    if (n <= 100) return ["n" + n];
    if (n === 1000) return ["n1000"];
    if (n > 9999) return null;
    if (n > 1000) {
      var m = Math.floor(n / 1000) * 1000, rm = n % 1000, suite = rm ? nombre(rm) : [];
      return suite ? ["n" + m].concat(suite) : null;
    }
    var c = Math.floor(n / 100) * 100, r = n % 100;
    return r ? ["n" + c, "n" + r] : ["n" + c];
  }
  // Reconstitue le texte avec des enregistrements ; renvoie la liste des clés, ou { manque } si impossible.
  function decouper(texte, voix) {
    var mots = slug(prep(texte)).split("-").filter(Boolean), n = mots.length;
    if (!n) return { manque: "(texte vide)" };
    var prev = new Array(n + 1), atteint = new Array(n + 1);
    atteint[0] = true;
    for (var i = 0; i < n; i++) {
      if (!atteint[i]) continue;
      // Empreinte calculée au fur et à mesure (même résultat que cleMots, sans tout recalculer).
      var s = "", h = 0x811c9dc5, debut = null;
      for (var j = i + 1; j <= n && j - i <= 250; j++) {
        var ajout = (s ? "-" : "") + mots[j - 1];
        for (var q = 0; q < ajout.length; q++) { h ^= ajout.charCodeAt(q); h = Math.imul(h, 0x01000193) >>> 0; }
        if (debut === null || s.length <= 60) s += ajout; else s = s.length > 61 ? s : s + ajout;
        var k;
        if (debut === null && s.length <= 60) k = s;
        else { if (debut === null) debut = s.slice(0, 40).replace(/-+$/, ""); k = debut + "-" + ("0000000" + h.toString(16)).slice(-8); }
        if (voix[k] && !atteint[j]) { atteint[j] = true; prev[j] = { i: i, cles: [k] }; }
      }
      if (/^\d+$/.test(mots[i]) && !atteint[i + 1]) {
        var l = nombre(mots[i]);
        if (l && l.every(function (c) { return voix[c]; })) { atteint[i + 1] = true; prev[i + 1] = { i: i, cles: l }; }
      }
    }
    if (!atteint[n]) {
      var loin = 0; for (var m = 0; m <= n; m++) if (atteint[m]) loin = m;
      return { manque: mots.slice(loin, loin + 8).join(" ") + (n - loin > 8 ? "…" : "") };
    }
    var cles = [], p = n;
    while (p > 0) { cles = prev[p].cles.concat(cles); p = prev[p].i; }
    return { cles: cles };
  }

  var V = window.VoixSite = { slug: slug, cle: cle, decouper: decouper, manifeste: null };
  fetch("/api/voix").then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) { if (d && d.voix && !V.manifeste) V.manifeste = d.voix; }).catch(function () {});

  if (!("speechSynthesis" in window)) return;
  var ss = window.speechSynthesis, jeton = 0, enCours = false, lecteurs = [];

  function evenement(u, type) {
    var e;
    try { e = new SpeechSynthesisEvent(type, { utterance: u }); } catch (x) { e = new Event(type); }
    try { u.dispatchEvent(e); } catch (x) {}
  }
  function arreter() {
    jeton++; enCours = false;
    lecteurs.forEach(function (a) { try { a.pause(); } catch (x) {} });
    lecteurs = [];
  }

  var vraiSpeak = ss.speak.bind(ss), vraiCancel = ss.cancel.bind(ss);
  var desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ss), "speaking");

  function jouer(cles, u) {
    arreter();
    var moi = jeton, i = 0, voix = V.manifeste;
    lecteurs = cles.map(function (c) { var a = new Audio("/api/voix/" + c + "?v=" + voix[c]); a.preload = "auto"; return a; });
    enCours = true;
    var suivant = function () {
      if (moi !== jeton) return;
      if (i >= lecteurs.length) { enCours = false; evenement(u, "end"); return; }
      var a = lecteurs[i++];
      a.onended = suivant;
      a.onerror = rate;
      var p = a.play();
      if (p && p.catch) p.catch(rate);
    };
    // En cas de souci (son bloqué, réseau), la voix de l'ordinateur prend le relais.
    var rate = function () { if (moi !== jeton) return; arreter(); vraiSpeak(u); };
    evenement(u, "start");
    suivant();
  }

  try {
    ss.speak = function (u) {
      var r = u && u.volume !== 0 && V.manifeste && String(u.text || "").trim() ? decouper(u.text, V.manifeste) : null;
      if (!r || !r.cles) return vraiSpeak(u);
      vraiCancel();
      jouer(r.cles, u);
    };
    ss.cancel = function () { arreter(); vraiCancel(); };
    Object.defineProperty(ss, "speaking", { configurable: true, get: function () {
      return enCours || (desc && desc.get ? desc.get.call(ss) : false);
    } });
  } catch (x) {}
})();
