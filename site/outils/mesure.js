/* Toujours cap ! — Mesure d'audience des jeux (page /admin/stats).
   Chargé en premier dans chaque jeu (ajouté par build.py). Aucun cookie, aucun prénom, aucune adresse IP.
   Envoie à /api/vue : jeu ouvert, partie commencée (premier clic ou touche), partie finie (TDC.note),
   temps de jeu actif (onglet visible, avec une action depuis moins de 3 min), documents (ouvert, téléchargé, imprimé).
   Dans un jeu : TCStats.fin(cle), TCStats.doc("doc" | "word" | "impr"). */
(function () {
  var noop = { fin: function () {}, doc: function () {} };
  window.TCStats = noop;
  if (!/^https?:$/.test(location.protocol) || !navigator.sendBeacon) return;
  if (/[?&]joueur=\d/.test(location.search)) return; // zone d'un joueur (partie à plusieurs) : déjà comptée par la page principale
  var jeu = (location.pathname.split("/").pop() || "").replace(/\.html$/, "");
  if (!jeu) return;
  var ses = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  function ev(e, x) { try { navigator.sendBeacon("/api/vue", JSON.stringify({ e: e, j: jeu, s: ses, x: x || 0 })); } catch (er) {} }

  var commence = false, derniere = 0, actif = 0, envoye = 0, finies = {}, nFin = 0;
  ev("ouvert");
  function action() {
    derniere = Date.now();
    if (!commence) { commence = true; ev("commence"); }
  }
  ["pointerdown", "keydown", "touchstart"].forEach(function (t) { addEventListener(t, action, { capture: true, passive: true }); });
  setInterval(function () {
    if (commence && document.visibilityState === "visible" && Date.now() - derniere < 180000) {
      actif += 5;
      if (actif - envoye >= 120) duree(); // toutes les 2 min de jeu, au cas où la page se fermerait sans prévenir
    }
  }, 5000);
  function duree() { var d = actif - envoye; if (d > 0) { envoye = actif; ev("duree", d); } }
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") duree(); });
  addEventListener("pagehide", duree);

  // Impressions et téléchargements (Word, PDF…) de tous les jeux, y compris les bilans.
  try {
    var imprimer = window.print;
    window.print = function () { ev("impr"); return imprimer.apply(window, arguments); };
    var clic = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (this.hasAttribute("download")) ev("word"); return clic.apply(this, arguments); };
    document.addEventListener("click", function (e) {
      var a = e.isTrusted && e.target.closest && e.target.closest("a[download]");
      if (a) ev("word");
    }, true);
  } catch (er) {}

  window.TCStats = {
    fin: function (cle) {
      if (cle != null) { if (finies[cle]) return; finies[cle] = 1; }
      if (++nFin > 50) return;
      if (!commence) { commence = true; ev("commence"); }
      ev("fin");
    },
    doc: function (type) { if (/^(doc|word|impr)$/.test(type)) ev(type); }
  };
})();
