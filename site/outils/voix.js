/* Voix du site dans les jeux (enregistrées dans le studio /admin/studio).
   Ce script se place devant la synthèse vocale : quand un jeu demande de dire un texte
   et que tous ses morceaux ont été enregistrés (ex. « 234 » = « deux cents » + « trente-quatre »),
   on joue les enregistrements ; sinon, la voix de l'ordinateur parle comme avant.
   Aucun changement n'est nécessaire dans les jeux : il suffit d'ajouter <script src="voix.js"></script>. */
(function () {
  if (!("speechSynthesis" in window) || window.__voixSite) return;
  window.__voixSite = true;
  var ss = window.speechSynthesis, manifeste = null, jeton = 0, enCours = false, lecteurs = [];

  fetch("/api/voix").then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) { if (d && d.voix) manifeste = d.voix; }).catch(function () {});

  function slug(t) {
    return String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/œ/g, "oe").replace(/æ/g, "ae").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }
  function nombre(n) {
    n = parseInt(n, 10);
    if (n <= 100) return ["n" + n];
    if (n === 1000) return ["n1000"];
    if (n > 1000) return null;
    var c = Math.floor(n / 100) * 100, r = n % 100;
    return r ? ["n" + c, "n" + r] : ["n" + c];
  }
  // Découpe le texte en enregistrements ; null s'il en manque un.
  function decouper(texte) {
    if (!manifeste) return null;
    var t = String(texte || "").trim();
    if (!t) return null;
    var entier = slug(t);
    if (entier && manifeste[entier]) return [entier];
    t = t.replace(/\+/g, " plus ").replace(/=/g, " égal ").replace(/(\d)\s+(?=\d{3}\b)/g, "$1");
    var cles = [], morceaux = t.split(/(\d+)/);
    for (var i = 0; i < morceaux.length; i++) {
      var m = morceaux[i];
      if (/^\d+$/.test(m)) { var l = nombre(m); if (!l) return null; cles = cles.concat(l); }
      else { var s = slug(m); if (s) cles.push(s); }
    }
    for (var j = 0; j < cles.length; j++) if (!manifeste[cles[j]]) return null;
    return cles.length ? cles : null;
  }
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
    var moi = jeton, i = 0;
    lecteurs = cles.map(function (c) { var a = new Audio("/api/voix/" + c + "?v=" + manifeste[c]); a.preload = "auto"; return a; });
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
      var cles = u && u.volume !== 0 ? decouper(u.text) : null;
      if (!cles) return vraiSpeak(u);
      vraiCancel();
      jouer(cles, u);
    };
    ss.cancel = function () { arreter(); vraiCancel(); };
    Object.defineProperty(ss, "speaking", { configurable: true, get: function () {
      return enCours || (desc && desc.get ? desc.get.call(ss) : false);
    } });
  } catch (x) {}
})();
