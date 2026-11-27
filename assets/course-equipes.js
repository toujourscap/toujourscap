/* Toujours cap ! — Course par équipes sur plusieurs tablettes (relais /api/salle, comme la course des additions).
   L'écran de l'enseignant crée la course (code à 4 lettres) et suit la progression des équipes ;
   chaque tablette tape le code et un nom d'équipe, puis résout un maximum de calculs avant la fin du temps.
   Toutes les tablettes ont les mêmes calculs, dans le même ordre (tirage à partir d'une même graine).
   Aucun compte : le nom d'équipe est effacé au bout de 24 h.

   TCEquipes.init({
     jeu:"colonnes-additions", unite:"additions", panneau:élément,   // où placer « créer / rejoindre »
     reglages:function(){ return {...} },          // réglages du jeu choisis sur l'accueil
     libelle:function(R){ return "Additions avec retenue, niveau 2" },
     demarrer:function(R){ ... },                  // R.graine : même tirage partout
     arreter:function(){ ... },                     // fin du temps : la tablette s'arrête
     bilan:function(htmlClassement){ ... }          // document écrit (écran de l'enseignant)
   });
   TCEquipes.resolu(erreurs)  — à appeler par le jeu à chaque calcul résolu. */
(function () {
  var API = "/api/salle";
  var COUL = ["#e9462f", "#3a6fb0", "#2f9b4f", "#d9a400", "#8e44ad", "#e0558f", "#16a3a8", "#8a5a2b"];
  var DUREES = [3, 5, 8, 10];
  var coul = function (id) { return COUL[(id - 1) % COUL.length]; };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var E = window.TCEquipes = {};
  var O = null, M = null, el = null, ban = null, tic = null, duree = 5;

  var CSS =
    ".tce-boites{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}" +
    ".tce-boite{background:#fffdf7;border:2px solid #e3d6bd;border-radius:16px;padding:12px;display:flex;flex-direction:column;gap:8px}" +
    ".tce-boite input,.tce-boite select{font:inherit;padding:.45em .6em;border-radius:10px;border:2px solid #cfcfcf;width:100%;box-sizing:border-box}" +
    ".tce-boite input.code{text-transform:uppercase;letter-spacing:.3em;text-align:center;font-weight:bold;font-size:1.3em}" +
    ".tce-bt{font:bold 1em Arial,sans-serif;padding:.6em .8em;border-radius:14px;border:2px solid #c79a00;background:#ffd54a;box-shadow:0 4px 0 #c79a00;cursor:pointer}" +
    ".tce-bt[disabled]{opacity:.5;cursor:default}" +
    ".tce-bt.gris{background:#fff;border-color:#cfcfcf;box-shadow:0 4px 0 #cfcfcf}" +
    ".tce-err{color:#c0392b;font-weight:bold;min-height:1.2em;margin:.3em 0 0}" +
    "#tce{position:fixed;inset:0;z-index:9500;background:rgba(40,28,14,.72);display:none;align-items:center;justify-content:center;padding:12px;font:20px/1.4 Arial,sans-serif}" +
    "#tce.actif{display:flex}" +
    "#tce .carte{background:#fffdf7;border-radius:22px;padding:18px 22px;width:min(900px,100%);max-height:100%;overflow:auto;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.4)}" +
    "#tce .code{font:800 clamp(3rem,12vw,5.5rem)/1 Arial,sans-serif;letter-spacing:.15em;color:#1d5bd8;margin:.1em 0}" +
    "#tce .puces{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:.6em 0}" +
    "#tce .puce{color:#fff;font-weight:bold;padding:.25em .8em;border-radius:999px}" +
    "#tce .compte{font:800 clamp(4rem,20vw,9rem)/1 Arial,sans-serif;color:#fff;text-shadow:0 4px 0 rgba(0,0,0,.3)}" +
    "#tce .chrono{font:800 clamp(2.6rem,9vw,4.5rem)/1 Arial,sans-serif;margin:.1em 0 .3em}" +
    "#tce .chrono.fin{color:#c0392b}" +
    "#tce .barres{display:flex;flex-direction:column;gap:10px;text-align:left;margin:.4em 0 .8em}" +
    "#tce .ligne{display:grid;grid-template-columns:minmax(90px,170px) 1fr auto;gap:10px;align-items:center}" +
    "#tce .nom{font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    "#tce .piste{height:34px;background:#eee4d2;border-radius:999px;overflow:hidden}" +
    "#tce .barre{height:100%;border-radius:999px;transition:width .6s ease;min-width:8px}" +
    "#tce .nb{font-weight:800;font-size:1.25em;min-width:3.6em;text-align:right}" +
    "#tce .nb small{display:block;font-size:.55em;font-weight:normal;color:#6b6b6b}" +
    "#tce .rang{list-style:none;padding:0;margin:.4em 0 .8em;text-align:left}" +
    "#tce .rang li{display:flex;gap:10px;align-items:center;padding:.35em .2em;border-bottom:1px solid #eee}" +
    "#tce .rang .pos{width:2.2em;text-align:center;font-size:1.2em}" +
    "#tce .rang .sw{width:16px;height:16px;border-radius:50%;flex:none}" +
    "#tce .rang .res{margin-left:auto;font-weight:bold}" +
    "#tce .bts{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}" +
    "#tce .petit{font-size:.8em;color:#6b6b6b}" +
    "#tce-bandeau{position:fixed;top:6px;left:50%;transform:translateX(-50%);z-index:9400;display:none;gap:12px;align-items:center;" +
    "background:#fffdf7;border:3px solid;border-radius:999px;padding:4px 16px;font:bold 18px Arial,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);white-space:nowrap}" +
    "#tce-bandeau.actif{display:flex}#tce-bandeau .t.fin{color:#c0392b}";

  function api(body) {
    return fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) {
        return r.json().catch(function () { return { erreur: "Le serveur ne répond pas. Vérifie la connexion Internet." }; })
          .then(function (d) { if (!r.ok || d.erreur) throw new Error(d.erreur || "Erreur " + r.status); return d; });
      });
  }
  var maintenant = function () { return Date.now() + (M ? M.offset : 0); };
  function mmss(ms) { var s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ":" + ("0" + s % 60).slice(-2); }
  function $(id) { return document.getElementById(id); }
  function nbU(n) { return n + " " + (n > 1 ? O.unite : O.unite.replace(/s$/, "")); }
  function plein() { var d = document; try { if (!d.fullscreenElement) d.documentElement.requestFullscreen(); else d.exitFullscreen(); } catch (e) {} }

  function carte(html) { el.innerHTML = '<div class="carte" role="dialog" aria-live="polite">' + html + "</div>"; el.classList.add("actif"); }
  function cache() { el.classList.remove("actif"); el.innerHTML = ""; }

  E.init = function (o) {
    O = o;
    var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    el = document.createElement("div"); el.id = "tce"; document.body.appendChild(el);
    ban = document.createElement("div"); ban.id = "tce-bandeau"; document.body.appendChild(ban);
    var u = O.unite;
    O.panneau.innerHTML =
      '<div class="tce-boites">' +
      '<div class="tce-boite"><b>👩‍🏫 Écran de l\'enseignant : créer la course</b>' +
      '<span class="petit">Avec les réglages 1 à 3 ci-dessus. Un code s\'affiche : les tablettes le tapent. Cet écran montre la progression des équipes.</span>' +
      '<label>Durée : <select id="tceDuree">' + DUREES.map(function (d) { return '<option value="' + d + '"' + (d === 5 ? " selected" : "") + ">" + d + " minutes</option>"; }).join("") + "</select></label>" +
      '<button class="tce-bt" id="tceCreer">Créer la course</button></div>' +
      '<div class="tce-boite"><b>📱 Tablette d\'une équipe : rejoindre</b>' +
      '<input id="tceCode" class="code" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="CODE" aria-label="Code de la course">' +
      '<input id="tceNom" maxlength="16" autocomplete="off" placeholder="Nom de l\'équipe" aria-label="Nom de l\'équipe">' +
      '<button class="tce-bt" id="tceJoindre">Rejoindre</button></div></div>' +
      '<p class="tce-err" id="tceErr" role="alert"></p>' +
      '<p class="petit" style="margin:0">Jusqu\'à 8 tablettes connectées à Internet. Toutes les équipes ont les mêmes ' + u + ', dans le même ordre : l\'équipe qui en résout le plus avant la fin du temps gagne. Aucun compte : le nom d\'équipe est effacé au bout de 24 h.</p>';
    $("tceCode").oninput = function (e) { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4); };
    $("tceCode").onkeydown = function (e) { if (e.key === "Enter") { e.preventDefault(); $("tceNom").focus(); } };
    $("tceNom").onkeydown = function (e) { if (e.key === "Enter") { e.preventDefault(); $("tceJoindre").click(); } };
    $("tceCreer").onclick = creer;
    $("tceJoindre").onclick = rejoindre;
    window.addEventListener("pagehide", function () { if (M) quitte(); });
  };
  function err(t) { $("tceErr").textContent = t || ""; }
  function nouvelle(o) { var m = { id: 0, jeton: "", nom: "", hote: "", manche: 0, offset: 0, rtt: 1e9, vue: "attente", echecs: 0, bons: 0, erreurs: 0 }; for (var k in o) m[k] = o[k]; return m; }

  function creer() {
    err(""); var b = $("tceCreer"); b.disabled = true;
    duree = +$("tceDuree").value || 5;
    api({ a: "creer", jeu: O.jeu, reglages: regl() })
      .then(function (d) { M = nouvelle({ code: d.code, hote: d.hote }); attente(); })
      .catch(function (e) { err(e.message); })
      .then(function () { b.disabled = false; });
  }
  function regl() {
    var r = O.reglages(), o = {}; for (var k in r) o[k] = r[k];
    o.duree = duree; o.graine = 1 + Math.floor(Math.random() * 1e9); return o;
  }
  function rejoindre() {
    err(""); var code = $("tceCode").value.trim().toUpperCase(), nom = $("tceNom").value.trim();
    if (code.length !== 4) return err("Le code a 4 lettres.");
    if (!nom) return err("Écris un nom d'équipe.");
    var b = $("tceJoindre"); b.disabled = true;
    api({ a: "rejoindre", code: code, nom: nom })
      .then(function (j) { M = nouvelle({ code: code, id: j.id, jeton: j.jeton, nom: j.nom }); attente(); })
      .catch(function (e) { err(e.message); })
      .then(function () { b.disabled = false; });
  }

  /* ---------- relève de l'état (toutes les 1 à 1,5 s) ---------- */
  function poll() {
    var m = M; if (!m) return;
    clearTimeout(m.timer);
    var t1 = Date.now();
    fetch(API + "?code=" + m.code + (m.id ? "&id=" + m.id : ""), { cache: "no-store" })
      .then(function (r) {
        return r.json().catch(function () { return { erreur: "Réponse illisible" }; }).then(function (d) {
          var t2 = Date.now(); if (M !== m) return;
          if (r.status === 404) { finSalle("Cette course n'existe plus."); return; }
          if (!r.ok) throw new Error(d.erreur);
          var rtt = t2 - t1;
          if (rtt <= m.rtt * 1.3 + 20) { m.offset = d.maintenant - (t1 + t2) / 2; m.rtt = Math.min(m.rtt, rtt); }
          m.echecs = 0; m.etat = d;
          if (m.aRenvoyer) envoie();
          surEtat(d);
        });
      })
      .catch(function () { if (M === m) m.echecs++; })
      .then(function () { if (M === m) m.timer = setTimeout(poll, m.vue === "course" ? 1000 : 1500); });
  }
  function surEtat(d) {
    if (d.statut === "course" && d.manche > M.manche) { M.manche = d.manche; depart(d); return; }
    if (M.vue === "attente") majAttente(d);
    else if (M.vue === "course" || M.vue === "temps") {
      if (M.hote) majHote(d);
      if (d.statut === "fini") podium(d);
    }
  }
  function equipes(d) {
    return d.joueurs.map(function (j) {
      return j.id === M.id && (M.vue === "course" || M.vue === "temps") ? { id: j.id, nom: j.nom, bons: Math.max(j.bons, M.bons), erreurs: Math.max(j.erreurs, M.erreurs) } : j;
    });
  }
  function classe(js) { return js.slice().sort(function (a, b) { return (b.bons - a.bons) || (a.erreurs - b.erreurs); }); }

  /* ---------- attente ---------- */
  function attente() {
    M.vue = "attente"; M.cle = "";
    carte('<p style="margin:0">Code de la course</p><div class="code">' + M.code + "</div>" +
      '<p id="tceInfo">' + (M.hote ? "Sur chaque tablette : <b>📱 Rejoindre</b>, puis taper ce code et le nom de l'équipe." : "Équipe <b>" + esc(M.nom) + "</b>") + "</p>" +
      '<div class="puces" id="tcePuces"></div>' +
      (M.hote ? '<div class="bts"><button class="tce-bt" id="tceGo" disabled>Partez ! 🏁</button><button class="tce-bt gris" id="tceQuit">Annuler</button></div>'
        : '<p><b>En attente du départ…</b></p><div class="bts"><button class="tce-bt gris" id="tceQuit">Quitter</button></div>'));
    if (M.hote) $("tceGo").onclick = function () { lancer(false); };
    $("tceQuit").onclick = menu;
    poll();
  }
  function majAttente(d) {
    var cle = JSON.stringify(d.joueurs.map(function (j) { return [j.id, j.nom]; }));
    if (cle === M.cle || !$("tcePuces")) return; M.cle = cle;
    var n = d.joueurs.length;
    $("tcePuces").innerHTML = n ? d.joueurs.map(function (j) { return '<span class="puce" style="background:' + coul(j.id) + '">' + esc(j.nom) + (j.id === M.id ? " (vous)" : "") + "</span>"; }).join("")
      : '<span class="petit">Aucune équipe pour l\'instant…</span>';
    $("tceInfo").innerHTML = (M.hote ? "Sur chaque tablette : <b>📱 Rejoindre</b>, puis taper ce code et le nom de l'équipe.<br>" : "Équipe <b>" + esc(M.nom) + "</b><br>") +
      esc(O.libelle(d.reglages)) + " · " + d.reglages.duree + " min · " + n + " équipe" + (n > 1 ? "s" : "");
    if ($("tceGo")) $("tceGo").disabled = !n;
  }
  function lancer(nouveau) {
    if (!M || !M.etat) return;
    var r = M.etat.reglages;
    if (nouveau) { duree = +($("tceDuree2") ? $("tceDuree2").value : r.duree) || r.duree; r = regl(); }
    document.querySelectorAll("#tceGo,#tceRevanche").forEach(function (b) { b.disabled = true; });
    api({ a: "partir", code: M.code, hote: M.hote, reglages: r }).then(poll)
      .catch(function (e) { alert(e.message); document.querySelectorAll("#tceGo,#tceRevanche").forEach(function (b) { b.disabled = false; }); });
  }

  /* ---------- départ, course ---------- */
  function depart(d) {
    M.vue = "course"; M.bons = 0; M.erreurs = 0; M.demarre = false; M.arretDemande = false;
    M.debut = d.debut; M.fin = d.debut + d.reglages.duree * 60000; M.reglages = d.reglages;
    clearInterval(tic); tic = setInterval(battement, 200); battement();
  }
  function battement() {
    if (!M || (M.vue !== "course" && M.vue !== "temps")) { clearInterval(tic); return; }
    var t = maintenant();
    if (t < M.debut) { // compte à rebours
      var n = Math.ceil((M.debut - t) / 1000), aff = n > 3 ? "Prêts ?" : String(n);
      if (M.aff !== aff) { M.aff = aff; el.innerHTML = '<div class="compte">' + aff + "</div>"; el.classList.add("actif"); }
      return;
    }
    if (!M.demarre) {
      M.demarre = true;
      if (M.hote) vueHote();
      else { cache(); O.demarrer(M.reglages); bandeau(); }
    }
    var reste = M.fin - t;
    if (M.hote) {
      var c = $("tceChrono"); if (c) { c.textContent = mmss(reste); c.classList.toggle("fin", reste < 30000); }
      if (reste <= 0 && !M.arretDemande) { M.arretDemande = true; api({ a: "arreter", code: M.code, hote: M.hote }).then(poll).catch(function () { M.arretDemande = false; }); }
    } else {
      bandeau();
      if (reste <= 0 && M.vue === "course") tempsEcoule();
    }
  }
  function bandeau() {
    if (!M || M.hote) return;
    var reste = M.fin - maintenant();
    ban.style.borderColor = coul(M.id);
    ban.innerHTML = '<span style="color:' + coul(M.id) + '">' + esc(M.nom) + '</span><span class="t' + (reste < 30000 ? " fin" : "") + '">⏱ ' + mmss(reste) +
      "</span><span>✔ " + M.bons + "</span>";
    ban.classList.add("actif");
  }
  E.resolu = function (erreurs) {
    if (!M || M.hote || M.vue !== "course") return;
    M.bons++; M.erreurs += Math.max(0, erreurs | 0); bandeau(); envoie();
  };
  E.actif = function () { return !!(M && !M.hote && M.vue === "course"); };
  E.quitter = function () { menu(); };
  function envoie() {
    if (!M || !M.id) return;
    var m = M, corps = { a: "score", code: m.code, id: m.id, jeton: m.jeton, bons: m.bons, erreurs: m.erreurs, temps: null };
    m.aRenvoyer = false;
    m.envoi = (m.envoi || Promise.resolve()).then(function () { return api(corps); }).catch(function () { m.aRenvoyer = true; });
  }
  function tempsEcoule() {
    M.vue = "temps"; envoie();
    try { O.arreter(); } catch (e) {}
    ban.classList.remove("actif");
    carte('<h2 style="margin:.2em 0">⏰ Temps écoulé !</h2><p>Équipe <b style="color:' + coul(M.id) + '">' + esc(M.nom) + "</b> : <b>" + nbU(M.bons) + "</b> résolue" + (M.bons > 1 ? "s" : "") + ".</p><p class=\"petit\">Résultats dans un instant…</p>");
  }

  /* ---------- écran de l'enseignant : progression ---------- */
  function vueHote() {
    carte('<p style="margin:0" class="petit">Course ' + M.code + " · " + esc(O.libelle(M.reglages)) + "</p>" +
      '<div class="chrono" id="tceChrono"></div><div class="barres" id="tceBarres"></div>' +
      '<div class="bts"><button class="tce-bt gris" id="tcePlein">⛶ Plein écran</button><button class="tce-bt gris" id="tceStop">Arrêter la course</button></div>');
    $("tcePlein").onclick = plein;
    $("tceStop").onclick = function () { M.arretDemande = true; api({ a: "arreter", code: M.code, hote: M.hote }).then(poll).catch(function (e) { alert(e.message); }); };
    if (M.etat) majHote(M.etat);
  }
  function majHote(d) {
    var b = $("tceBarres"); if (!b) return;
    var js = classe(d.joueurs), max = Math.max(5, js.length ? js[0].bons : 0);
    b.innerHTML = js.map(function (j, i) {
      return '<div class="ligne"><span class="nom" style="color:' + coul(j.id) + '">' + (i === 0 && j.bons ? "👑 " : "") + esc(j.nom) + '</span>' +
        '<div class="piste"><div class="barre" style="width:' + Math.round(100 * j.bons / max) + "%;background:" + coul(j.id) + '"></div></div>' +
        '<span class="nb">' + j.bons + "<small>" + j.erreurs + " erreur" + (j.erreurs > 1 ? "s" : "") + "</small></span></div>";
    }).join("") || '<p class="petit">Aucune équipe.</p>';
  }

  /* ---------- résultats ---------- */
  function podium(d) {
    if (M.vue === "podium") return;
    if (!M.hote && M.vue === "course") { try { O.arreter(); } catch (e) {} }
    M.vue = "podium"; clearInterval(tic); ban.classList.remove("actif");
    var cl = classe(equipes(d)), med = ["🥇", "🥈", "🥉"], g = cl[0];
    M.dernier = cl;
    carte("<h2 style=\"margin:.2em 0\">" + (g && g.bons ? 'Bravo <span style="color:' + coul(g.id) + '">' + esc(g.nom) + "</span> !" : "Course terminée") + "</h2>" +
      '<p class="petit" style="margin:0">' + esc(O.libelle(d.reglages)) + " · " + d.reglages.duree + " min</p>" +
      '<ol class="rang">' + cl.map(function (j, i) {
        return '<li><span class="pos">' + (med[i] || (i + 1) + "ᵉ") + '</span><span class="sw" style="background:' + coul(j.id) + '"></span><span>' + esc(j.nom) + (j.id === M.id ? " (vous)" : "") +
          '</span><span class="res">' + nbU(j.bons) + ' <span class="petit">· ' + j.erreurs + " erreur" + (j.erreurs > 1 ? "s" : "") + "</span></span></li>";
      }).join("") + "</ol>" +
      (M.hote ? '<p><label>Revanche : <select id="tceDuree2">' + DUREES.map(function (x) { return '<option value="' + x + '"' + (x === d.reglages.duree ? " selected" : "") + ">" + x + " minutes</option>"; }).join("") + "</select></label></p>" +
        '<div class="bts"><button class="tce-bt" id="tceRevanche">Revanche 🏁</button><button class="tce-bt gris" id="tceBilan">📄 Bilan de la course</button><button class="tce-bt gris" id="tceMenu">Menu</button></div>'
        : '<p class="petit">L\'enseignant peut lancer une revanche : restez sur cette tablette.</p><div class="bts"><button class="tce-bt gris" id="tceMenu">Menu</button></div>'));
    $("tceMenu").onclick = menu;
    if (M.hote) {
      $("tceRevanche").onclick = function () { lancer(true); };
      $("tceBilan").onclick = function () {
        if (!O.bilan) return;
        O.bilan("<p>" + esc(O.libelle(d.reglages)) + " — course de " + d.reglages.duree + " minutes, " + cl.length + " équipe" + (cl.length > 1 ? "s" : "") + "</p>" +
          "<table style=\"border-collapse:collapse;width:100%\"><tr><th style=\"text-align:left;border-bottom:1px solid #999\">Rang</th><th style=\"text-align:left;border-bottom:1px solid #999\">Équipe</th><th style=\"border-bottom:1px solid #999\">" + O.unite + " résolues</th><th style=\"border-bottom:1px solid #999\">Erreurs</th></tr>" +
          cl.map(function (j, i) { return "<tr><td>" + (i + 1) + "</td><td>" + esc(j.nom) + "</td><td style=\"text-align:center\">" + j.bons + "</td><td style=\"text-align:center\">" + j.erreurs + "</td></tr>"; }).join("") + "</table>");
      };
    }
  }
  function finSalle(msg) {
    var m = M; M = null; if (m) clearTimeout(m.timer); clearInterval(tic);
    try { O.arreter(); } catch (e) {}
    ban.classList.remove("actif");
    carte("<h2>Oups</h2><p>" + esc(msg) + '</p><div class="bts"><button class="tce-bt" id="tceMenu">Menu</button></div>');
    $("tceMenu").onclick = function () { cache(); };
  }
  function quitte() {
    var m = M; M = null; if (!m) return; clearTimeout(m.timer); clearInterval(tic);
    if (m.id) fetch(API, { method: "POST", headers: { "content-type": "application/json" }, keepalive: true,
      body: JSON.stringify({ a: "quitter", code: m.code, id: m.id, jeton: m.jeton }) }).catch(function () {});
  }
  function menu() {
    var jouait = E.actif() || (M && M.vue === "temps");
    quitte(); ban.classList.remove("actif"); cache();
    if (jouait) { try { O.arreter(); } catch (e) {} }
  }
})();
