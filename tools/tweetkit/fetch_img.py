"""Headshots and logos as data URIs -> img.json. Uses curl (system Python lacks certs)."""
import base64, hashlib, json, os, re, subprocess
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
need = json.load(open(os.path.join(HERE, "need_images.json")))
CACHE = os.path.join(HERE, "img"); os.makedirs(CACHE, exist_ok=True)
FACE = "f_webp,q_78,w_220,h_220,c_fill,g_face"

def fetch(key, url, mime):
    path = os.path.join(CACHE, re.sub(r"[^\w.-]", "_", key))
    if not os.path.exists(path) or os.path.getsize(path) == 0:
        subprocess.run(["curl", "-sfL", "-o", path, url], check=False)
    if not os.path.exists(path) or os.path.getsize(path) == 0:
        return key, None, None
    raw = open(path, "rb").read()
    return key, hashlib.md5(raw).hexdigest(), f"data:{mime};base64," + base64.b64encode(raw).decode()

jobs = []
for pid, url in need["headshots"].items():
    small = re.sub(r"/image/(upload|private)/[^/]*/", lambda m: f"/image/{m.group(1)}/{FACE}/", url, count=1)
    jobs.append((f"p:{pid}", small, "image/webp"))
for abbr in need["teams"]:
    code = abbr.lower()
    jobs.append((f"l:{abbr}", f"https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/{code}.png&w=160&h=160", "image/png"))
    jobs.append((f"ld:{abbr}", f"https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500-dark/{code}.png&w=160&h=160", "image/png"))

with ThreadPoolExecutor(12) as pool:
    results = list(pool.map(lambda job: fetch(*job), jobs))
hashes = Counter(h for k, h, _ in results if h and k.startswith("p:"))
out, dropped, failed = {}, [], []
for key, digest, uri in results:
    if uri is None:
        failed.append(key); continue
    if key.startswith("p:") and hashes[digest] > 1:
        dropped.append(key); continue
    out[key] = uri
json.dump(out, open(os.path.join(HERE, "img.json"), "w"))

# Inter and JetBrains Mono for build.py to embed (Latin subset, variable weight).
FONTS = os.path.join(HERE, "fonts"); os.makedirs(FONTS, exist_ok=True)
if not all(os.path.exists(os.path.join(FONTS, f)) for f in ("Inter-latin.woff2", "JetBrainsMono-latin.woff2")):
    ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    css = subprocess.run(["curl", "-s", "-A", ua, "https://fonts.googleapis.com/css2?family=Inter:wght@400..800&family=JetBrains+Mono:wght@500..800&display=swap"], capture_output=True, text=True).stdout
    for subset, body in re.findall(r"/\* ([\w-]+) \*/\s*@font-face \{(.*?)\}", css, re.S):
        if subset == "latin":
            family = re.search(r"font-family: '([^']+)'", body).group(1).replace(" ", "")
            url = re.search(r"url\((https://[^)]+\.woff2)\)", body).group(1)
            subprocess.run(["curl", "-s", "-o", os.path.join(FONTS, f"{family}-latin.woff2"), url], check=True)
print(len(out), "images,", sum(len(v) for v in out.values()) // 1024, "kB; dropped generic", len(dropped), "failed", failed[:10])
