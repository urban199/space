#!/usr/bin/env python3
"""Local static serving; no game backend, no private project files served."""
import argparse
import mimetypes
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js':'application/javascript', '.mjs':'application/javascript', '.svg':'image/svg+xml'}
    def list_directory(self, path):
        self.send_error(404, 'Directory listing disabled')
        return None
    def end_headers(self):
        self.send_header('Cache-Control','no-cache')
        self.send_header('X-Content-Type-Options','nosniff')
        super().end_headers()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Jalankan ASTRA secara lokal (hanya folder public/ atau dist/).')
    parser.add_argument('--host', default='127.0.0.1', help='Default loopback; 0.0.0.0 untuk uji LAN yang sengaja Anda izinkan')
    parser.add_argument('--port', type=int, default=int(os.environ.get('GAME_PORT','8791')))
    parser.add_argument('--built', action='store_true', help='sajikan hasil build dist/ alih-alih public/')
    args = parser.parse_args()
    directory=ROOT/('dist' if args.built else 'public')
    if not (directory/'index.html').is_file(): parser.error('Folder situs belum siap; jalankan python3 scripts/build.py untuk dist/')
    server=ThreadingHTTPServer((args.host,args.port),partial(Handler,directory=str(directory)))
    print(f'ASTRA: http://{args.host}:{server.server_port}/ ({directory.name}/)',flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()
