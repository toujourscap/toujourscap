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
JACKPOT_URL = "https://b0bbbd46-7a7a-40c3-ab1e-0aebb386faeb.filesusr.com/html/5e2b25_648fdee2fa523d3b1c131a04e3d6b955.html"

CATS = {
    "cercle-conteur": {"name": "Cercle conteur", "desc": "Outils et contes pour mener des cercles conteurs en GS et CP.", "domain": "francais"},
    "lecture": {"name": "Lecture", "desc": "Jeux et outils pour lire plus vite et avec plaisir.", "domain": "francais"},
    "numeration": {"name": "Numération", "desc": "Activités pour lire et manipuler les nombres.", "domain": "maths"},
}
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
        "title": "Le tachistoscope",
        "desc": "Les mots apparaissent un par un : l'élève les lit le plus vite possible. Si le mot résiste, une aide audio le lit après quelques secondes.",
        "src": "/outils/lecture-rapide-de-mots-avec-le-tachitoscope.html", "height": 1210,
        "img": "/images/outils/tachistoscope.jpg"},
    "teleprompteur-de-lecture": {
        "title": "Le téléprompteur de lecture",
        "desc": "Le texte s'affiche ligne par ligne et un trait avance sous les mots, à la vitesse choisie en mots par minute. On peut coller son propre texte.",
        "src": "/outils/teleprompteur-de-lecture.html", "height": 800,
        "img": "/images/outils/teleprompteur-de-lecture.jpg"},
    "teleprompteur-a-l-ecoute": {
        "title": "Le téléprompteur à l'écoute",
        "desc": "L'élève lit à voix haute et le texte avance au rythme de sa lecture, avec sa vitesse en mots par minute. Micro : Chrome ou Edge.",
        "src": "/outils/teleprompteur-a-l-ecoute.html", "height": 860,
        "img": "/images/outils/teleprompteur-a-l-ecoute.jpg"},
}


def tool_card(k):
    t = TOOLS[k]
    return f"""<a class="card" href="/francais/lecture/{k}/">
  <div class="card-img"><img src="{t['img']}" alt="" loading="lazy"></div>
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


def esc(s):
    return html.escape(s or "", quote=True)


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
            out = f'<a href="{esc(url)}" target="_blank" rel="noopener">{out}</a>'
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
        fig = f'<img src="{esc(src)}" alt="{esc(alt)}" loading="lazy">'
        return f"<figure>{fig}{f'<figcaption>{cap}</figcaption>' if cap else ''}</figure>"
    if t == "CAPTION":
        return ""
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
        return (f'<div class="embed"><iframe src="{esc(src)}" style="height:{int(height)}px" '
                f'title="Outil interactif" loading="lazy" allow="microphone; fullscreen" allowfullscreen></iframe>'
                f'<a class="embed-full" href="{esc(src)}" target="_blank" rel="noopener">Ouvrir en plein écran ↗</a></div>')
    return children(n, ctx)


# ---------- Gabarit ----------
NAV = [("/", "Accueil"), ("/outils-pedagogiques/", "Outils pédagogiques"), ("/francais/", "Français"),
       ("/maths/", "Maths"), ("/divers/", "Divers"), ("/blog/", "Blog"), ("/qui-suis-je/", "Qui suis-je ?")]


FONDS = {"/": "lac-foret", "/francais/": "canopee", "/maths/": "lac-montagne", "/blog/": "cascade",
         "/outils-pedagogiques/": "lac-brume", "/divers/": "vagues"}


def page(title, body, active="", desc="", og_image="", og_type="website", jsonld=None, noindex=False):
    fond = FONDS.get(active, "canopee")
    nav = "".join(f'<a href="{h}"{" aria-current=\"page\"" if h == active else ""}>{l}</a>' for h, l in NAV)
    full_title = f"{title} | Toujours cap !" if title != "Toujours cap !" else "Toujours cap ! Outils pédagogiques cycle 2 : GS, CP, CE1"
    desc = desc or "Outils pédagogiques cycle 2 gratuits pour la GS, le CP et le CE1 : outils de lecture, contes du cercle conteur et petits jeux pour apprendre en jouant."
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
<link rel="stylesheet" href="/style.css">
</head>
<body class="fond fond-{fond}">
<header class="site-header">
  <div class="wrap header-inner">
    <a class="logo" href="/"><span class="logo-mark">⛵</span> Toujours cap&nbsp;!</a>
    <button class="menu-toggle" aria-expanded="false" aria-controls="nav" onclick="this.setAttribute('aria-expanded', document.getElementById('nav').classList.toggle('open'))">Menu</button>
    <nav id="nav" class="nav">{nav}</nav>
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
</body>
</html>
"""


def card(p):
    img = f'<img src="{esc(p["cover"])}" alt="" loading="lazy">' if p["cover"] else f'<div class="card-ph">{esc(p["title"][:1])}</div>'
    cat = CATS[p["cat"]]["name"] if p["cat"] else ""
    return f"""<a class="card" href="/post/{p['slug']}/">
  <div class="card-img">{img}</div>
  <div class="card-body">
    {f'<span class="chip">{cat}</span>' if cat else ''}
    <h3>{esc(p['title'])}</h3>
    <p>{esc(p['excerpt'])}</p>
    <span class="muted small">{p['date_fr']}</span>
  </div>
</a>"""


def grid(posts):
    return '<div class="grid">' + "".join(card(p) for p in posts) + "</div>"


def write(path, content, canonical=None, lastmod=None, sitemap=True):
    """Écrit une page ; `canonical` désigne la page de référence si le contenu est dupliqué ailleurs."""
    content = content.replace("__CANONICAL__", SITE + (canonical or path))
    if sitemap and not canonical and not path.endswith(".html"):
        SITEMAP.append((path, lastmod))
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
    shutil.copytree(os.path.join(ROOT, "assets", "images"), os.path.join(OUT, "images"))
    for outil in ("le-jackpot-des-contes.html", "lecture-rapide-de-mots-avec-le-tachitoscope.html", "teleprompteur-de-lecture.html", "teleprompteur-a-l-ecoute.html", "les-formules-du-sorcier.html"):
        shutil.copy(os.path.join(ROOT, "assets", outil), os.path.join(OUT, "outils"))

    data = json.load(open(os.path.join(ROOT, "posts.json")))
    posts = []
    for p in data["posts"]:
        slug = ascii_slug(p["slug"])
        cat = next((CAT_IDS[c] for c in p.get("categoryIds", []) if c in CAT_IDS), None) or "lecture"
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
                      "date_fr": fr_date(p["date"]), "cat": cat, "nodes": nodes, "cover": cover})
    posts.sort(key=lambda x: x["date"], reverse=True)

    # Articles
    for i, p in enumerate(posts):
        ctx = {"slug": p["slug"]}
        content = "".join(render(n, ctx) for n in p["nodes"])
        recent = [q for q in posts if q["slug"] != p["slug"] and q["cat"] == p["cat"]][:3] or [q for q in posts if q["slug"] != p["slug"]][:3]
        cat = CATS[p["cat"]]
        body = f"""<article class="wrap narrow post">
  <nav class="crumbs"><a href="/blog/">Blog</a> › <a href="/blog/{p['cat']}/">{cat['name']}</a></nav>
  <h1>{esc(p['title'])}</h1>
  <p class="meta">{p['date_fr']} · <span class="chip">{cat['name']}</span></p>
  <div class="prose">{content}</div>
</article>
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
</section>""", "/blog/"))
    for k, v in CATS.items():
        sub = [p for p in posts if p["cat"] == k]
        chips_k = chips.replace(' active', '').replace(f'href="/blog/{k}/"', f'href="/blog/{k}/" aria-current="page"').replace(f'class="chip" href="/blog/{k}/"', f'class="chip active" href="/blog/{k}/"')
        write(f"/blog/{k}/", page(v["name"], f"""<section class="wrap">
  <h1>{v['name']}</h1>
  <p class="lead">{v['desc']}</p>
  {chips_k}
  {grid(sub)}
</section>""", "/blog/", v["desc"]),
              canonical=f"/francais/{k}/" if v["domain"] == "francais" else None)

    # Domaines
    fr = [p for p in posts if CATS[p["cat"]]["domain"] == "francais"]
    cc = [p for p in fr if p["cat"] == "cercle-conteur"]
    lec = [p for p in fr if p["cat"] == "lecture"]
    def cover_of(lst):
        return next((q["cover"] for q in lst if q["cover"]), "")
    subs = [("cercle-conteur", "Cercle conteur", "Des contes à raconter ensemble en GS et en CP, avec leurs formules à dire en chœur et des outils pour inventer des histoires.", cc),
            ("lecture", "Lecture", "Des jeux et outils pour lire plus vite et avec plaisir.", lec)]
    vignettes = '<div class="grid">' + "".join(f"""<a class="card" href="/francais/{k}/">
  <div class="card-img">{f'<img src="{esc(cover_of(lst))}" alt="" loading="lazy">' if cover_of(lst) else f'<div class="card-ph">{t[:1]}</div>'}</div>
  <div class="card-body"><span class="chip">{len(lst)} article{'s' if len(lst) > 1 else ''}</span><h3>{t}</h3><p>{d}</p><span class="link">Découvrir →</span></div>
</a>""" for k, t, d, lst in subs) + "</div>"
    write("/francais/", page("Français", f"""<section class="wrap">
  <h1>Français</h1>
  <p class="lead">Des activités ludiques testées et validées par nos petits écoliers.</p>
  {vignettes}
</section>""", "/francais/"))
    for k, t, d, lst in subs:
        write(f"/francais/{k}/", page(t, f"""<section class="wrap">
  <nav class="crumbs"><a href="/francais/">Français</a> › {t}</nav>
  <h1>{t}</h1>
  <p class="lead">{d}</p>
  {grid(lst)}
</section>""", "/francais/", d))
    article = next(p for p in posts if "tachitoscope" in p["slug"])
    for k, t in TOOLS.items():
        write(f"/francais/lecture/{k}/", page(t["title"], f"""<section class="wrap narrow">
  <nav class="crumbs"><a href="/francais/">Français</a> › <a href="/francais/lecture/">Lecture</a> › <a href="/post/{article['slug']}/">Lecture rapide</a></nav>
  <h1>{esc(t['title'])}</h1>
  <p class="lead">{esc(t['desc'])}</p>
  <div class="embed"><iframe src="{t['src']}" style="height:{t['height']}px" title="{esc(t['title'])}" allow="microphone; fullscreen" allowfullscreen></iframe>
  <a class="embed-full" href="{t['src']}" target="_blank" rel="noopener">Ouvrir en plein écran ↗</a></div>
  <p><a href="/post/{article['slug']}/">← Les autres outils de lecture rapide</a></p>
</section>""", "/francais/", t["desc"], t["img"]))
    maths = [p for p in posts if CATS[p["cat"]]["domain"] == "maths"]
    write("/maths/", page("Maths", f"""<section class="wrap">
  <h1>Maths</h1>
  <p class="lead">Des activités stimulantes pour booster la réussite de vos élèves en mathématiques.</p>
  {grid(maths)}
</section>""", "/maths/"))
    write("/divers/", page("Divers", """<section class="wrap narrow">
  <h1>Divers</h1>
  <p class="lead">Des pistes variées pour stimuler la motivation et la métacognition.</p>
  <div class="empty">Les premières ressources arrivent bientôt.</div>
</section>""", "/divers/"))

    write("/qui-suis-je/", page("Qui suis-je ?", """<section class="wrap narrow prose">
  <h1>Qui suis-je&nbsp;?</h1>
  <p class="lead">Bienvenue sur ce site&nbsp;!</p>
  <p>Je suis enseignant spécialisé et j'occupe la fonction d'ESADP depuis quelques années.</p>
  <p>Je vous propose sur ce site minimaliste les outils que j'utilise au quotidien.</p>
  <p>N'hésitez pas à m'envoyer vos commentaires.</p>
  <p><a class="btn" href="/outils-pedagogiques/">Découvrir les outils</a></p>
</section>""", "/qui-suis-je/", "Présentation de l'auteur du site : enseignant spécialisé, ESADP, qui partage ses outils pédagogiques du quotidien."))

    domains = [
        ("/francais/", "Domaine", "Langue française", "Découvrez des activités ludiques testées et validées par nos petits écoliers.", WIX + "5e2b25_d4d4317cc1f7403d80f67c123bce418d~mv2.jpg"),
        ("/maths/", "Classe", "Maths", "Des activités stimulantes pour booster la réussite de vos élèves en mathématiques.", WIX + "5e2b25_fb57df6fb15941d2bdae85a04ccb7d0a~mv2.jpg"),
        ("/divers/", "Pratique", "Divers", "Découvrez des pistes variées pour stimuler la motivation et la métacognition.", WIX + "5e2b25_5026498380d44543a6406f09d073e840~mv2.jpg"),
    ]
    dcards = '<div class="grid">' + "".join(f"""<a class="card" href="{h}">
  <div class="card-img"><img src="{img}" alt="" loading="lazy"></div>
  <div class="card-body"><span class="chip">{tag}</span><h3>{t}</h3><p>{d}</p><span class="link">Découvrir →</span></div>
</a>""" for h, tag, t, d, img in domains) + "</div>"
    write("/outils-pedagogiques/", page("Outils pédagogiques", f"""<section class="wrap">
  <h1>Notre catalogue d'outils</h1>
  <p class="lead">Des ressources prêtes à l'emploi pour votre classe, à destination de tous mais particulièrement des élèves à besoin éducatif particulier.</p>
  {dcards}
</section>""", "/outils-pedagogiques/"))

    # Accueil
    write("/", page("Toujours cap !", f"""<section class="hero">
  <div class="wrap hero-inner">
    <div>
      <p class="eyebrow">GS · CP · CE1 · CE2</p>
      <h1>Apprendre en jouant&nbsp;!</h1>
      <p class="lead">Un espace dédié aux enseignants du primaire. Des ressources structurées et des outils concrets pour accompagner les élèves du cycle 2 et de l'enseignement spécialisé.</p>
      <p><a class="btn" href="/outils-pedagogiques/">Explorer nos ressources</a></p>
    </div>
    <img class="hero-img" src="{WIX}5e2b25_c155231f9ab94725964005e45ffe27e2~mv2.jpg" alt="">
  </div>
</section>""", "/", jsonld=[
        {"@context": "https://schema.org", "@type": "WebSite", "name": SITE_NAME, "url": SITE + "/", "inLanguage": "fr-FR",
         "description": "Outils pédagogiques gratuits pour le cycle 2 (GS, CP, CE1, CE2) : lecture, contes du cercle conteur, numération."},
        {"@context": "https://schema.org", "@type": "Organization", "name": SITE_NAME, "url": SITE + "/", "logo": SITE + "/favicon.svg"}]),
        lastmod=max(p["date"] for p in posts)[:10])

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
    with open(os.path.join(OUT, "robots.txt"), "w") as f:
        f.write(f"User-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n")
    urls = "".join(f"  <url><loc>{SITE}{path}</loc>{f'<lastmod>{lm}</lastmod>' if lm else ''}</url>\n"
                   for path, lm in sorted(SITEMAP, key=lambda x: (x[0] != "/", x[0])))
    with open(os.path.join(OUT, "sitemap.xml"), "w") as f:
        f.write(f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}</urlset>\n')
    print(f"OK : {len(posts)} articles, {len(SITEMAP)} pages dans le sitemap")


if __name__ == "__main__":
    main()
