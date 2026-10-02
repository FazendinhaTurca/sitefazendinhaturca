#!/usr/bin/env python3
from pathlib import Path
from urllib.parse import urlparse, unquote
import re
import sys

SITE_HOST = "www.fazendinhaturca.com.br"
ROOT = Path(".").resolve()
EXCLUDED_ORPHANS = {
    "painel.html",
    "cadastro.html",
    "google9a606173601a7049.html",
}

files = sorted(p.relative_to(ROOT).as_posix() for p in ROOT.rglob("*.html"))
file_set = set(files)
incoming = {p: 0 for p in files}
broken = []
seen_broken = set()

href_re = re.compile(
    r'<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s>]+))',
    re.I,
)

def normalize_target(source, href):
    href = unquote(href.strip().split("#", 1)[0].split("?", 1)[0])
    if not href:
        return None

    parsed = urlparse(href)
    if parsed.scheme or parsed.netloc:
        if parsed.scheme in ("http", "https") and parsed.netloc == SITE_HOST:
            path = parsed.path
        else:
            return "EXTERNAL"
    elif href.startswith("//"):
        return "EXTERNAL"
    elif href.startswith("/"):
        path = href
    else:
        path = "/" + str(Path(source).parent / href).replace("\\", "/")

    path = re.sub(r"/+", "/", path)
    path = path.lstrip("/")
    if not path:
        path = "index.html"
    if path.endswith("/"):
        path += "index.html"
    return path

for source in files:
    html = (ROOT / source).read_text(encoding="utf-8", errors="replace")
    for match in href_re.finditer(html):
        href = next((x for x in match.groups() if x is not None), "").strip()
        if not href or href.startswith("#") or re.match(r"^(mailto:|tel:|javascript:|data:)", href, re.I):
            continue

        target = normalize_target(source, href)
        if target in (None, "EXTERNAL"):
            continue

        if target not in file_set:
            key = (source, href, target)
            if key not in seen_broken:
                seen_broken.add(key)
                broken.append(key)
        else:
            incoming[target] += 1

print(f"Auditoria de links internos: {len(files)} páginas HTML analisadas.")

if broken:
    print("\nLINKS INTERNOS QUEBRADOS:")
    for source, href, target in broken:
        print(f"  - {source} -> {href} (alvo inexistente: {target})")
    raise SystemExit(f"\nFalha: {len(broken)} referência(s) interna(s) apontam para páginas inexistentes.")

orphans = [p for p in files if incoming[p] == 0 and p not in EXCLUDED_ORPHANS]
if orphans:
    print("\nPÁGINAS SEM LINKS INTERNOS DE ENTRADA (órfãs):")
    for page in orphans:
        print(f"  - {page}")
    print("\nAviso: páginas órfãs não interrompem o deploy; elas devem ser revisadas para decidir se precisam de links internos.")
else:
    print("Nenhuma página órfã encontrada fora das exceções administrativas/técnicas.")

print(f"Links internos válidos mapeados: {sum(incoming.values())}.")
