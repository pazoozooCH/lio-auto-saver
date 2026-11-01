#!/usr/bin/env python3
"""Webserver für Auto-Retter.

Liefert das Spiel aus und erzeugt /version.js aus dem Git-Stand:
Versionsnummer = Anzahl Commits, dazu Zeitpunkt und Kurz-Hash des letzten Commits.

    python3 serve.py                      # im ganzen LAN auf Port 8123
    python3 serve.py --port 8124 --host 127.0.0.1   # nur lokal, z.B. zum Testen
    python3 serve.py --write-version _site/version.js   # Datei schreiben (für GitHub Pages)
"""
import argparse
import http.server
import json
import os
import subprocess

ROOT = os.path.dirname(os.path.abspath(__file__))


def git(*args):
    try:
        return subprocess.run(['git', *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return ''


def version_js():
    info = {
        'number': int(git('rev-list', '--count', 'HEAD') or 0),
        'date': git('log', '-1', '--format=%cI'),
        'commit': git('rev-parse', '--short', 'HEAD'),
        'dirty': bool(git('status', '--porcelain')),
    }
    return 'window.GAME_VERSION = ' + json.dumps(info) + ';\n'


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.webmanifest': 'application/manifest+json'}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        path = self.path.split('?')[0]
        # Versteckte Dateien (.git, .claude, ...) nicht ins LAN geben
        if any(part.startswith('.') for part in path.split('/') if part):
            self.send_error(404)
            return
        if path == '/version.js':
            body = version_js().encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/javascript; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def end_headers(self):
        # Immer die neueste Version laden, auch auf Tablets im LAN
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--host', default='0.0.0.0', help='Adresse (Standard: alle, also im ganzen LAN)')
    parser.add_argument('--port', type=int, default=8123)
    parser.add_argument('--write-version', metavar='DATEI', help='version.js schreiben und beenden')
    args = parser.parse_args()

    if args.write_version:
        with open(args.write_version, 'w', encoding='utf-8') as f:
            f.write(version_js())
        return

    server = http.server.ThreadingHTTPServer((args.host, args.port), Handler)
    print(f'Auto-Retter läuft auf http://{args.host}:{args.port}', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
