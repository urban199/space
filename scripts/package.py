#!/usr/bin/env python3
"""Create a source ZIP outside this project, with an explicit portable manifest."""
import argparse
import hashlib
import re
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
FILES = ['README.md','PRD-GAME.md','VERIFICATION.md','server.py','setup.sh','run-game.sh','requirements.txt','requirements-dev.txt','package.json','.gitignore']
DIRECTORIES = ['public','tests','scripts','.github']
DENIED = {'__pycache__','.git','.venv','node_modules','test-results','dist','session-cache','browser-profile'}


def main():
    parser=argparse.ArgumentParser(description='Buat ZIP source ASTRA, termasuk workflow Pages; tanpa cache/secrets.')
    parser.add_argument('output',type=Path,help='File ZIP tujuan di luar folder proyek; file yang sudah ada tidak ditimpa')
    args=parser.parse_args()
    output=args.output.expanduser().resolve()
    if output.is_relative_to(ROOT): parser.error('Letakkan ZIP di luar direktori proyek.')
    if output.exists(): parser.error('File tujuan sudah ada; pilih nama baru.')
    selected=[ROOT/name for name in FILES]
    selected += [p for dirname in DIRECTORIES for p in (ROOT/dirname).rglob('*') if p.is_file() and not any(part in DENIED for part in p.relative_to(ROOT).parts) and p.suffix not in {'.pyc','.log','.zip'}]
    selected=sorted(set(selected))
    if any(not p.is_file() for p in selected): parser.error('Ada file wajib paket yang belum ada.')
    for p in selected:
        if p.is_symlink() or p.name.startswith('.env') or any(part in DENIED for part in p.relative_to(ROOT).parts):
            parser.error('Symlink/secret/runtime file rejected: '+str(p.relative_to(ROOT)))
    names={f'space-explorer/{p.relative_to(ROOT).as_posix()}':p for p in selected}
    before={name:hashlib.sha256(path.read_bytes()).hexdigest() for name,path in names.items()}
    # Recognizable credential formats; never print matches/values.
    secret_patterns=[rb'-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----[\s\S]+?-----END',rb'ghp_[A-Za-z0-9]{36}',rb'AKIA[0-9A-Z]{16}']
    for p in selected:
        content=p.read_bytes()
        if any(re.search(pattern,content) for pattern in secret_patterns):
            parser.error('Possible secret in '+str(p.relative_to(ROOT))+'; value not displayed.')
    output.parent.mkdir(parents=True,exist_ok=True)
    with ZipFile(output,'x',ZIP_DEFLATED,compresslevel=9) as archive:
        for name,path in names.items():archive.write(path,name)
    with ZipFile(output) as archive:
        assert archive.testzip() is None, 'ZIP CRC failure'
        assert set(archive.namelist()) == set(names), 'ZIP manifest mismatch'
        for name,path in names.items():
            assert hashlib.sha256(archive.read(name)).hexdigest()==before[name],name
            assert hashlib.sha256(path.read_bytes()).hexdigest()==before[name],name
        assert 'space-explorer/.github/workflows/pages.yml' in archive.namelist()
    digest=hashlib.sha256(output.read_bytes()).hexdigest()
    print(f'ZIP verified: {output}\nEntries: {len(names)}\nBytes: {output.stat().st_size}\nSHA256: {digest}')

if __name__=='__main__':main()
