"""src/* + data.json + img.json -> index.html (one self-contained page)."""
import json, os, re
HERE = os.path.dirname(os.path.abspath(__file__))
BRAND = os.path.join(HERE, "..", "..", "frontend", "src", "components", "Brand.jsx")
brand = open(BRAND).read()
paths = {k: re.search(rf'{k}: "([^"]+)"', brand).group(1) for k in ("ink", "accent")}
src = lambda n: open(os.path.join(HERE, "src", n)).read()
js = "\n".join(src(n) for n in ("core.js", "recap.js", "preview.js", "weekly.js", "player.js", "team.js", "app.js"))
data = open(os.path.join(HERE, "data.json")).read().replace("</", "<\\/")
img = open(os.path.join(HERE, "img.json")).read()
page = src("page.html")
# The two fonts as data URIs (fetch_img.py downloads them): one face per family with a weight range.
import base64
def face(family, file, weights):
    data = base64.b64encode(open(os.path.join(HERE, "fonts", file), "rb").read()).decode()
    return f'@font-face{{font-family:"{family}";src:url(data:font/woff2;base64,{data}) format("woff2");font-weight:{weights};font-style:normal;}}'
fonts = face("Inter", "Inter-latin.woff2", "400 800") + face("JetBrains Mono", "JetBrainsMono-latin.woff2", "500 800")
page = page.replace("__FONTS_JSON__", json.dumps(fonts)).replace("__FONTS__", fonts)
page = page.replace("__MARK__", json.dumps(paths)).replace("__DATA__", data).replace("__IMG__", img).replace("__JS__", js)
out = os.path.join(HERE, "index.html")
open(out, "w").write(page)
# The publish wraps the page in a skeleton; local checks need one of their own.
open(os.path.join(HERE, "preview.html"), "w").write(
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>' + page + "</body></html>")
print("index.html", os.path.getsize(out) // 1024, "kB")
