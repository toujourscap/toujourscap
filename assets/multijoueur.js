/* Toujours cap ! — Jouer à plusieurs en même temps sur le même écran (2 à 4 joueurs).
   L'écran est partagé : chaque joueur a sa zone, avec son propre calcul et son propre clavier.
   Chaque zone est le même jeu, chargé avec ?joueur=1, 2…

   Dans la page principale :
     TCMulti.lancer({ nb:2, titre:"additions", meme:true,
                      liste:function(){ return [...] },        // calculs d'un joueur (une seule fois si meme)
                      reglages:{...},                            // relus par chaque zone
                      fiche:function(){...}, bilan:function(res){ return "<h2>…</h2>" } });
   Dans une zone (TCMulti.joueur vaut 1, 2…) :
     var cfg = TCMulti.config();   // {reglages, liste, n}
     TCMulti.fini({ seul:8, nb:10, lignes:["12 + 5 = 17 : ✔", …] });
   Rien n'est enregistré : ni prénom, ni résultat. */
(function () {
  var m = /[?&]joueur=(\d)/.exec(location.search);
  var COUL = ["#1d5bd8", "#d62828", "#1b9447", "#8e44ad"];
  var NOMS = ["Joueur bleu", "Joueur rouge", "Joueur vert", "Joueur violet"];
  var T = window.TCMulti = { joueur: m ? +m[1] : 0, COUL: COUL, NOMS: NOMS };

  /* ---------------- dans une zone de joueur ---------------- */
  if (T.joueur) {
    window.TDC_SANS_UI = true; // pas de badge de la tour de contrôle dans chaque zone
    T.parent = function () { try { return window.parent.TCMulti; } catch (e) { return null; } };
    T.config = function () { var p = T.parent(); return p && p._cfg ? p._cfg(T.joueur) : null; };
    T.fini = function (r) { var p = T.parent(); if (p && p._fini) p._fini(T.joueur, r); };
    T.progres = function (fait, total) { var p = T.parent(); if (p && p._progres) p._progres(T.joueur, fait, total); };
    T.couleur = COUL[T.joueur - 1]; T.nom = NOMS[T.joueur - 1];
    return;
  }

  /* ---------------- dans la page principale ---------------- */
  var CSS =
    "#tcm{position:fixed;inset:0;z-index:9000;background:#3a2a17;display:none;flex-direction:column}" +
    "#tcm.actif{display:flex}" +
    "#tcm-barre{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 8px;background:#fffdf7;font:bold 16px Arial,sans-serif}" +
    "#tcm-barre button{font:inherit;font-size:18px;width:42px;height:38px;border-radius:10px;border:2px solid #cfcfcf;background:#fff;cursor:pointer}" +
    "#tcm-grille{flex:1;display:grid;gap:6px;padding:6px;min-height:0}" +
    ".tcm-zone{display:flex;flex-direction:column;min-width:0;min-height:0;border-radius:12px;overflow:hidden;border:4px solid;background:#fff}" +
    ".tcm-nom{color:#fff;font:bold 15px Arial,sans-serif;padding:2px 10px;display:flex;justify-content:space-between;gap:8px}" +
    ".tcm-zone iframe{flex:1;border:0;width:100%;min-height:0;background:#e9cf9c}" +
    "#tcm-res{position:absolute;inset:0;background:rgba(30,20,10,.6);display:none;align-items:center;justify-content:center;padding:12px;z-index:2}" +
    "#tcm-res.actif{display:flex}" +
    "#tcm-res .boite{background:#fffdf7;border-radius:20px;padding:16px 22px;max-width:620px;width:100%;max-height:100%;overflow:auto;font:20px/1.4 Arial,sans-serif;text-align:center}" +
    "#tcm-res h2{margin:.1em 0 .4em;font-size:1.5em}" +
    "#tcm-res table{width:100%;border-collapse:collapse;margin:.4em 0 .8em}" +
    "#tcm-res td{padding:.35em .5em;border-bottom:1px solid #e6e6e6;text-align:left}" +
    "#tcm-res td:last-child{text-align:right}" +
    "#tcm-res .bts{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}" +
    "#tcm-res .bts button{flex:1 1 140px;font:bold 17px Arial,sans-serif;padding:.6em .5em;border-radius:14px;border:2px solid #cfcfcf;background:#fff;cursor:pointer}" +
    "#tcm-res .bts .prem{background:#ffd54a;border-color:#c79a00;box-shadow:0 4px 0 #c79a00}";
  var el = null, opts = null, listes = [], resultats = {}, t0 = 0;

  function prepare() {
    if (el) return;
    var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    el = document.createElement("div"); el.id = "tcm";
    el.innerHTML = '<div id="tcm-barre"><span id="tcm-titre"></span><span>' +
      '<button id="tcm-plein" title="Plein écran" aria-label="Plein écran">⛶</button> ' +
      '<button id="tcm-stop" title="Arrêter" aria-label="Arrêter">✖</button></span></div>' +
      '<div id="tcm-grille"></div><div id="tcm-res"><div class="boite"></div></div>';
    document.body.appendChild(el);
    el.querySelector("#tcm-stop").onclick = T.fermer;
    el.querySelector("#tcm-plein").onclick = function () {
      var d = document; try { if (!d.fullscreenElement) d.documentElement.requestFullscreen(); else d.exitFullscreen(); } catch (e) {}
    };
    window.addEventListener("resize", disposition);
  }
  function disposition() {
    if (!opts) return;
    var g = el.querySelector("#tcm-grille"), n = opts.nb, large = window.innerWidth >= window.innerHeight;
    var col = n === 4 ? 2 : (large ? n : 1), lig = Math.ceil(n / col);
    g.style.gridTemplateColumns = "repeat(" + col + ",minmax(0,1fr))";
    g.style.gridTemplateRows = "repeat(" + lig + ",minmax(0,1fr))";
  }
  T._cfg = function (j) { return { reglages: opts.reglages, liste: listes[j - 1], n: opts.nb }; };
  T._progres = function (j, fait, total) {
    var s = el.querySelector('[data-j="' + j + '"] .tcm-etat'); if (s) s.textContent = fait + " / " + total;
  };
  T._fini = function (j, r) {
    r.temps = Math.round((Date.now() - t0) / 1000); resultats[j] = r;
    var s = el.querySelector('[data-j="' + j + '"] .tcm-etat'); if (s) s.textContent = "✔ fini";
    if (Object.keys(resultats).length === opts.nb) setTimeout(podium, 900);
  };
  function duree(s) { var mi = Math.floor(s / 60), se = s % 60; return (mi ? mi + " min " : "") + (se < 10 && mi ? "0" : "") + se + " s"; }
  function classement() {
    var l = []; for (var j = 1; j <= opts.nb; j++) if (resultats[j]) l.push({ j: j, r: resultats[j] });
    l.sort(function (a, b) { return (b.r.seul - a.r.seul) || (a.r.temps - b.r.temps); });
    return l;
  }
  function podium() {
    var l = classement(), med = ["🥇", "🥈", "🥉", "4ᵉ"];
    var h = "<h2>Résultats</h2><table>" + l.map(function (x, i) {
      return "<tr><td>" + med[i] + " <b style='color:" + COUL[x.j - 1] + "'>" + NOMS[x.j - 1] + "</b></td><td>" + x.r.seul + " / " + x.r.nb +
        " du premier coup</td><td>" + duree(x.r.temps) + "</td></tr>";
    }).join("") + "</table><p style='font-size:.8em;color:#6b6b6b;margin:0 0 .8em'>Classement : d'abord les calculs réussis du premier coup, puis le temps.</p>" +
      "<div class='bts'><button class='prem' id='tcm-rejouer'>↻ Rejouer</button>" +
      (opts.bilan ? "<button id='tcm-bilan'>📄 Bilan de la partie</button>" : "") +
      (opts.fiche ? "<button id='tcm-fiche'>📄 Fiche d'exercices + corrigé</button>" : "") +
      "<button id='tcm-accueil'>⌂ Accueil</button></div>";
    var r = el.querySelector("#tcm-res"); r.querySelector(".boite").innerHTML = h; r.classList.add("actif");
    r.querySelector("#tcm-rejouer").onclick = function () { T.lancer(opts); };
    r.querySelector("#tcm-accueil").onclick = T.fermer;
    if (opts.fiche) r.querySelector("#tcm-fiche").onclick = function () { opts.fiche(); };
    if (opts.bilan) r.querySelector("#tcm-bilan").onclick = function () {
      var corps = l.map(function (x, i) {
        return "<h2>" + med[i] + " " + NOMS[x.j - 1] + " — " + x.r.seul + " / " + x.r.nb + " du premier coup (" + duree(x.r.temps) + ")</h2><p>" +
          (x.r.lignes || []).join("<br>") + "</p>";
      }).join("");
      opts.bilan(corps);
    };
  }
  T.lancer = function (o) {
    prepare(); opts = o; resultats = {}; listes = [];
    var commune = o.meme ? o.liste() : null;
    for (var j = 0; j < o.nb; j++) listes.push(commune || o.liste());
    el.querySelector("#tcm-titre").textContent = o.nb + " joueurs — " + (o.titre || "") + (o.meme ? " (mêmes calculs)" : "");
    el.querySelector("#tcm-res").classList.remove("actif");
    var g = el.querySelector("#tcm-grille"), base = location.pathname; g.innerHTML = "";
    for (var k = 1; k <= o.nb; k++) {
      var z = document.createElement("div"); z.className = "tcm-zone"; z.dataset.j = k; z.style.borderColor = COUL[k - 1];
      z.innerHTML = '<div class="tcm-nom" style="background:' + COUL[k - 1] + '"><span>' + NOMS[k - 1] + '</span><span class="tcm-etat"></span></div>' +
        '<iframe title="' + NOMS[k - 1] + '" src="' + base + "?joueur=" + k + "&t=" + Date.now() + '"></iframe>';
      g.appendChild(z);
    }
    disposition(); el.classList.add("actif"); t0 = Date.now();
    document.documentElement.style.overflow = "hidden";
  };
  T.fermer = function () {
    if (!el) return;
    el.classList.remove("actif"); el.querySelector("#tcm-grille").innerHTML = ""; opts = null;
    document.documentElement.style.overflow = "";
  };
})();
