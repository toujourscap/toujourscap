/* Toujours cap ! — Document écrit commun à tous les jeux (fiche d'exercices, bilan de partie).
   Utilisation dans un jeu :
     DocEcrit.ouvrir({ titre:"Fiche d'exercices", jeu:"Le bal masqué des nombres", nom:"Fiche bal masqué",
                       prenom:true, html:(prenom)=>"<h2>…</h2>…" });
   Affiche le document à l'écran, avec « Télécharger (Word) », « Imprimer » et « Fermer ».
   Le prénom (facultatif) sert seulement au document : rien n'est enregistré ni envoyé. */
(function(){
  const CSS=`
  #docEcrit{position:fixed;inset:0;background:rgba(30,30,40,.55);z-index:9999;display:none;align-items:flex-start;justify-content:center;overflow:auto;padding:16px}
  #docEcrit .de-boite{background:#fff;max-width:820px;width:100%;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.3);font-family:Arial,sans-serif;color:#222}
  #docEcrit .de-barre{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px;border-bottom:1px solid #ddd;position:sticky;top:0;background:#fff;border-radius:14px 14px 0 0}
  #docEcrit .de-barre button{font-size:1rem;padding:9px 14px;border-radius:10px;border:2px solid #2f5d8a;background:#fff;color:#2f5d8a;cursor:pointer;font-family:inherit}
  #docEcrit .de-barre button.de-tel{background:#2e8b57;border-color:#2e8b57;color:#fff}
  #docEcrit .de-barre input{font-size:1rem;padding:8px;border:2px solid #ccc;border-radius:10px;width:170px}
  #docEcrit .de-msg{width:100%;font-size:.85rem;color:#555}
  #docEcrit .de-doc{padding:22px 26px;font-size:15px;line-height:1.5}
  #docEcrit .de-doc h1{font-size:22px;margin:0 0 4px;color:#7b4fa0}
  #docEcrit .de-doc h2{font-size:17px;margin:18px 0 6px;color:#2f5d8a}
  #docEcrit .de-doc table{border-collapse:collapse;margin:6px 0}
  #docEcrit .de-doc td,#docEcrit .de-doc th{border:1px solid #888;padding:4px 8px}
  #docEcrit .de-doc .saut{border-top:2px dashed #bbb;margin-top:24px;padding-top:8px}
  @media print{body.de-imprime>*:not(#docEcrit){display:none!important}body.de-imprime #docEcrit{position:static;background:none;padding:0;display:block!important}
    body.de-imprime .de-barre{display:none!important}body.de-imprime .de-boite{box-shadow:none;max-width:none}
    body.de-imprime .de-doc .saut{border:none;page-break-before:always;break-before:page}}`;
  const PIED='<p style="font-size:11px;color:#777;margin-top:24px">Toujours cap ! — toujourscap.com — licence CC BY-NC-SA 4.0</p>';
  let opts=null,el=null;
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  function date(){return new Date().toLocaleDateString("fr-FR");}
  function prepare(){
    if(el)return;
    const st=document.createElement("style");st.textContent=CSS;document.head.appendChild(st);
    el=document.createElement("div");el.id="docEcrit";
    el.innerHTML=`<div class="de-boite"><div class="de-barre">
      <input type="text" class="de-prenom" placeholder="Prénom (facultatif)" maxlength="30">
      <button class="de-tel">📄 Télécharger (Word)</button><button class="de-imp">🖨 Imprimer</button><button class="de-fer">✖ Fermer</button>
      <div class="de-msg">Le prénom sert seulement au document : rien n'est enregistré.</div></div><div class="de-doc"></div></div>`;
    document.body.appendChild(el);
    el.querySelector(".de-prenom").oninput=rendu;
    el.querySelector(".de-fer").onclick=()=>{el.style.display="none";};
    el.onclick=e=>{if(e.target===el)el.style.display="none";};
    el.querySelector(".de-imp").onclick=()=>{document.body.classList.add("de-imprime");
      try{window.print();}catch(e){msg("L'impression n'est pas possible ici : elle fonctionne sur le site.");}
      setTimeout(()=>document.body.classList.remove("de-imprime"),800);};
    el.querySelector(".de-tel").onclick=telecharger;
  }
  function msg(t){el.querySelector(".de-msg").textContent=t;}
  function prenom(){return (el.querySelector(".de-prenom").value||"").trim();}
  function corps(){
    const p=prenom();
    return `<h1>${esc(opts.jeu)} — ${esc(opts.titre)}</h1>
      <p>${opts.prenom?`Prénom : <b>${p?esc(p):"…………………………"}</b> &nbsp;&nbsp; `:""}Date : ${date()}</p>${opts.html(p)}${PIED}`;
  }
  function rendu(){el.querySelector(".de-doc").innerHTML=corps();}
  function telecharger(){
    const word=corps().replace(/<div class="saut">/g,'<div class="saut" style="page-break-before:always">');
    const html=`<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(opts.titre)}</title>
      <style>@page{size:21cm 29.7cm;margin:1.8cm}body{font-family:Arial,sans-serif;font-size:12pt;line-height:1.5}h1{font-size:17pt;color:#7b4fa0}h2{font-size:13pt;color:#2f5d8a;margin-top:14pt}
      table{border-collapse:collapse}td,th{border:1px solid #888;padding:3pt 6pt}</style></head><body>${word}</body></html>`;
    const nom=(opts.nom+" "+(prenom()||"")+" "+date().replace(/\//g,"-")).replace(/[\\/:*?"<>|]/g,"").replace(/\s+/g," ").trim()+".doc";
    try{const u=URL.createObjectURL(new Blob(["﻿"+html],{type:"application/msword"}));const a=document.createElement("a");a.href=u;a.download=nom;
      document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000);msg("Document téléchargé : "+nom+" (si rien ne se passe ici, le téléchargement fonctionne sur le site).");}
    catch(e){msg("Le téléchargement n'est pas possible ici : il fonctionne sur le site.");}
  }
  window.DocEcrit={ouvrir(o){prepare();try{window.TCStats&&TCStats.doc("doc");}catch(e){}opts=Object.assign({prenom:true,nom:o.titre},o);
    el.querySelector(".de-prenom").style.display=opts.prenom?"":"none";msg("Le prénom sert seulement au document : rien n'est enregistré.");
    rendu();el.style.display="flex";el.scrollTop=0;}};
})();
