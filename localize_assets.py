#!/usr/bin/env python3
"""
Run once, next to veerdhara.html:   python3 localize_assets.py
Downloads every photo and PDF the page loads from veerdhara.com into
images/ and menus/, then rewrites the HTML to use those local copies.
After this the page no longer depends on the old website.
Writes index.html (ready for GitHub Pages) and keeps veerdhara.html untouched.
"""
import re, os, sys, urllib.request

SRC = "veerdhara.html"
OUT = "index.html"
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36",
      "Referer": "https://veerdhara.com/"}

html = open(SRC, encoding="utf-8").read()
urls = sorted(set(re.findall(r'https?://veerdhara\.com/wp-content/[^"\')\s]+', html)))
os.makedirs("images", exist_ok=True)
os.makedirs("menus", exist_ok=True)

failed = []
for u in urls:
    name = os.path.basename(u.split("?")[0])
    folder = "menus" if name.lower().endswith(".pdf") else "images"
    local = f"{folder}/{name}"
    if not os.path.exists(local):
        try:
            req = urllib.request.Request(u, headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r, open(local, "wb") as f:
                f.write(r.read())
            print("ok  ", local)
        except Exception as e:
            print("FAIL", u, e)
            failed.append(u)
            continue
    html = html.replace(u, local)

html = html.replace('<meta name="referrer" content="no-referrer">\n', '')
open(OUT, "w", encoding="utf-8").write(html)
print(f"\nWrote {OUT}. {len(urls)-len(failed)}/{len(urls)} files localised.")
if failed:
    print("These still point at the old site (download manually):")
    for u in failed: print(" ", u)
