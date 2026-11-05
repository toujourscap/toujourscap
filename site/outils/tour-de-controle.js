/* Carnet de vol de « La tour de contrôle » — commun à tous les jeux du site.
   L'élève donne son prénom dans la tour de contrôle (/outils/la-tour-de-controle.html) ;
   ensuite chaque jeu note ses résultats ici, dans le navigateur (localStorage).
   Rien n'est envoyé sur Internet : les résultats restent sur cet appareil.

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
    return ecrire(c);
  }

  var TDC = window.TDC = {
    jeu: jeu,
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
    if (noteFaite || seanceFaite || jeu === "la-tour-de-controle" || !TDC.pilote()) return;
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
    if (!p || jeu === "la-tour-de-controle" || !document.body) return;
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
})();
