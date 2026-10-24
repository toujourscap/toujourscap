// Commentaires sous les articles : affichage des messages approuvés + formulaire.
(function () {
  var bloc = document.getElementById("commentaires");
  if (!bloc) return;
  var page = bloc.getAttribute("data-page");
  var liste = bloc.querySelector(".com-liste");
  var form = bloc.querySelector("form");
  var etat = bloc.querySelector(".com-etat");
  var debut = Date.now();

  function date(s) {
    var d = new Date(s.replace(" ", "T") + "Z");
    return isNaN(d) ? "" : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  }

  function afficher(coms) {
    liste.innerHTML = "";
    if (!coms.length) {
      liste.innerHTML = '<p class="muted small">Aucun commentaire pour l’instant. Soyez le premier !</p>';
      return;
    }
    coms.forEach(function (c) {
      var div = document.createElement("div");
      div.className = "com";
      var tete = document.createElement("p");
      tete.className = "com-tete";
      var nom = document.createElement("strong");
      nom.textContent = c.nom;
      tete.appendChild(nom);
      tete.appendChild(document.createTextNode(" · " + date(c.cree_le)));
      var txt = document.createElement("p");
      txt.className = "com-texte";
      txt.textContent = c.message;
      div.appendChild(tete);
      div.appendChild(txt);
      liste.appendChild(div);
    });
  }

  fetch("/api/commentaires?page=" + encodeURIComponent(page))
    .then(function (r) { if (!r.ok) throw 0; return r.json(); })
    .then(function (d) { afficher(d.commentaires || []); bloc.hidden = false; })
    .catch(function () { bloc.hidden = true; }); // service indisponible : on masque la section

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var bouton = form.querySelector("button");
    bouton.disabled = true;
    etat.className = "com-etat";
    etat.textContent = "Envoi…";
    fetch("/api/commentaires", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ page: page, nom: form.nom.value, message: form.message.value, site: form.site.value, t: debut }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (x) {
        if (!x.ok) throw new Error(x.d.erreur || "Erreur");
        form.reset();
        etat.className = "com-etat ok";
        etat.textContent = "Merci ! Votre message a bien été envoyé. Il apparaîtra après relecture.";
      })
      .catch(function (err) {
        etat.className = "com-etat err";
        etat.textContent = err.message && err.message !== "Erreur" ? err.message : "L’envoi n’a pas fonctionné, réessayez plus tard.";
      })
      .then(function () { bouton.disabled = false; });
  });
})();
