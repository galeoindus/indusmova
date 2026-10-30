#!/usr/bin/env python3
"""Generate static, indexable article pages for indusmova's curated topics.

Each page is real HTML: lead, quick facts, a numbered table of contents,
numbered sections with inline citations, a reference list, related topics and
a link into the interactive app. They use the site's own stylesheets, so they
look like the site, and they carry the attribution and modification notice the
licence requires.

Run:  python3 scripts/gen_articles.py   (needs beautifulsoup4 and lxml)
"""

import html
import json
import os
import re
import time
import urllib.parse
import urllib.request
from bs4 import BeautifulSoup, NavigableString

# The repository root, so the script can be run from anywhere.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# The article body reads the way the breakdown reads: one point per sentence.
# Kept inline so each generated page stays standalone.
POINTS_STYLE = '''
    .points-prose { margin: 0 0 18px; padding-left: 22px; display: grid; gap: 8px; }
    .points-prose > li { line-height: 1.62; max-width: 72ch; }
    .points-prose > li::marker { color: var(--copper, #b46a45); }
'''

# The sentence-splitting used to be an inline <script>, which the site's
# Content-Security-Policy blocks (script-src 'self'). It now lives in
# assets/js/article-points.js and is loaded as a module like every other
# script on the site.
POINTS_SCRIPT = '\n<script type="module" src="/assets/js/article-points.js?v=5.1.0" defer></script>'

ORIGIN = "https://indusmova.pages.dev"
LANG = "en"
UA = "indusmova/3.0 (static article generator; contact bholasee8816@gmail.com)"

TOPICS = [
    "Chandrayaan-3", "Unified Payments Interface", "Indian independence movement",
    "Artificial intelligence", "Vedas", "Black hole", "Ayurveda", "Chess",
    "Ashoka", "Chandrayaan-2", "ISRO", "Photosynthesis", "World Wide Web",
]

DROP = [
    "script", "style", "link", "meta", "noscript",
    ".mw-editsection", ".mw-empty-elt", ".navbox", ".vertical-navbox",
    ".metadata", ".ambox", ".mbox", ".sistersitebox", ".side-box", ".sidebar",
    ".hatnote", ".rellink", ".dablink", ".seealso", ".shortdescription",
    "#toc", ".toc", ".mw-jump-link", ".noprint", ".mw-indicators",
    ".mw-references-wrap", ".reflist", ".references", ".catlinks", "#catlinks",
    ".mw-authority-control", ".authority-control",
    ".mbox-image", ".ombox", ".tmbox", ".cmbox", ".fmbox",
    "math", "annotation", ".mwe-math-mathml-inline", ".mwe-math-mathml-display",
    ".navigation-not-searchable", ".mw-cite-backlink", ".mw-kartographer-maplink",
    ".quotebox", ".infobox", "table.infobox",
]

KEEP_ATTRS = {"href", "src", "srcset", "alt", "title", "class", "id", "colspan",
              "rowspan", "scope", "width", "height", "lang", "dir", "loading", "decoding"}
KEEP_TAGS = {"p", "div", "span", "b", "strong", "i", "em", "u", "s", "sub", "sup", "br", "hr",
             "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "dl", "dt", "dd",
             "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption",
             "figure", "figcaption", "img", "a", "blockquote", "q", "cite", "code", "pre",
             "abbr", "time", "mark", "small", "ruby", "rt", "rp", "bdi", "bdo", "dfn", "kbd", "samp", "var"}

MAX_REFS = 100
SKIP_SECTIONS = re.compile(r"^(references|notes|external links|see also|further reading|"
                           r"bibliography|sources|citations|footnotes|works cited)$", re.I)


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def api(params):
    params = dict(params, format="json", formatversion="2", origin="*")
    url = f"https://{LANG}.wikipedia.org/w/api.php?" + urllib.parse.urlencode(params)
    return fetch(url)


def slug(title):
    return title.strip().replace(" ", "_")


def strip_noise(text):
    """Drop pronunciation asides and collapse whitespace."""
    ipa = re.compile(r"[\u0250-\u02af\u02c8\u02cc\u02b0-\u02ff\u1d00-\u1d7f]")
    def repl(m):
        return " " if ipa.search(m.group(0)) else m.group(0)
    text = re.sub(r"\([^()]*\)", repl, text)
    text = re.sub(r"\[[^\[\]]*\]", repl, text)
    return re.sub(r"\s+", " ", text).strip()


def clean_document(html_text):
    soup = BeautifulSoup(html_text, "lxml")
    for wrapper in soup.select(".mw-parser-output"):
        wrapper.unwrap()
    # Modern MediaWiki wraps every heading in a <div class="mw-heading">; left
    # in place, the headings never look like top-level blocks.
    for wrapper in soup.select(".mw-heading"):
        wrapper.unwrap()

    # Maths: keep the rendered image, drop the LaTeX annotation.
    for node in soup.select(".mwe-math-element"):
        img = node.find("img")
        if img:
            node.replace_with(img)
        else:
            node.decompose()

    # Read the reference texts while the list is still in the document.
    texts = {}
    for li in soup.select("li[id^=cite_note], ol.references > li, .references > li"):
        if not li.get("id") or li["id"] in texts:
            continue
        t = strip_noise(li.get_text(" ", strip=True))
        if t:
            texts[li["id"]] = t

    for sel in DROP:
        for node in soup.select(sel):
            node.decompose()

    # Number the citations the way a reader meets them: 1, 2, 3 in the order
    # they appear in the text — after the junk is gone, so a marker inside a
    # navbox cannot take a number.
    def target_of(sup):
        link = sup.find("a", href=re.compile(r"^#cite_(note|ref)"))
        return urllib.parse.unquote(link["href"][1:]) if link and link.get("href") else ""

    sups = soup.select("sup.reference")
    sequence = []
    for sup in sups:
        t = target_of(sup)
        if t and t not in sequence:
            sequence.append(t)

    refs, number = [], {}
    for target in sequence:
        if target in texts:
            refs.append(texts[target])
            number[target] = len(refs)
    for lid, t in texts.items():
        if lid not in number:
            refs.append(t)
            number[lid] = len(refs)

    fallback = len(refs)
    for sup in sups:
        target = target_of(sup)
        n = number.get(target)
        if not n:
            fallback += 1
            n = fallback
        new = soup.new_tag("sup", **{"class": "cite"})
        a = soup.new_tag("a", href=f"#ref-{n}")
        a.string = f"[{n}]"
        new.append(a)
        sup.replace_with(new)

    # Strip everything not on the allow-list.
    for node in soup.find_all(True):
        if node.name not in KEEP_TAGS:
            node.unwrap()
            continue
        for attr in list(node.attrs):
            if attr.lower() not in KEEP_ATTRS:
                del node.attrs[attr]
        if node.name == "img":
            src = node.get("src", "")
            if src.startswith("//"):
                node["src"] = "https:" + src
            node["loading"] = "lazy"
            node["decoding"] = "async"
        if node.name == "a":
            href = node.get("href", "")
            node.attrs.pop("class", None)
            if href.startswith("/wiki/"):
                title = urllib.parse.unquote(href[len("/wiki/"):]).replace("_", " ")
                if re.match(r"^(File|Special|Help|Category|Portal|Wikipedia|Template|Talk|Draft):", title):
                    node.unwrap()
                    continue
                node["href"] = f"/#/article/{urllib.parse.quote(slug(title))}"
            elif href.startswith("#cite"):
                continue
            elif href.startswith("/"):
                node.unwrap()
                continue
            elif href.startswith("http"):
                node["target"] = "_blank"
                node["rel"] = "noopener noreferrer"
            elif href.startswith("#"):
                pass
            else:
                node.unwrap()

    # Tables scroll on their own instead of breaking the column.
    for table in soup.find_all("table"):
        wrapper = soup.new_tag("div", **{"class": "table-scroll"})
        table.wrap(wrapper)

    return soup, refs


def build(title):
    parsed = api({"action": "parse", "page": title, "redirects": 1,
                  "prop": "text|sections|displaytitle|revid|langlinks",
                  "disableeditsection": 1, "disabletoc": 1})
    if "parse" not in parsed:
        return None
    p = parsed["parse"]
    summary = api({"action": "query", "titles": p["title"], "prop": "extracts|pageimages|description|info",
                   "exintro": 1, "explaintext": 1, "exchars": 500, "piprop": "thumbnail",
                   "pithumbsize": 800, "inprop": "url"})
    page = (summary.get("query", {}).get("pages") or [{}])[0]

    soup, refs = clean_document(p["text"])

    # Sections: level-2 and level-3 headings, with Wikipedia's own numbers.
    sections = [s for s in p.get("sections", []) if s.get("level") in ("2", "3") and not SKIP_SECTIONS.match(s.get("line", ""))]

    blocks = list(soup.children)

    def heading_of(node):
        if getattr(node, "name", None) in ("h2", "h3", "h4"):
            return node
        return None

    lead_html = []
    first = next((i for i, b in enumerate(blocks) if heading_of(b)), len(blocks))
    for b in blocks[:first]:
        lead_html.append(str(b))

    section_html = []
    i = 0
    while i < len(blocks):
        h = heading_of(blocks[i])
        if not h:
            i += 1
            continue
        level = int(h.name[1])
        heading = strip_noise(h.get_text(" ", strip=True))
        content = []
        j = i + 1
        while j < len(blocks):
            nxt = heading_of(blocks[j])
            if nxt and int(nxt.name[1]) <= level:
                break
            content.append(blocks[j])
            j += 1
        body = "".join(str(x) for x in content)
        # Wikipedia's own trailing sections (and its duplicate reference list)
        # are not ours to republish; empty sections are not worth a heading.
        text_only = re.sub(r"<[^>]+>", " ", body)
        if not SKIP_SECTIONS.match(heading) and len(re.sub(r"\s+", " ", text_only).strip()) > 60:
            section_html.append({
                "id": h.get("id", ""),
                "heading": heading,
                "level": level,
                "html": body,
            })
        i = j

    # Give each heading its number from the API where we can match it.
    numbers = {s["anchor"]: s.get("number", "") for s in p.get("sections", [])}
    for sec in section_html:
        sec["number"] = numbers.get(sec["id"], "")

    infobox = None
    raw_infobox = BeautifulSoup(p["text"], "lxml").select_one("table.infobox")
    if raw_infobox:
        facts = []
        for tr in raw_infobox.select("tr"):
            th, td = tr.find("th"), tr.find("td")
            if not th or not td:
                continue
            label = strip_noise(th.get_text(" ", strip=True))
            value = strip_noise(td.get_text(" ", strip=True))
            if not label or not value or len(label) > 60 or len(value) > 300:
                continue
            facts.append((label, value))
            if len(facts) >= 12:
                break
        if facts:
            infobox = facts

    thumb = (page.get("thumbnail") or {}).get("source", "")
    lead_text = strip_noise(page.get("extract") or "")

    return {
        "title": p["title"],
        "display": BeautifulSoup(p.get("displaytitle", p["title"]), "lxml").get_text() or p["title"],
        "revid": p.get("revid"),
        "description": page.get("description", ""),
        "leadText": lead_text,
        "thumb": thumb,
        "infobox": infobox,
        "sections": section_html,
        "leadHtml": "".join(lead_html),
        "refs": refs,
        "langlinks": [l for l in (p.get("langlinks") or []) if l.get("lang") in
                      ("hi", "bn", "ta", "te", "mr", "gu", "kn", "ml", "pa", "ur")][:8],
        "wikiUrl": f"https://{LANG}.wikipedia.org/wiki/{urllib.parse.quote(slug(p['title']))}",
    }


NAV = """      <nav class="topnav" aria-label="Primary">
        <a href="/#/">Ask</a>
        <a href="/#/library">Library</a>
        <a href="/topics/">Topics</a>
        <a href="/questions/">Questions</a>
        <a href="/how-it-works/">How it works</a>
      </nav>"""

HEAD = """<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title} — indusmova</title>
  <meta name="description" content="{description}">
  <link rel="canonical" href="{canonical}">
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
  <meta name="theme-color" content="#101713">
  <meta property="og:type" content="article">
  <meta property="og:title" content="{title} — indusmova">
  <meta property="og:description" content="{description}">
  <meta property="og:url" content="{canonical}">
  <meta property="og:site_name" content="indusmova">
  <link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&amp;family=Lora:ital,wght@0,500;0,600&amp;family=Space+Grotesk:wght@500;600;700&amp;display=swap">
  <link rel="stylesheet" href="/assets/css/styles.css?v=5.1.0">
  <link rel="stylesheet" href="/assets/css/app.css?v=5.1.0">
  <link rel="stylesheet" href="/assets/css/responsive.css?v=5.1.0">
  <script type="application/ld+json">{jsonld}</script>
</head>
<body>
  <div class="grain" aria-hidden="true"></div>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="topbar">
    <div class="topbar-inner">
      <a class="brand" href="/#/">
        <span class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 40 40"><defs><linearGradient id="bm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#173b32"></stop><stop offset="1" stop-color="#b46a45"></stop></linearGradient></defs><rect width="40" height="40" rx="12" fill="url(#bm)"></rect><g fill="none" stroke="#f5f0e6" stroke-width="2.7" stroke-linecap="round"><path d="M10.2 16.5c2.85-3.5 5.7-3.5 8.55 0s5.7 3.5 8.55 0"></path><path d="M12.4 23.5c2.85-3.5 5.7-3.5 8.55 0s5.7 3.5 8.55 0"></path></g></svg>
        </span>
        <span class="brand-text"><strong>indusmova</strong><small>Wikipedia, understood</small></span>
      </a>
{nav}
    </div>
  </header>

  <main id="main" class="wrap" tabindex="-1">
    <nav class="crumbs" aria-label="Breadcrumb">
      <ol>
        <li><a href="/#/">Home</a></li>
        <li><a href="/topics/">Topics</a></li>
        <li><span aria-current="page">{title}</span></li>
      </ol>
    </nav>

    <div class="article-head">
      <span class="kicker">Wikipedia · {lang}.wikipedia.org</span>
      <h1 class="article-title">{title}</h1>
      <p class="article-sub">{lead}</p>
    </div>

    <div class="article-actions">
      <a class="btn btn-primary" href="/#/article/{slug_enc}">Open in indusmova</a>
      <a class="btn btn-ghost" href="/#/ask?q={title_enc}">Ask about it</a>
      <a class="btn btn-ghost" href="/chat/?q={title_enc}">Chat about it</a>
      <a class="btn btn-ghost" href="{wikiUrl}" target="_blank" rel="noopener noreferrer">Read on Wikipedia ↗</a>
    </div>
"""

FOOT = """  </main>

  <footer class="site-foot">
    <div class="foot-inner">
      <div class="foot-col">
        <div class="foot-brand"><strong>indusmova</strong></div>
        <p>A Wikipedia-based knowledge explorer. It turns free knowledge into a core answer, a topic-wise breakdown and Markdown you can keep.</p>
      </div>
      <div class="foot-col">
        <strong>Project</strong>
        <ul>
          <li><a href="/topics/">Topics</a></li>
          <li><a href="/questions/">Questions</a></li>
          <li><a href="/#/library">Library</a></li>
          <li><a href="/how-it-works/">How it works</a></li>
          <li><a href="/help/">Help</a></li>
          <li><a href="/#/sources">Sources &amp; attribution</a></li>
        </ul>
      </div>
      <div class="foot-col">
        <strong>Legal</strong>
        <ul>
          <li><a href="/#/privacy">Privacy</a></li>
          <li><a href="/#/terms">Terms</a></li>
          <li><a href="/#/accessibility">Accessibility</a></li>
          <li><a href="https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use" target="_blank" rel="noopener">Wikimedia Terms of Use</a></li>
        </ul>
      </div>
    </div>
    <div class="foot-legal">
      <p>Wikipedia article text is available under the Creative Commons Attribution-ShareAlike Licence (CC BY-SA 4.0). Wikidata data is released under CC0 1.0. Files on Wikimedia Commons carry their own licence, shown with each image. indusmova is an independent reader and is not affiliated with or endorsed by the Wikimedia Foundation.</p>
      <p>indusmova reformats, condenses and reorders this text for reading. The original, with its full edit history, is at <a href="{wikiUrl}" target="_blank" rel="noopener noreferrer">{lang}.wikipedia.org</a>.</p>
      <p class="foot-version">indusmova v{version}</p>
    </div>
  </footer>
{points}</body>
</html>
"""


def page_html(art, related):
    canonical = f"{ORIGIN}/articles/{slug(art['title'])}/"
    description = (art["description"] or art["leadText"] or art["title"])[:155]
    jsonld = json.dumps({
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": art["title"],
        "description": description,
        "url": canonical,
        "inLanguage": LANG,
        "isBasedOn": art["wikiUrl"],
        "license": "https://creativecommons.org/licenses/by-sa/4.0/",
        "publisher": {"@type": "Organization", "name": "indusmova", "url": ORIGIN + "/"},
        "isAccessibleForFree": True,
    }, ensure_ascii=False)

    lead = html.escape(strip_noise(art["leadText"])[:320])
    out = [HEAD.format(
        title=html.escape(art["title"]),
        description=html.escape(description),
        canonical=canonical,
        nav=NAV,
        lang=LANG,
        lead=lead,
        slug_enc=urllib.parse.quote(slug(art["title"])),
        title_enc=urllib.parse.quote(art["title"]),
        wikiUrl=art["wikiUrl"],
        jsonld=jsonld,
    )]

    if art["thumb"]:
        out.append(f'    <figure class="art-figure" style="justify-items:start">\n'
                   f'      <img src="{html.escape(art["thumb"])}" alt="{html.escape(art["title"])}" width="800" height="450" loading="eager" decoding="async">\n'
                   f'    </figure>\n')

    out.append('    <div class="article-grid rail-open">\n')
    out.append('      <div class="panel">\n')

    if art["infobox"]:
        rows = "\n".join(
            f'          <div class="row"><dt>{html.escape(k)}</dt><dd>{html.escape(v)}</dd></div>'
            for k, v in art["infobox"])
        out.append(f'        <div class="factbox" style="margin-bottom:22px">\n'
                   f'          <h3>Quick facts<span class="factbox-src">{html.escape(art["title"])}</span></h3>\n'
                   f'          <dl>\n{rows}\n          </dl>\n        </div>\n')

    out.append(f'        <div class="prose">\n{art["leadHtml"]}\n')

    for sec in art["sections"]:
        num = f'{sec["number"]} ' if sec["number"] else ""
        out.append(f'<h2 id="{html.escape(sec["id"])}">{html.escape(num + sec["heading"])}</h2>\n')
        out.append(sec["html"] + "\n")

    out.append('        </div>\n')

    if art["refs"]:
        shown = art["refs"][:MAX_REFS]
        lis = "\n".join(f'          <li id="ref-{i+1}">{html.escape(r)}</li>' for i, r in enumerate(shown))
        more = ""
        if len(art["refs"]) > MAX_REFS:
            more = (f'          <p class="src-credit">Showing the first {MAX_REFS} of {len(art["refs"])} references. '
                    f'The complete list is at <a href="{art["wikiUrl"]}" target="_blank" rel="noopener noreferrer">{LANG}.wikipedia.org</a>.</p>\n')
        out.append(f'        <section class="sec" id="references">\n'
                   f'          <div class="sec-head"><h2>References</h2><span class="more">{len(art["refs"])}</span></div>\n'
                   f'          <ol class="reference-list">\n{lis}\n          </ol>\n{more}        </section>\n')

    out.append('      </div>\n')

    toc = ['      <aside class="toc-rail">\n        <div class="toc">\n          <h3>Sections</h3>\n']
    for sec in art["sections"]:
        cls = ' class="lvl3"' if sec["level"] == 3 else ""
        num = f'{sec["number"]} ' if sec["number"] else ""
        toc.append(f'          <a href="#{html.escape(sec["id"])}"{cls}>{html.escape(num + sec["heading"])}</a>\n')
    toc.append('        </div>\n      </aside>\n')
    out.append("".join(toc))
    out.append('    </div>\n')

    if related:
        cards = "".join(
            f'        <a class="card" href="/articles/{urllib.parse.quote(slug(r))}/">'
            f'<div class="card-thumb placeholder" aria-hidden="true"></div>'
            f'<div class="card-body"><h3>{html.escape(r)}</h3>'
            f'<p>Read the full breakdown of {html.escape(r)}.</p></div></a>\n'
            for r in related)
        out.append(f'    <section class="sec">\n'
                   f'      <div class="sec-head"><h2>Related topics</h2></div>\n'
                   f'      <div class="grid">\n{cards}      </div>\n    </section>\n')

    if art["langlinks"]:
        pills = "".join(
            f'<a class="pill" href="/#/article/{urllib.parse.quote(slug(l.get("title", "")))}?lang={l["lang"]}">{l["lang"].upper()}</a>'
            for l in art["langlinks"])
        out.append(f'    <div class="langbar"><div class="langbar-inner"><span>Also available in:</span>'
                   f'<div class="pill-row">{pills}</div></div></div>\n')

    out.append(FOOT.format(wikiUrl=art["wikiUrl"], lang=LANG, version=VERSION, points=POINTS_SCRIPT))
    return "".join(out)


# ── one picture, one place ────────────────────────────────────────────────
# Wikipedia's galleries and thumbs can repeat the same file, and a repeated
# picture is the thing a reader notices first. Every generated page is
# deduped by file name before it is written: the first occurrence stays
# where Wikipedia put it, the later copies (and their empty gallery cells)
# are dropped. Small repeated icons — chess pieces, map pins — are left
# alone, because there they are the diagram.

_IMG_FILE = re.compile(r"/thumb/[0-9a-f]/[0-9a-f]{2}/([^/]+)/", re.I)
_ICONISH = re.compile(r"(chess_|chessboard|red_pog|blue_pog|symbol|_icon|flag_|commons-logo|edit-ltr)", re.I)


def _file_key(src):
    src = (src or "").split("?")[0]
    m = _IMG_FILE.search(src)
    return (m.group(1) if m else src.split("/")[-1]).lower()


def dedupe_images(html_text):
    soup = BeautifulSoup(html_text, "html.parser")
    seen = set()
    for img in list(soup.find_all("img")):
        if img.attrs is None or img.parent is None:
            continue
        key = _file_key(img.get("src"))
        if not key or _ICONISH.search(key):
            continue
        if key in seen:
            block = (img.find_parent("li", class_="gallerybox")
                     or img.find_parent("figure")
                     or img.find_parent("div", class_="thumb"))
            if block is not None:
                block.decompose()
            else:
                img.decompose()
        else:
            seen.add(key)
    return str(soup)


def main():
    built = {}
    for i, topic in enumerate(TOPICS):
        try:
            art = build(topic)
        except Exception as exc:  # noqa: BLE001
            print(f"  ! {topic}: {exc}")
            continue
        if not art:
            print(f"  ! {topic}: no article")
            continue
        built[art["title"]] = art
        print(f"  · {topic}: {len(art['sections'])} sections, {len(art['refs'])} refs, infobox={bool(art['infobox'])}")
        time.sleep(0.4)

    titles = list(built)
    for title, art in built.items():
        related = [t for t in titles if t != title][:3]
        out_dir = os.path.join(ROOT, "articles", slug(title))
        os.makedirs(out_dir, exist_ok=True)
        with open(os.path.join(out_dir, "index.html"), "w", encoding="utf-8") as fh:
            fh.write(dedupe_images(page_html(art, related)))
    print(f"wrote {len(built)} article pages")

    # A sitemap that includes them.
    urls = [f"{ORIGIN}/", f"{ORIGIN}/articles/", f"{ORIGIN}/topics/", f"{ORIGIN}/questions/",
            f"{ORIGIN}/how-it-works/", f"{ORIGIN}/help/"]
    urls += [f"{ORIGIN}/articles/{slug(t)}/" for t in titles]
    entries = "\n".join(f"  <url>\n    <loc>{u}</loc>\n    <changefreq>weekly</changefreq>\n"
                        f"    <priority>{'1.0' if u.endswith('/') and u.count('/') == 3 else '0.7'}</priority>\n  </url>"
                        for u in urls)
    with open(os.path.join(ROOT, "sitemap.xml"), "w", encoding="utf-8") as fh:
        fh.write('<?xml version="1.0" encoding="UTF-8"?>\n'
                 '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                 f"{entries}\n</urlset>\n")
    print("sitemap.xml updated")

    # A crawlable index of the static articles.
    cards = "".join(
        f'      <a class="card" href="/articles/{urllib.parse.quote(slug(t))}/">'
        f'<div class="card-thumb placeholder" aria-hidden="true"></div>'
        f'<div class="card-body"><h3>{html.escape(t)}</h3>'
        f'<p>{html.escape((built[t]["description"] or built[t]["leadText"])[:150])}</p></div></a>\n'
        for t in titles)
    index = f"""<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Articles — indusmova</title>
  <meta name="description" content="The full indusmova articles: lead summary, quick facts, a numbered table of contents, sections, references and related topics.">
  <link rel="canonical" href="{ORIGIN}/articles/">
  <meta name="theme-color" content="#101713">
  <link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&amp;family=Lora:ital,wght@0,500;0,600&amp;family=Space+Grotesk:wght@500;600;700&amp;display=swap">
  <link rel="stylesheet" href="/assets/css/styles.css?v=5.1.0">
  <link rel="stylesheet" href="/assets/css/app.css?v=5.1.0">
  <link rel="stylesheet" href="/assets/css/responsive.css?v=5.1.0">
</head>
<body>
  <div class="grain" aria-hidden="true"></div>
  <header class="topbar"><div class="topbar-inner">
    <a class="brand" href="/#/"><span class="brand-text"><strong>indusmova</strong><small>Wikipedia, understood</small></span></a>
{NAV}
  </div></header>
  <main id="main" class="wrap" tabindex="-1">
    <div class="article-head">
      <span class="kicker">{len(titles)} full articles</span>
      <h1 class="article-title">Articles</h1>
      <p class="article-sub">Each one has a lead summary, quick facts, a numbered table of contents, sections with citations, a reference list and related topics. For any other topic, ask indusmova.</p>
    </div>
    <div class="grid">
{cards}    </div>
{FOOT.format(wikiUrl=f"https://{LANG}.wikipedia.org/", lang=LANG, version=VERSION, points=POINTS_SCRIPT)}
"""
    os.makedirs(os.path.join(ROOT, "articles"), exist_ok=True)
    with open(os.path.join(ROOT, "articles", "index.html"), "w", encoding="utf-8") as fh:
        fh.write(index)
    print("articles/index.html written")


if __name__ == "__main__":
    main()
