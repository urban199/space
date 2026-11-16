#!/usr/bin/env python3
"""Validate and assemble the client-only static site (Python standard library)."""
import argparse
import hashlib
import json
import re
import shutil
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'
REQUIRED = ['index.html', 'style.css', 'icon.svg', 'game.js', 'core.mjs', 'vendor/three.module.js', 'vendor/THREE-LICENSE.txt']

class References(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.ids = set()
    def handle_starttag(self, tag, attrs):
        attr = dict(attrs)
        if 'id' in attr:
            if attr['id'] in self.ids:
                raise ValueError('Duplicate HTML ID: ' + attr['id'])
            self.ids.add(attr['id'])
        if tag in {'link', 'script', 'img'}:
            for key in ('src', 'href'):
                if attr.get(key): self.links.append(attr[key])

def validate():
    for rel in REQUIRED:
        if not (PUBLIC / rel).is_file():
            raise ValueError('Required file missing: public/' + rel)
    files = sorted(p for p in PUBLIC.rglob('*') if p.is_file())
    for p in PUBLIC.rglob('*'):
        if p.is_symlink():
            raise ValueError('Symlinks cannot be published: ' + str(p))
    parser = References()
    parser.feed((PUBLIC / 'index.html').read_text(encoding='utf-8'))
    references = [(PUBLIC/'index.html', r) for r in parser.links]
    for p in files:
        if p.suffix in {'.js', '.mjs', '.html'}:
            text = p.read_text(encoding='utf-8')
            references.extend((p, r) for r in re.findall(r'(?:from\s*|import\s*\(\s*)[\"\']([^\"\']+)[\"\']', text))
        if p.suffix == '.css':
            references.extend((p, r.strip(' \"\'')) for r in re.findall(r'url\(([^)]+)\)', p.read_text(encoding='utf-8')))
    for source, ref in references:
        parts = urlsplit(ref)
        if parts.scheme == 'data' or ref.startswith('#'): continue
        if parts.scheme or parts.netloc or ref.startswith('/'):
            raise ValueError(f'Use relative local assets for project Pages: {source.name}: {ref}')
        target = (source.parent / unquote(parts.path)).resolve()
        if not target.is_relative_to(PUBLIC.resolve()) or not target.is_file():
            raise ValueError(f'Asset missing or outside public/: {source.name}: {ref}')
    return files

def main():
    parser = argparse.ArgumentParser(description='Validasi lalu bangun dist/ untuk static hosting; tanpa dependency eksternal.')
    parser.add_argument('--check', action='store_true', help='validasi aset tanpa menulis dist/')
    args = parser.parse_args()
    files = validate()
    if args.check:
        print(f'Validated {len(files)} public files; all asset paths are project-Pages relative.')
        return
    dist = ROOT/'dist'
    if dist.is_symlink():
        raise SystemExit('Refusing symlink dist/')
    if dist.exists(): shutil.rmtree(dist)
    shutil.copytree(PUBLIC, dist)
    (dist/'.nojekyll').touch()
    manifest = {p.relative_to(PUBLIC).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    (dist/'asset-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    for rel, digest in manifest.items():
        assert hashlib.sha256((dist/rel).read_bytes()).hexdigest() == digest, rel
    print(f'Built dist/: {len(files)} verified assets + .nojekyll + asset-manifest.json')

if __name__ == '__main__':
    main()
