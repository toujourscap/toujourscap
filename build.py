#!/usr/bin/env python3
"""Génère le site statique « Toujours cap ! » à partir des articles exportés de Wix."""
import json, os, re, shutil, unicodedata, html
from datetime import datetime

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "site")
WIX = "https://static.wixstatic.com/media/"
SITE = "https://toujourscap.com"
SITE_NAME = "Toujours cap !"
DEFAULT_IMAGE = WIX + "5e2b25_c155231f9ab94725964005e45ffe27e2~mv2.jpg"
SITEMAP = []  # (chemin, date de modification)
TITRES = {}  # chemin → titre de la page
# Logo en bandeau, intégré directement dans la page pour profiter de la police Fraunces.
LOGO_BANDEAU = re.sub(r"\s*<!--.*?-->", "", open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "logo-bandeau.svg")).read().strip()).replace(
    '<svg ', '<svg class="logo-bandeau" aria-hidden="true" focusable="false" ', 1).replace(' role="img" aria-label="Toujours cap !"', "")


def _version(nom):
    """Empreinte du fichier, ajoutée à l'URL pour que les navigateurs prennent toujours la dernière version."""
    import hashlib
    return hashlib.md5(open(os.path.join(ROOT, "assets", nom), "rb").read()).hexdigest()[:8]


CSS_V = _version("style.css")
JS_V = _version("commentaires.js")
# Lien de paiement pour l'encart « Offrir un café » (page Qui suis-je ?). Vide = encart masqué.
DON_URL = ""
# Bouton Ko-fi sur la page Qui suis-je ? (mettre True pour le réafficher)
KOFI_ACTIF = False
KOFI_HTML = """  <div class="kofi"><script type='text/javascript' src='https://storage.ko-fi.com/cdn/widget/Widget_2.js'></script><script type='text/javascript'>kofiwidget2.init('Offrir un café ☕', '#72a4f2', 'Z5K629G818');kofiwidget2.draw();</script></div>
"""
JACKPOT_URL = "https://b0bbbd46-7a7a-40c3-ab1e-0aebb386faeb.filesusr.com/html/5e2b25_648fdee2fa523d3b1c131a04e3d6b955.html"

CATS = {
    "cercle-conteur": {"name": "Langage oral", "desc": "Outils et contes pour mener des cercles conteurs en GS et CP.", "domain": "francais"},
    "lecture": {"name": "Lecture", "desc": "Jeux et outils numériques pour lire plus vite et avec plaisir au CP et au CE1 : tachistoscope, téléprompteurs, jeux de déchiffrage.", "domain": "francais"},
    "numeration": {"name": "Numération", "desc": "Activités et outils pour lire, dire et manipuler les nombres au cycle 2.", "domain": "maths"},
    "calcul": {"name": "Calcul", "desc": "Jeux pour automatiser le calcul mental au cycle 2 : tables d'addition et de multiplication.", "domain": "maths"},
}
# Jeux de lecture : compétence travaillée (filtres de la page Lecture) et repères affichés sur les vignettes.
# Dans posts.json, chaque jeu porte un champ "jeu" :
#   {"competence": "sons-syllabes", "niveaux": ["CP"], "joueurs": "2 joueurs", "supports": ["ecran", "imprimable", "projetable"]}
COMPETENCES = {
    "sons-syllabes": "Sons et syllabes",
    "mots": "Mots",
    "phrases-textes": "Phrases et textes",
    "fluence": "Fluence",
    # Jeux de calcul (onglets de la page Calcul)
    "addition": "Addition",
    "multiplication": "Multiplication",
}
SUPPORTS = {"ecran": ("🖥️", "À l'écran"), "imprimable": ("🖨️", "À imprimer"), "projetable": ("📽️", "Projetable")}
CAT_IDS = {"99949fe7-71e5-42b1-bfde-2cc31c2dac61": "cercle-conteur", "4508e272-b88b-42c8-a68d-b55e8afea67b": "numeration"}

# Images rapatriées localement (identifiant Wix -> chemin sur le site)
LOCAL_IMAGES = {
    "5e2b25_8e1e3a5e38e34c2e87be88227464213b~mv2.jpg": "/images/radis/01-graine.jpg",
    "5e2b25_2a7ef24cb4b04b92bc0f97af5a4647fc~mv2.jpg": "/images/radis/02-radis-geant.jpg",
    "5e2b25_eef56e7531914e43a4d6815921dc9cad~mv2.jpg": "/images/radis/03-papi.jpg",
    "5e2b25_60baf114cf9e47c7abc67d1132765c74~mv2.jpg": "/images/radis/04-mamie.jpg",
    "5e2b25_cf0a9f31e4024e3598c38d177a035852~mv2.jpg": "/images/radis/05-petite-fille.jpg",
    "5e2b25_da49de5ef5ea4abea3d3d75926444dd2~mv2.jpg": "/images/radis/06-chien.jpg",
    "5e2b25_a46eda32a3894ae3a428f84cdf200631~mv2.jpg": "/images/radis/07-chat.jpg",
    "5e2b25_a8791a9d613648e6918ec94bdb9c01f5~mv2.jpg": "/images/radis/08-souris.jpg",
    "5e2b25_5f68ac9bbc6a4c68a532937c9eab83cb~mv2.jpg": "/images/radis/09-tout-le-monde-tombe.jpg",
    "5e2b25_651e0f1b36634860b8a30def4faf8eef~mv2.jpg": "/images/radis/10-soupe.jpg",
}


def img_url(ref):
    """Renvoie l'image locale si elle a été rapatriée, sinon l'URL Wix."""
    key = ref.replace(WIX, "")
    return LOCAL_IMAGES.get(key) or (ref if ref.startswith("http") else WIX + ref)


# Outils de lecture rapide : chacun a sa page /francais/lecture/<clé>/ et une vignette dans l'article.
TOOLS = {
    "tachistoscope": {
        "title": "Lecture rapide de mots",
        "desc": "Les mots apparaissent un par un : l'élève les lit le plus vite possible. Si le mot résiste, une aide audio le lit après quelques secondes.",
        "seo": "Tachistoscope en ligne gratuit : lecture rapide de mots CP-CE1",
        "niveaux": ["CP", "CE1"], "maj": "2026-10-23",
        "src": "/outils/lecture-rapide-de-mots-avec-le-tachitoscope.html", "height": 1210,
        "img": "/images/outils/tachistoscope.jpg"},
    "teleprompteur-de-lecture": {
        "title": "Fluence sur 3 niveaux de texte du CP au CE1",
        "desc": "Le texte s'affiche ligne par ligne et un trait avance sous les mots, à la vitesse choisie en mots par minute. Trois textes au choix (sons simples, quelques sons complexes, niveau CE1), ou son propre texte.",
        "seo": "Téléprompteur de lecture en ligne : fluence CP-CE1",
        "niveaux": ["CP", "CE1"], "maj": "2026-10-24",
        "src": "/outils/teleprompteur-de-lecture.html", "height": 860,
        "img": "/images/outils/teleprompteur-de-lecture.jpg"},
    "teleprompteur-a-l-ecoute": {
        "title": "Fluence qui s'adapte automatiquement au rythme de l'enfant",
        "desc": "L'élève lit à voix haute et le texte avance au rythme de sa lecture, avec sa vitesse en mots par minute. Fonctionne uniquement avec Chrome ou Edge.",
        "note": "<strong>Navigateur : Google Chrome ou Microsoft Edge uniquement.</strong> La reconnaissance vocale ne fonctionne pas avec Firefox, Safari ou les autres navigateurs. Sinon, le texte peut tout de même avancer avec la barre d'espace.",
        "seo": "Fluence CP-CE1 avec reconnaissance vocale : lecture à voix haute",
        "niveaux": ["CP", "CE1"], "maj": "2026-10-24",
        "src": "/outils/teleprompteur-a-l-ecoute.html", "height": 860,
        "img": "/images/outils/teleprompteur-a-l-ecoute.jpg"},
}


def tool_ld(k, t):
    """Données structurées d'une page d'outil : ressource pédagogique + fil d'Ariane."""
    url = f"{SITE}/francais/lecture/{k}/"
    crumbs = [("Français", "/francais/"), ("Lecture", "/francais/lecture/"), (t["title"], f"/francais/lecture/{k}/")]
    return [{"@context": "https://schema.org", "@type": "LearningResource", "name": t["title"],
             "description": t["desc"], "url": url, "inLanguage": "fr-FR", "image": SITE + t["img"],
             "learningResourceType": "Outil interactif", "educationalLevel": t.get("niveaux", []),
             "audience": {"@type": "EducationalAudience", "educationalRole": "teacher"},
             "teaches": "Lecture", "isAccessibleForFree": True, **({"dateModified": t["maj"]} if t.get("maj") else {}),
             "publisher": {"@type": "Organization", "name": SITE_NAME, "url": SITE + "/"}},
            {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
                {"@type": "ListItem", "position": i + 1, "name": n, "item": SITE + h} for i, (n, h) in enumerate(crumbs)]}]


def tool_card(k):
    t = TOOLS[k]
    return f"""<a class="card" href="/francais/lecture/{k}/">
  <div class="card-img"><img src="{t['img']}" alt="{esc(t['title'])}" loading="lazy"></div>
  <div class="card-body"><h3>{esc(t['title'])}</h3><p>{esc(t['desc'])}</p><span class="link">Ouvrir l'outil →</span></div>
</a>"""


MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]


def ascii_slug(s):
    s = s.replace("œ", "oe").replace("Œ", "oe")
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def fr_date(iso):
    d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    return f"{d.day} {MONTHS[d.month - 1]} {d.year}"


def meta_desc(s, n=158):
    """Coupe une description trop longue au dernier mot entier."""
    s = " ".join((s or "").split())
    if len(s) <= n:
        return s
    return s[:n].rsplit(" ", 1)[0].rstrip(" ,;:.") + "…"


TOOL_CANON = {}  # page d'outil autonome -> page de référence


def esc(s):
    return html.escape(s or "", quote=True)


# ---------- Jeu intégré, avec un seul bouton « Plein écran » bien visible au-dessus ----------
PLEIN_ECRAN_JS = """<script>
function pleinEcran(b){
  var f = b.closest('.embed').querySelector('iframe');
  var req = f.requestFullscreen || f.webkitRequestFullscreen;
  if (req) { try { var p = req.call(f); if (p && p.catch) p.catch(function () { window.open(f.src, '_blank'); }); return; } catch (e) {} }
  window.open(f.src, '_blank');  // iPhone : pas de plein écran possible, on ouvre le jeu seul
}
</script>"""


def embed(src, height, title, lazy=False):
    # Empreinte du fichier dans l'adresse : le navigateur recharge le jeu dès qu'il change.
    local = os.path.join(ROOT, "assets", os.path.basename(src)) if src.startswith("/outils/") else ""
    if local and os.path.exists(local) and "?" not in src:
        import hashlib
        src += "?v=" + hashlib.md5(open(local, "rb").read()).hexdigest()[:8]
    return (f'<div class="embed"><div class="embed-bar"><button class="btn embed-fs" type="button" onclick="pleinEcran(this)">⛶ Plein écran</button></div>'
            f'<iframe src="{esc(src)}" style="height:{int(height)}px" title="{esc(title)}"{" loading=\"lazy\"" if lazy else ""} '
            f'allow="microphone; fullscreen" allowfullscreen></iframe></div>{PLEIN_ECRAN_JS}')


# ---------- Conversion Ricos -> HTML ----------
def text_node(n):
    td = n.get("textData", {})
    out = esc(td.get("text", "")).replace("\n", "<br>")
    for dec in td.get("decorations", []):
        t = dec["type"]
        if t == "BOLD":
            out = f"<strong>{out}</strong>"
        elif t == "ITALIC":
            out = f"<em>{out}</em>"
        elif t == "UNDERLINE":
            out = f"<u>{out}</u>"
        elif t == "LINK":
            url = dec.get("linkData", {}).get("link", {}).get("url", "#")
            ext = '' if url.startswith("/") else ' target="_blank" rel="noopener"'  # liens internes : même onglet
            out = f'<a href="{esc(url)}"{ext}>{out}</a>'
    return out


def children(n, ctx):
    return "".join(render(c, ctx) for c in n.get("nodes", []))


def render(n, ctx):
    t = n.get("type")
    if t == "TEXT":
        return text_node(n)
    if t == "PARAGRAPH":
        inner = children(n, ctx)
        return f"<p>{inner}</p>" if inner.strip() else ""
    if t == "HEADING":
        lvl = max(2, min(4, n.get("headingData", {}).get("level", 2)))
        return f"<h{lvl}>{children(n, ctx)}</h{lvl}>"
    if t == "BLOCKQUOTE":
        return f"<blockquote>{children(n, ctx)}</blockquote>"
    if t == "ORDERED_LIST":
        return f"<ol>{children(n, ctx)}</ol>"
    if t == "BULLETED_LIST":
        return f"<ul>{children(n, ctx)}</ul>"
    if t == "LIST_ITEM":
        inner = children(n, ctx)
        inner = re.sub(r"^<p>(.*)</p>$", r"\1", inner, flags=re.S) if inner.count("<p>") == 1 else inner
        return f"<li>{inner}</li>"
    if t == "DIVIDER":
        return "<hr>"
    if t == "IMAGE":
        img = n.get("imageData", {})
        src = img.get("image", {}).get("src", {}).get("id") or img.get("image", {}).get("src", {}).get("url", "")
        if src:
            src = img_url(src)
        alt = img.get("altText") or ""
        cap = ""
        for c in n.get("nodes", []):
            if c.get("type") == "CAPTION":
                cap = children(c, ctx)
        cap = cap or esc(alt)
        alt = alt or html.unescape(re.sub(r"<[^>]+>", "", cap))  # à défaut, la légende sert de texte alternatif
        fig = f'<img src="{esc(src)}" alt="{esc(alt)}" loading="lazy">'
        return f"<figure>{fig}{f'<figcaption>{cap}</figcaption>' if cap else ''}</figure>"
    if t == "CAPTION":
        return ""
    if t == "NOTE":  # encadré d'avertissement (ex. navigateur requis)
        return f'<p class="note-nav" role="note">⚠️ {n["html"]}</p>'
    if t == "TOOL_CARDS":
        return '<div class="grid tool-grid">' + "".join(tool_card(k) for k in n["tools"]) + "</div>"
    if t == "BUTTON":
        b = n.get("buttonData", {})
        url = b.get("link", {}).get("url", "#")
        if url == JACKPOT_URL:
            url = "/outils/le-jackpot-des-contes.html"
        return f'<p class="btn-wrap"><a class="btn" href="{esc(url)}" target="_blank" rel="noopener">{esc(b.get("text", "Ouvrir"))}</a></p>'
    if t == "HTML":
        h = n.get("htmlData", {})
        height = h.get("containerData", {}).get("height", {}).get("custom", "700")
        if h.get("html"):
            name = f"{ctx['slug']}.html"
            with open(os.path.join(OUT, "outils", name), "w") as f:
                f.write(h["html"])
            src = f"/outils/{name}"
        else:
            src = "/outils/le-jackpot-des-contes.html" if h.get("url") == JACKPOT_URL else h.get("url", "")
        ctx.setdefault("tools", []).append(src)
        TOOL_CANON.setdefault(src, (f"/post/{ctx['slug']}/", ctx.get("excerpt", "")))
        return embed(src, height, "Outil interactif", lazy=True)
    return children(n, ctx)


# ---------- Gabarit ----------
NAV = [("/", "Accueil"), ("/outils-pedagogiques/", "Outils pédagogiques"), ("/francais/", "Français"),
       ("/maths/", "Maths"), ("/divers/", "Divers"), ("/blog/", "Blog"), ("/qui-suis-je/", "Qui suis-je ?")]


FONDS = {"/": "lac-foret", "/francais/": "canopee", "/maths/": "lac-montagne", "/blog/": "cascade",
         "/post/le-chateau-des-nombres/": "Le château des nombres : lire les nombres de 0 à 99 en jouant, CP-CE1",
    "/post/le-puzzle-du-chateau-des-nombres/": "Puzzle du tableau des nombres 0-99 en ligne et à imprimer, CP-CE1",
    "/outils-pedagogiques/": "lac-brume", "/divers/": "vagues"}


def page(title, body, active="", desc="", og_image="", og_type="website", jsonld=None, noindex=False):
    fond = FONDS.get(active, "canopee")
    nav = "".join(f'<a href="{h}"{" aria-current=\"page\"" if h == active else ""}>{l}</a>' for h, l in NAV)
    full_title = f"{title} | Toujours cap !" if title != "Toujours cap !" else "Toujours cap ! Outils pédagogiques cycle 2 : GS, CP, CE1"
    desc = meta_desc(desc) or "Outils pédagogiques cycle 2 gratuits pour la GS, le CP et le CE1 : outils de lecture, contes du cercle conteur et petits jeux pour apprendre en jouant."
    og_image = og_image or DEFAULT_IMAGE
    if og_image.startswith("/"):
        og_image = SITE + og_image
    robots = '<meta name="robots" content="noindex">\n' if noindex else ""
    ld = "".join(f'<script type="application/ld+json">{json.dumps(j, ensure_ascii=False)}</script>\n' for j in (jsonld or []))
    return f"""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(full_title)}</title>
<meta name="description" content="{esc(desc)}">
{robots}<link rel="canonical" href="__CANONICAL__">
<meta property="og:type" content="{og_type}">
<meta property="og:locale" content="fr_FR">
<meta property="og:url" content="__CANONICAL__">
<meta property="og:title" content="{esc(full_title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:site_name" content="Toujours cap !">
<meta property="og:image" content="{esc(og_image)}">
<meta name="twitter:card" content="summary_large_image">
{ld}<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Nunito:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css?v={CSS_V}">
</head>
<body class="fond fond-{fond}">
<header class="site-header">
  <div class="wrap header-inner">
    <a class="logo" href="/" aria-label="Toujours cap ! Accueil">{LOGO_BANDEAU}</a>
    <button class="menu-toggle" aria-expanded="false" aria-controls="nav" onclick="this.setAttribute('aria-expanded', document.getElementById('nav').classList.toggle('open'))">Menu</button>
    <nav id="nav" class="nav">{nav}<a class="nav-admin" href="/admin/commentaires" hidden>🔒 Admin</a></nav>
    <script>if(document.cookie.indexOf("tc_moi=1")>-1)document.querySelector(".nav-admin").hidden=false</script>
  </div>
</header>
<main>
{body}
</main>
<footer class="site-footer">
  <div class="wrap">
    <p><strong>Toujours cap&nbsp;!</strong> — ressources pédagogiques pour le cycle 2.</p>
    <p class="muted">© {datetime.now().year} Toujours cap&nbsp;! Tous droits réservés.</p>
  </div>
</footer>
<script>try{{navigator.sendBeacon("/api/vue",JSON.stringify({{p:location.pathname,r:document.referrer}}))}}catch(e){{}}</script>
</body>
</html>
"""


def reperes(p):
    """Niveaux, nombre de joueurs et supports d'un jeu de lecture."""
    j = p.get("jeu")
    if not j:
        return ""
    items = [f'<span class="niv">{esc(n)}</span>' for n in j.get("niveaux", [])]
    if j.get("joueurs"):
        items.append(f'<span>👥 {esc(j["joueurs"])}</span>')
    items += [f'<span title="{t}">{ic} {t}</span>' for k in j.get("supports", []) for ic, t in [SUPPORTS[k]]]
    return '<div class="reperes">' + "".join(items) + "</div>"


def card(p):
    img = f'<img src="{esc(p["cover"])}" alt="{esc(p["title"])}" loading="lazy">' if p["cover"] else f'<div class="card-ph">{esc(p["title"][:1])}</div>'
    cat = CATS[p["cat"]]["name"] if p["cat"] else ""
    comp = (p.get("jeu") or {}).get("competence")
    if comp:
        cat = COMPETENCES[comp]
    return f"""<a class="card" href="/post/{p['slug']}/"{f' data-comp="{comp}"' if comp else ''}>
  <div class="card-img">{img}</div>
  <div class="card-body">
    {f'<span class="chip">{cat}</span>' if cat else ''}
    <h3>{esc(p['title'])}</h3>
    <p>{esc(p['excerpt'])}</p>
    {reperes(p)}
    <span class="muted small">{p['date_fr']}</span>
  </div>
</a>"""


def comments(p):
    """Section commentaires (modérés, voir functions/). Masquée par le script si le service ne répond pas."""
    return f"""<section class="wrap narrow comments" id="commentaires" data-page="{esc(p['slug'])}" hidden>
  <h2>Vos commentaires</h2>
  <div class="com-liste"></div>
  <form class="com-form">
    <p class="muted small">Une question, une idée, un retour d'expérience en classe ? Votre message sera publié après relecture.</p>
    <label>Prénom ou pseudo<input name="nom" maxlength="60" required autocomplete="nickname"></label>
    <label>Message<textarea name="message" rows="5" maxlength="3000" required></textarea></label>
    <label class="com-piege" aria-hidden="true" style="position:absolute;left:-9999px">Site web<input name="site" tabindex="-1" autocomplete="off"></label>
    <button class="btn" type="submit">Envoyer</button>
    <p class="com-etat" role="status"></p>
  </form>
</section>
<script src="/commentaires.js?v={JS_V}" defer></script>"""


FILTRES_JS = """<script>
document.querySelectorAll('.filtres button').forEach(function (b) {
  b.addEventListener('click', function () {
    var f = b.dataset.f;
    document.querySelectorAll('.filtres button').forEach(function (x) {
      x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', x === b);
    });
    document.querySelectorAll('.grid .card[data-comp]').forEach(function (c) {
      c.hidden = !!f && c.dataset.comp !== f;
    });
  });
});
</script>"""


# Précision affichée sous l'introduction de la page Langage oral
NOTE_CC = """<p class="note-accueil">Normalement, il n'y a pas d'image dans un cercle conteur&nbsp;: se créer une image mentale est essentiel. J'ai pourtant fait le choix des images avec les élèves les plus en difficulté. Je sors donc du cercle conteur traditionnel et me rapproche d'une activité plus classique.</p>"""


# Encadré sous l'introduction de la page Lecture
NOTE_LECTURE = """<p class="note-accueil">Une des particularités de certains de ces jeux, c'est l'<strong>autoévaluation</strong>&nbsp;: l'enfant doit cliquer sur «&nbsp;Bien lu&nbsp;» lorsqu'il ne s'est pas trompé. Valider ou invalider une réponse est une démarche importante.</p>"""


def grid(posts):
    return '<div class="grid">' + "".join(card(p) for p in posts) + "</div>"


# Titres pour Google (balise <title>) : le titre visible sur la page ne change pas
SEO_TITRES = {
    "/post/le-cercle-conteur/": "Le cercle conteur (Suzy Platiel) : déroulé et règles en GS-CP",
    "/post/le-nourrissage-culturel/": "Le nourrissage culturel de Serge Boimare : nourrir avant d'apprendre, GS-CP",
    "/post/les-formules-du-sorcier/": "Les Formules du Sorcier : jeu de lecture de pseudo-mots CP-CE1",
    "/post/le-radis-geant/": "Le radis géant : conte de randonnée pour le cercle conteur GS-CP",
    "/post/le-jackpot-des-contes/": "Le Jackpot des contes : générateur d'histoires pour la GS et le CP",
    "/post/pourquoi-le-moustique-bourdonne-a-nos-oreilles/": "Pourquoi le moustique bourdonne à nos oreilles : conte africain GS-CP",
    "/post/qui-de-l-oeuf-qui-du-poussin/": "Qui de l'œuf, qui du poussin ? Mythe bambara pour le cercle conteur",
    "/post/comment-anansi-devint-le-maitre-des-histoires/": "Anansi, le maître des histoires : conte ashanti pour la GS et le CP",
    "/post/les-calebasses-de-kouss/": "Les calebasses de Kouss : conte sénégalais de Leuk et Bouki, GS-CP",
    "/post/rafara/": "Rafara : conte malgache pour le cercle conteur en GS et CP",
    "/post/la-petite-poule-et-le-grain-de-mil/": "La petite poule et le grain de mil : conte en randonnée GS-CP",
    "/post/lecture-rapide-de-nombres/": "Lecture rapide de nombres : flash nombres en ligne, cycle 2",
    "/post/lecture-rapide-de-mots-avec-le-tachitoscope/": "Lecture rapide et fluence : tachistoscope et téléprompteurs en ligne",
    "/post/puissance-4-syllabiques/": "Puissance 4 syllabique : jeu de lecture de syllabes CP-CE1",
    "/post/la-minute-des-syllabes/": "La minute des syllabes : lire des syllabes en 1 minute, avec micro, CP-CE1",
    "/blog/": "Blog : contes, jeux de lecture et numération pour le cycle 2",
    "/francais/": "Français cycle 2 : contes et outils de lecture GS, CP, CE1",
    "/francais/cercle-conteur/": "Langage oral : contes à raconter en cercle conteur en GS et en CP",
    "/francais/lecture/": "Jeux et outils de lecture en ligne gratuits pour le CP et le CE1",
    "/maths/": "Maths cycle 2 : jeux de numération et de calcul mental gratuits",
    "/maths/numeration/": "Numération cycle 2 : jeux pour lire et dire les nombres",
    "/maths/calcul/": "Calcul mental cycle 2 : jeux en ligne gratuits pour le CP et le CE1",
    "/post/la-course-des-additions/": "La Course des Additions : jeu de tables d'addition en ligne CP-CE1",
    "/post/la-course-des-multiplications/": "La Course des Multiplications : jeu de tables de multiplication CE1-CE2",
    "/outils-pedagogiques/": "Outils pédagogiques gratuits pour le cycle 2 et l'ASH",
}


def write(path, content, canonical=None, lastmod=None, sitemap=True):
    """Écrit une page ; `canonical` désigne la page de référence si le contenu est dupliqué ailleurs."""
    content = content.replace("__CANONICAL__", SITE + (canonical or path))
    if sitemap and not canonical and not path.endswith(".html"):
        SITEMAP.append((path, lastmod))
    m = re.search(r"<title>(.*?)</title>", content)
    if m and not path.endswith(".html"):
        TITRES[path] = html.unescape(m.group(1)).replace(" | Toujours cap !", "")
    if path in SEO_TITRES:
        t = esc(SEO_TITRES[path] + " | Toujours cap !")
        content = re.sub(r"<title>.*?</title>", f"<title>{t}</title>", content, count=1)
        content = re.sub(r'(<meta property="og:title" content=")[^"]*', lambda m: m.group(1) + t, content, count=1)
    full = os.path.join(OUT, path.strip("/"), "index.html") if not path.endswith(".html") else os.path.join(OUT, path.strip("/"))
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w") as f:
        f.write(content)


def main():
    if os.path.exists(OUT):
        shutil.rmtree(OUT)
    os.makedirs(os.path.join(OUT, "outils"))
    shutil.copy(os.path.join(ROOT, "assets", "style.css"), OUT)
    shutil.copy(os.path.join(ROOT, "assets", "favicon.svg"), OUT)
    shutil.copy(os.path.join(ROOT, "assets", "logo.svg"), OUT)
    shutil.copy(os.path.join(ROOT, "assets", "commentaires.js"), OUT)
    shutil.copytree(os.path.join(ROOT, "assets", "images"), os.path.join(OUT, "images"))
    shutil.copytree(os.path.join(ROOT, "assets", "fichiers"), os.path.join(OUT, "fichiers"))  # PDF à télécharger
    for outil in ("le-jackpot-des-contes.html", "lecture-rapide-de-mots-avec-le-tachitoscope.html", "teleprompteur-de-lecture.html", "teleprompteur-a-l-ecoute.html", "les-formules-du-sorcier.html", "puissance-4-syllabique.html", "tour-des-nombres.html", "la-course-des-additions.html", "la-course-des-multiplications.html", "le-chateau-des-nombres.html", "le-puzzle-du-chateau.html", "la-minute-des-syllabes.html"):
        shutil.copy(os.path.join(ROOT, "assets", outil), os.path.join(OUT, "outils"))

    data = json.load(open(os.path.join(ROOT, "posts.json")))
    posts = []
    for p in data["posts"]:
        slug = ascii_slug(p["slug"])
        cat = p.get("cat") or next((CAT_IDS[c] for c in p.get("categoryIds", []) if c in CAT_IDS), None) or "lecture"
        nodes = p["richContent"]["nodes"]
        cover = (p.get("media") or {}).get("wixMedia", {}).get("image", {}).get("url", "")
        if not cover:
            first = next((n for n in nodes if n.get("type") == "IMAGE"), None)
            if first:
                cover = first["imageData"]["image"]["src"]["id"]
        cover = img_url(cover) if cover else ""
        if os.path.exists(os.path.join(ROOT, "assets", "images", "contes", slug + ".jpg")):
            cover = f"/images/contes/{slug}.jpg"  # illustration dessinée pour le conte
        elif os.path.exists(os.path.join(ROOT, "assets", "images", "jeux", slug + ".jpg")):
            cover = f"/images/jeux/{slug}.jpg"  # plateau du jeu
        posts.append({"slug": slug, "title": p["title"][:1].upper() + p["title"][1:], "excerpt": p.get("excerpt", ""), "date": p["date"],
                      "date_fr": fr_date(p["date"]), "cat": cat, "nodes": nodes, "cover": cover, "jeu": p.get("jeu"),
                      "epingle": p.get("epingle", False)})
    posts.sort(key=lambda x: x["date"], reverse=True)
    # Articles épinglés ("epingle": true dans posts.json) : toujours en tête de leur rubrique
    epingles_d_abord = lambda lst: sorted(lst, key=lambda q: not q["epingle"])

    # Articles
    for i, p in enumerate(posts):
        ctx = {"slug": p["slug"], "excerpt": p["excerpt"]}
        content = "".join(render(n, ctx) for n in p["nodes"])
        recent = [q for q in posts if q["slug"] != p["slug"] and q["cat"] == p["cat"]][:3] or [q for q in posts if q["slug"] != p["slug"]][:3]
        cat = CATS[p["cat"]]
        body = f"""<article class="wrap narrow post">
  <nav class="crumbs"><a href="/blog/">Blog</a> › <a href="/blog/{p['cat']}/">{cat['name']}</a></nav>
  <h1>{esc(p['title'])}</h1>
  <p class="meta">{p['date_fr']} · <span class="chip">{cat['name']}</span></p>
  {reperes(p)}
  <div class="prose">{content}</div>
</article>
{comments(p)}
<section class="wrap related">
  <h2>À lire aussi</h2>
  {grid(recent)}
</section>"""
        url = f"{SITE}/post/{p['slug']}/"
        crumbs = [("Blog", "/blog/"), (cat["name"], f"/blog/{p['cat']}/"), (p["title"], f"/post/{p['slug']}/")]
        ld = [{"@context": "https://schema.org", "@type": "BlogPosting", "headline": p["title"],
               "description": p["excerpt"], "datePublished": p["date"], "inLanguage": "fr-FR",
               "mainEntityOfPage": url, "url": url, "articleSection": cat["name"],
               **({"image": SITE + p["cover"] if p["cover"].startswith("/") else p["cover"]} if p["cover"] else {}),
               "author": {"@type": "Organization", "name": SITE_NAME, "url": SITE + "/"},
               "publisher": {"@type": "Organization", "name": SITE_NAME, "url": SITE + "/"}},
              {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
                  {"@type": "ListItem", "position": i + 1, "name": n, "item": SITE + h} for i, (n, h) in enumerate(crumbs)]}]
        write(f"/post/{p['slug']}/", page(p["title"], body, "/blog/", p["excerpt"], p["cover"], "article", ld),
              lastmod=p["date"][:10])

    # Blog + catégories
    chips = '<div class="chips"><a class="chip active" href="/blog/">Toutes</a>' + "".join(
        f'<a class="chip" href="/blog/{k}/">{v["name"]}</a>' for k, v in CATS.items()) + "</div>"
    write("/blog/", page("Blog", f"""<section class="wrap">
  <h1>Le blog</h1>
  <p class="lead">Contes, jeux et outils testés en classe, à utiliser librement.</p>
  {chips}
  {grid(posts)}
</section>""", "/blog/", "Tous les articles de Toujours cap ! : contes pour le cercle conteur, jeux de lecture et outils de numération pour la GS, le CP et le CE1."))
    for k, v in CATS.items():
        sub = epingles_d_abord([p for p in posts if p["cat"] == k])
        chips_k = chips.replace(' active', '').replace(f'href="/blog/{k}/"', f'href="/blog/{k}/" aria-current="page"').replace(f'class="chip" href="/blog/{k}/"', f'class="chip active" href="/blog/{k}/"')
        write(f"/blog/{k}/", page(v["name"], f"""<section class="wrap">
  <h1>{v['name']}</h1>
  <p class="lead">{v['desc']}</p>
  {chips_k}
  {grid(sub)}
</section>""", "/blog/", v["desc"]),
              canonical=f"/{v['domain']}/{k}/")

    # Domaines
    fr = [p for p in posts if CATS[p["cat"]]["domain"] == "francais"]
    cc = epingles_d_abord([p for p in fr if p["cat"] == "cercle-conteur"])
    lec = [p for p in fr if p["cat"] == "lecture"]
    def cover_of(lst):
        return next((q["cover"] for q in lst if q["cover"]), "")
    subs = [("cercle-conteur", "Langage oral", "Des contes à raconter ensemble en GS et en CP, avec leurs formules à dire en chœur et des outils pour inventer des histoires.", cc),
            ("lecture", "Lecture", CATS["lecture"]["desc"], lec)]
    vignettes = '<div class="grid">' + "".join(f"""<a class="card" href="/francais/{k}/">
  <div class="card-img">{f'<img src="{esc(cover_of(lst))}" alt="{esc(t)}" loading="lazy">' if cover_of(lst) else f'<div class="card-ph">{t[:1]}</div>'}</div>
  <div class="card-body"><span class="chip">{len(lst)} article{'s' if len(lst) > 1 else ''}</span><h3>{t}</h3><p>{d}</p><span class="link">Découvrir →</span></div>
</a>""" for k, t, d, lst in subs) + "</div>"
    write("/francais/", page("Français", f"""<section class="wrap">
  <h1>Français</h1>
  <p class="lead">Des activités ludiques testées et validées par nos petits écoliers.</p>
  {vignettes}
</section>""", "/francais/", "Français au cycle 2 : contes à raconter en cercle conteur et outils de lecture (tachistoscope, téléprompteurs, jeux de déchiffrage) pour la GS, le CP et le CE1."))
    for k, t, d, lst in subs:
        filtres = ""
        if k == "lecture":
            lst = sorted(lst, key=lambda q: (list(COMPETENCES).index((q.get("jeu") or {}).get("competence", "fluence")), q["title"]))
            presentes = [c for c in COMPETENCES if any((q.get("jeu") or {}).get("competence") == c for q in lst)]
            if len(presentes) > 1:
                filtres = ('<div class="chips filtres" role="group" aria-label="Trier par compétence">'
                           '<span class="filtres-label">Trier par :</span>'
                           '<button class="chip active" data-f="" aria-pressed="true">Tout</button>'
                           + "".join(f'<button class="chip" data-f="{c}" aria-pressed="false">{COMPETENCES[c]}</button>' for c in presentes)
                           + '</div>' + FILTRES_JS)
        write(f"/francais/{k}/", page(t, f"""<section class="wrap">
  <nav class="crumbs"><a href="/francais/">Français</a> › {t}</nav>
  <h1>{t}</h1>
  <p class="lead">{d}</p>
  {NOTE_CC if k == "cercle-conteur" else NOTE_LECTURE if k == "lecture" else ""}
  {filtres}
  {grid(lst)}
</section>""", "/francais/", d))
    article = next(p for p in posts if "tachitoscope" in p["slug"])
    for k, t in TOOLS.items():
        write(f"/francais/lecture/{k}/", page(t.get("seo", t["title"]), f"""<section class="wrap narrow">
  <nav class="crumbs"><a href="/francais/">Français</a> › <a href="/francais/lecture/">Lecture</a> › <a href="/post/{article['slug']}/">Lecture rapide</a></nav>
  <h1>{esc(t['title'])}</h1>
  <p class="lead">{esc(t['desc'])}</p>
  {'<p class="note-nav" role="note">⚠️ ' + t['note'] + '</p>' if t.get('note') else ''}
  {embed(t['src'], t['height'], t['title'])}
  <p><a href="/post/{article['slug']}/">← Les autres outils de lecture rapide</a></p>
</section>""", "/francais/", t["desc"], t["img"], jsonld=tool_ld(k, t)), lastmod=t.get("maj"))
    msubs = [(k, CATS[k]["name"], CATS[k]["desc"], epingles_d_abord([p for p in posts if p["cat"] == k])) for k in ("numeration", "calcul")]
    # Image choisie pour une vignette de sous-rubrique (sinon : couverture du premier article)
    VIGNETTES = {"calcul": "/images/domaines/calcul.jpg"}
    vimg = lambda k, lst: VIGNETTES.get(k) or cover_of(lst)
    mvignettes = '<div class="grid">' + "".join(f"""<a class="card" href="/maths/{k}/">
  <div class="card-img">{f'<img src="{esc(vimg(k, lst))}" alt="{esc(t)}" loading="lazy">' if vimg(k, lst) else f'<div class="card-ph">{t[:1]}</div>'}</div>
  <div class="card-body"><span class="chip">{len(lst)} article{'s' if len(lst) > 1 else ''}</span><h3>{t}</h3><p>{d}</p><span class="link">Découvrir →</span></div>
</a>""" for k, t, d, lst in msubs) + "</div>"
    write("/maths/", page("Maths", f"""<section class="wrap">
  <h1>Maths</h1>
  <p class="lead">Des activités stimulantes pour booster la réussite de vos élèves en mathématiques.</p>
  {NOTE_LECTURE}
  {mvignettes}
</section>""", "/maths/", "Maths au cycle 2 : jeux et outils de numération et de calcul mental pour la GS, le CP et le CE1."))
    for k, t, d, lst in msubs:
        presentes = [c for c in COMPETENCES if any((q.get("jeu") or {}).get("competence") == c for q in lst)]
        filtres = ""
        if len(presentes) > 1:  # onglets (ex. Addition / Multiplication sur la page Calcul)
            lst = sorted(lst, key=lambda q: (list(COMPETENCES).index((q.get("jeu") or {}).get("competence") or presentes[0]), q["title"]))
            filtres = ('<div class="chips filtres" role="group" aria-label="Trier par opération">'
                       '<span class="filtres-label">Trier par :</span>'
                       '<button class="chip active" data-f="" aria-pressed="true">Tout</button>'
                       + "".join(f'<button class="chip" data-f="{c}" aria-pressed="false">{COMPETENCES[c]}</button>' for c in presentes)
                       + '</div>' + FILTRES_JS)
        write(f"/maths/{k}/", page(t, f"""<section class="wrap">
  <nav class="crumbs"><a href="/maths/">Maths</a> › {t}</nav>
  <h1>{t}</h1>
  <p class="lead">{d}</p>
  {filtres}
  {grid(lst) if lst else '<div class="empty">Les premières ressources arrivent bientôt.</div>'}
</section>""", "/maths/", d))
    write("/divers/", page("Divers", """<section class="wrap narrow">
  <h1>Divers</h1>
  <p class="lead">Des pistes variées pour stimuler la motivation et la métacognition.</p>
  <div class="empty">Les premières ressources arrivent bientôt.</div>
</section>""", "/divers/", "Pistes pour stimuler la motivation et la métacognition des élèves du cycle 2.", noindex=True), sitemap=False)

    write("/qui-suis-je/", page("Qui suis-je ?", """<section class="wrap narrow prose">
  <h1>Qui suis-je&nbsp;?</h1>
  <p class="lead">Bienvenue sur ce site&nbsp;!</p>
  <p>Je suis enseignant spécialisé et j'occupe la fonction d'ESADP depuis quelques années.</p>
  <p>Je vous propose sur ce site minimaliste les outils que j'utilise au quotidien.</p>
  <p>Si j'ai choisi «&nbsp;Toujours cap&nbsp;!&nbsp;», c'est que je suis profondément convaincu que la première attitude à avoir en tant qu'enseignant, c'est de <strong>croire en nos élèves</strong>&nbsp;! Une attitude très partagée chez les enseignants d'ailleurs… même si parfois ce n'est pas simple&nbsp;!</p>
  <p>N'hésitez pas à m'envoyer vos commentaires.</p>
""" + (KOFI_HTML if KOFI_ACTIF else "") + """  <p><a class="btn" href="/outils-pedagogiques/">Découvrir les outils</a></p>
""" + (f"""  <aside class="don">
    <span class="don-tasse" aria-hidden="true">☕</span>
    <div>
      <h2>Un café pour soutenir le site&nbsp;?</h2>
      <p>Tout est gratuit ici. Si ces outils vous rendent service, vous pouvez participer aux frais (hébergement, nom de domaine) en m'offrant un café à 1&nbsp;€.</p>
      <a class="btn btn-don" href="{DON_URL}" target="_blank" rel="noopener">Offrir un café — 1&nbsp;€</a>
    </div>
  </aside>
""" if DON_URL else "") + """</section>""", "/qui-suis-je/", "Présentation de l'auteur du site : enseignant spécialisé, ESADP, qui partage ses outils pédagogiques du quotidien."))

    domains = [
        ("/francais/", "Lecture · Langage oral", "Français", "Découvrez des activités ludiques testées et validées par nos petits écoliers.", "/images/domaines/lettrine.jpg"),
        ("/maths/", "Numération · Calcul", "Maths", "Des activités stimulantes pour booster la réussite de vos élèves en mathématiques.", "/images/domaines/maths.jpg"),
        ("/divers/", "Motivation", "Divers", "Découvrez des pistes variées pour stimuler la motivation et la métacognition.", "/images/domaines/divers.jpg"),
    ]
    dcards = '<div class="grid">' + "".join(f"""<a class="card" href="{h}">
  <div class="card-img"><img src="{img}" alt="{esc(t)}" loading="lazy"></div>
  <div class="card-body"><span class="chip">{tag}</span><h3>{t}</h3><p>{d}</p><span class="link">Découvrir →</span></div>
</a>""" for h, tag, t, d, img in domains) + "</div>"
    write("/outils-pedagogiques/", page("Outils pédagogiques", f"""<section class="wrap sur-fond">
  <h1>Notre catalogue d'outils</h1>
  <p class="lead">Des ressources prêtes à l'emploi pour votre classe, à destination de tous mais particulièrement des élèves à besoin éducatif particulier.</p>
  {dcards}
</section>""", "/outils-pedagogiques/", "Catalogue d'outils pédagogiques gratuits pour le cycle 2 et l'enseignement spécialisé : lecture, contes, numération, prêts à utiliser en classe."))

    # Accueil
    write("/", page("Toujours cap !", f"""<section class="hero">
  <div class="wrap hero-inner">
    <div>
      <p class="eyebrow">GS · CP · CE1</p>
      <h1>Apprendre en jouant&nbsp;!</h1>
      <p class="lead">Un espace dédié aux enseignants du primaire. Des ressources structurées et des outils concrets pour accompagner les élèves du cycle 2 et de l'enseignement spécialisé.</p>
      <p class="note-accueil">Vous trouverez ici des <strong>contes à raconter</strong>, des <strong>jeux</strong> et des <strong>outils de lecture et de numération</strong>. Tous ont été <strong>testés avec des élèves par un enseignant spécialisé</strong>. Certains s'impriment pour jouer sur table, d'autres peuvent être <strong>projetés en classe pour jouer avec tous les élèves</strong>.<br><strong>Apprendre, c'est s'élancer, sauter, oser, changer notre point de vue&nbsp;!</strong></p>
      <p><a class="btn" href="/outils-pedagogiques/">Explorer nos ressources</a></p>
    </div>
    <figure class="hero-cadre">
      <img class="hero-img" src="/images/accueil/saut-toujours-cap-titre.jpg" alt="Toujours cap ! Un enfant saute d'un ponton dans la mer, bras et jambes écartés" width="1170" height="780">
    </figure>
  </div>
</section>
<section class="wrap" style="padding-top:32px">
  <h2 style="margin-top:0">Dernières ressources</h2>
  {grid(posts[:6])}
  <p><a class="btn" href="/blog/">Toutes les ressources</a></p>
</section>""", "/", jsonld=[
        {"@context": "https://schema.org", "@type": "WebSite", "name": SITE_NAME, "url": SITE + "/", "inLanguage": "fr-FR",
         "description": "Outils pédagogiques gratuits pour le cycle 2 (GS, CP, CE1) : lecture, contes du cercle conteur, numération."},
        {"@context": "https://schema.org", "@type": "Organization", "name": SITE_NAME, "url": SITE + "/", "logo": SITE + "/favicon.svg"}]),
        lastmod=max(p["date"] for p in posts)[:10])

    # Outils autonomes (affichés en iframe) : description et page de référence pour Google
    for k, t in TOOLS.items():
        TOOL_CANON[t["src"]] = (f"/francais/lecture/{k}/", t["desc"])
    for src, (canon, d) in TOOL_CANON.items():
        path = os.path.join(OUT, src.strip("/"))
        if not src.startswith("/outils/") or not os.path.exists(path):
            continue
        with open(path) as f:
            h = f.read()
        if 'rel="canonical"' not in h:
            tags = f'<link rel="canonical" href="{SITE}{canon}">' + (f'<meta name="description" content="{esc(meta_desc(d))}">' if d else "")
            h = h.replace("</title>", "</title>" + tags, 1) if "</title>" in h else h.replace("<head>", "<head>" + tags, 1)
            with open(path, "w") as f:
                f.write(h)

    # 404 + redirections Cloudflare
    write("/404.html", page("Page introuvable", """<section class="wrap narrow"><h1>Page introuvable</h1>
<p class="lead">Cette page n'existe pas ou a déménagé.</p><p><a class="btn" href="/">Retour à l'accueil</a></p></section>""", noindex=True),
          sitemap=False)
    redirects = ["/langue-francaise /francais/ 301",
                 "/langue-francaise-1 /maths/ 301", "/langue-francaise-2 /divers/ 301",
                 "/blog/categories/cercle-conteur /blog/cercle-conteur/ 301",
                 "/blog/categories/num%C3%A9ration /blog/numeration/ 301",
                 "/blog/categories/fran%C3%A7ais /francais/ 301"]
    for p in data["posts"]:
        if p["slug"] != ascii_slug(p["slug"]):
            from urllib.parse import quote
            redirects.append(f"/post/{quote(p['slug'])} /post/{ascii_slug(p['slug'])}/ 301")
    with open(os.path.join(OUT, "_redirects"), "w") as f:
        f.write("\n".join(redirects) + "\n")
    with open(os.path.join(OUT, "titres.json"), "w") as f:  # titres des pages, pour /admin/stats
        json.dump(TITRES, f, ensure_ascii=False)
    with open(os.path.join(OUT, "robots.txt"), "w") as f:
        f.write(f"User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\n\nSitemap: {SITE}/sitemap.xml\n")
    defaut = max(p["date"] for p in posts)[:10]
    urls = "".join(f"  <url><loc>{SITE}{path}</loc><lastmod>{lm or defaut}</lastmod></url>\n"
                   for path, lm in sorted(SITEMAP, key=lambda x: (x[0] != "/", x[0])))
    with open(os.path.join(OUT, "sitemap.xml"), "w") as f:
        f.write(f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}</urlset>\n')
    print(f"OK : {len(posts)} articles, {len(SITEMAP)} pages dans le sitemap")


if __name__ == "__main__":
    main()
