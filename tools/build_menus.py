#!/usr/bin/env python3
"""
Builds the readable (text) menu pages from data/menus.json.

  python3 tools/build_menus.py

Outputs one page per menu (a-la-carte-menu.html, chefs-special-menu.html, maharaja-set-menu.html),
adds a "Read online" row to menu.html, and lists the pages in sitemap.xml.

To change a dish or price: edit data/menus.json, then run this script again.
The PDFs in menus/ are separate files and have to be updated on their own.
"""
import json, os, re, html

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
BOOK = "https://booking.resdiary.com/widget/Standard/VeerDhara/8554"
SITE = "https://veerdhara.com"
# menus hidden from the Menu page in certain months (festive.js removes them; months are 1-12)
HIDE = {"maharaja-set-menu": ' data-hide-months="11,12"'}

data = json.load(open("data/menus.json", encoding="utf-8"))
shell = open("chef.html", encoding="utf-8").read()      # reuse the site header, band and footer
head = shell[:shell.index("<body>")]
top = shell[shell.index("<body>"):shell.index("</nav>") + len("</nav>")]
tail = shell[shell.index('<div class="takeaway"'):]


def esc(s):
    return html.escape(s, quote=False)


def money(p):
    return "£" + p if p and p[0].isdigit() else p


def sentence(s):
    s = s.strip()
    return s[:1].upper() + s[1:] if s else s


def schema(m):
    sections = []
    for s in m["sections"]:
        items = []
        for i in s["items"]:
            it = {"@type": "MenuItem", "name": i["name"]}
            if i.get("desc"):
                it["description"] = sentence(i["desc"])
            p = i.get("price", "")
            mm = re.fullmatch(r"\d+(\.\d\d)?", p)
            if mm:
                it["offers"] = {"@type": "Offer", "price": p, "priceCurrency": "GBP"}
            items.append(it)
        sections.append({"@type": "MenuSection", "name": s["title"], "hasMenuItem": items})
    return {"@context": "https://schema.org", "@type": "Menu", "name": m["title"] + " Menu",
            "url": f"{SITE}/{m['slug']}", "inLanguage": "en-GB", "hasMenuSection": sections}


def page(m):
    h = head
    h = re.sub(r"<title>.*?</title>", f"<title>{m['seo_title']}</title>", h, count=1, flags=re.S)
    for pat in (r'(<meta name="description" content=")[^"]*(")', r'(<meta property="og:description" content=")[^"]*(")',
                r'(<meta name="twitter:description" content=")[^"]*(")'):
        h = re.sub(pat, lambda x: x.group(1) + m["seo_desc"].replace("\\", "\\\\") + x.group(2), h, count=1)
    for pat in (r'(<meta property="og:title" content=")[^"]*(")', r'(<meta name="twitter:title" content=")[^"]*(")'):
        h = re.sub(pat, lambda x: x.group(1) + m["seo_title"] + x.group(2), h, count=1)
    h = h.replace("https://veerdhara.com/chef", f"{SITE}/{m['slug']}")
    h = re.sub(r'<script type="application/ld\+json">.*?</script>\n', "", h, flags=re.S)
    h = h.replace('<link rel="preconnect"', '<script type="application/ld+json">' + json.dumps(schema(m), ensure_ascii=False) + '</script>\n<link rel="preconnect"', 1)

    chips = "".join(f'<a href="#{s["id"]}">{esc(s["title"].replace("Main Course: ", ""))}</a>' for s in m["sections"] if s.get("id"))
    out = [f'''

<header class="page-hero">
  <a class="back-link" href="menu.html">&larr; All menus</a>
  <div class="sec-label">Menu</div>
  <h1>{m["h1"]}</h1>
  <p>{esc(m["intro"])}</p>''']
    if m.get("price_line"):
        out.append(f'  <p class="mt-price">{esc(m["price_line"])}</p>')
    out.append(f'''  <div class="btn-row">
    <a class="btn-p" href="{BOOK}" target="_blank" rel="noopener" data-book>Book a Table</a>
    <a class="btn-g" href="{m["pdf"]}" target="_blank" rel="noopener">Download PDF</a>
  </div>
</header>

<section class="menu-text">
  <div class="mt-chips" role="navigation" aria-label="Menu sections">{chips}</div>''')
    for s in m["sections"]:
        out.append(f'  <div class="mt-sec"{(" id=" + chr(34) + s["id"] + chr(34)) if s.get("id") else ""}>')
        out.append(f'    <h2>{esc(s["title"])}</h2>')
        if s.get("note") and not s["note"].startswith(("Tandoor", "A tawa", "Dum")) and len(s["note"]) < 90:
            out.append(f'    <p class="mt-note">{esc(s["note"])}</p>')
        elif s.get("note"):
            out.append(f'    <p class="mt-about">{esc(s["note"])}</p>')
        out.append('    <div class="mt-grid">')
        for i in s["items"]:
            price = f'<span class="mi-price">{esc(money(i["price"]))}</span>' if i.get("price") else ""
            desc = f'<p>{esc(sentence(i["desc"]))}</p>' if i.get("desc") else ""
            note = f'<p class="mi-note">{esc(i["note"])}</p>' if i.get("note") else ""
            out.append(f'      <article class="mi"><div class="mi-top"><h3>{esc(i["name"])}</h3>{price}</div>{desc}{note}</article>')
        out.append("    </div>\n  </div>")
    out.append('  <div class="mt-foot">' + "".join(f"<p>{esc(n)}</p>" for n in m["notes"]) + "</div>\n</section>\n\n")
    return h + top + "".join(out) + tail


pages = []
for key, m in data.items():
    open(f"{m['slug']}.html", "w", encoding="utf-8").write(page(m))
    pages.append(m)
    print("built", m["slug"] + ".html")

# "Read online" row on the Menu page
mh = open("menu.html", encoding="utf-8").read()
row = ('<div class="menu-read reveal"><span>Read online</span>'
       + "".join(f'<a{HIDE.get(m["slug"], "")} href="{m["slug"]}.html">{esc(m["title"])}</a>' for m in pages) + "</div>\n\n  ")
mh = re.sub(r'<div class="menu-read reveal">.*?</div>\n\n  ', "", mh, flags=re.S)
anchor = '<div class="menu-pdfs reveal"'
assert anchor in mh
mh = mh.replace(anchor, row + anchor, 1)
open("menu.html", "w", encoding="utf-8").write(mh)

# sitemap
sm = open("sitemap.xml", encoding="utf-8").read()
for m in pages:
    loc = f"{SITE}/{m['slug']}"
    if loc not in sm:
        sm = sm.replace("</urlset>", f"  <url><loc>{loc}</loc><lastmod>2026-11-05</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>\n</urlset>")
open("sitemap.xml", "w", encoding="utf-8").write(sm)
